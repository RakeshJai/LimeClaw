const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const taskModel = require('../db/models');

class Executor {
  constructor(task, promptContent) {
    this.task = task;
    this.promptContent = promptContent;
    this.process = null;
    this.isPaused = false;
  }

  // Detect rate limit errors from Gemini CLI output
  isRateLimitError(output) {
    const outputLower = output.toLowerCase();
    const rateLimitSignatures = [
      'rate limit',
      '429',
      'quota exceeded',
      'too many requests',
      'exhausted'
    ];
    return rateLimitSignatures.some(sig => outputLower.includes(sig));
  }

  async run() {
    return new Promise((resolve, reject) => {
      const { runMiMo } = require('./cascade');
      
      let cmd, args;
      if (this.task.current_engine === 'gemini') {
        cmd = 'gemini';
        args = ['--yolo', '-p', this.promptContent];
      } else if (this.task.current_engine === 'mimo') {
        logger.info(`Task ${this.task.id} executing via MiMo V2 Pro Free API...`);
        runMiMo(this.promptContent).then(result => {
           if (result.status === 'ok') {
               taskModel.addLog(this.task.id, result.output, 'stdout');
               taskModel.addLog(this.task.id, 'SYSTEM: Task completed via MiMo V2 Pro Free API', 'system');
               resolve({ status: 'completed', output: result.output });
           } else {
               taskModel.addLog(this.task.id, `MiMo Error: ${result.output}`, 'stderr');
               resolve({ status: 'failed', error: result.output });
           }
        }).catch(err => {
           resolve({ status: 'failed', error: err.message });
        });
        return; // API call handled, don't proceed to spawn
      } else {
        return reject(new Error(`Unknown engine: ${this.task.current_engine}. Valid engines: 'gemini', 'mimo'`));
      }

      logger.info(`Starting task ${this.task.id} with ${this.task.current_engine} engine in ${this.task.target_dir}`);
      taskModel.addLog(this.task.id, `SYSTEM: Starting with ${this.task.current_engine} engine...`, 'system');
      
      this.process = spawn(cmd, args, { 
        cwd: this.task.target_dir,
        shell: true 
      });

      let fullOutput = '';
      let rateLimitHit = false;

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        fullOutput += text;
        taskModel.addLog(this.task.id, text, 'stdout');
        
        if (this.isRateLimitError(text)) {
          rateLimitHit = true;
          logger.warn(`Rate limit detected in task ${this.task.id} on engine ${this.task.current_engine}`);
        }
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        fullOutput += text;
        taskModel.addLog(this.task.id, text, 'stderr');

        if (this.isRateLimitError(text)) {
          rateLimitHit = true;
          logger.warn(`Rate limit detected in task ${this.task.id} (stderr) on engine ${this.task.current_engine}`);
        }
      });

      this.process.on('close', (code) => {
        if (this.isPaused) {
          logger.info(`Task ${this.task.id} was paused manually.`);
          taskModel.addLog(this.task.id, 'SYSTEM: Process terminated due to pause.', 'system');
          return resolve({ status: 'paused' });
        }

        if (rateLimitHit) {
          taskModel.addLog(this.task.id, `SYSTEM: Rate limit exceeded by ${this.task.current_engine}`, 'system');
          return resolve({ status: 'rate_limited' });
        }

        if (code !== 0) {
          logger.error(`Task ${this.task.id} failed with exit code ${code}`);
          taskModel.addLog(this.task.id, `SYSTEM: Process exited with code ${code}`, 'system');
          return resolve({ status: 'failed', code, output: fullOutput });
        }

        logger.info(`Task ${this.task.id} completed successfully`);
        taskModel.addLog(this.task.id, 'SYSTEM: Task completed successfully', 'system');
        resolve({ status: 'completed', output: fullOutput });
      });

      this.process.on('error', (err) => {
        logger.error(`Failed to spawn process for task ${this.task.id}: ${err.message}`);
        taskModel.addLog(this.task.id, `SYSTEM ERROR: ${err.message}`, 'system');
        resolve({ status: 'failed', error: err.message });
      });
    });
  }

  pause() {
    this.isPaused = true;
    if (this.process) {
      if (process.platform === 'win32') {
        const cp = require('child_process');
        cp.exec(`taskkill /PID ${this.process.pid} /T /F`, (err) => {
            if(err) logger.error(`Failed to taskkill process: ${err.message}`);
        });
      } else {
        this.process.kill('SIGTERM');
      }
    }
  }
}

module.exports = Executor;
