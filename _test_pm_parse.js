// Test PM JSON parsing from queue.js
const proper = `Here is my plan:

\`\`\`json
[
  { "name": "Setup Backend", "agent": "backend", "instructions": "Create server" },
  { "name": "Build UI", "agent": "frontend", "instructions": "React app" },
  { "name": "Test", "agent": "qa_tester", "instructions": "Run tests" }
]
\`\`\`

Good luck!`;

const match = proper.match(/```json\n([\s\S]*?)\n```/);
const rawJson = match ? match[1] : proper;
try {
    const parsed = JSON.parse(rawJson.trim().replace(/^```json/, '').replace(/```$/, '').trim());
    console.log('PM JSON parse: OK (' + parsed.length + ' phases)');
    parsed.forEach((p, i) => console.log(`  Phase ${i+1}: ${p.name} -> @${p.agent}`));
} catch(e) {
    console.error('PM JSON parse FAIL:', e.message);
}
