const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('update(e)')) {
        let snippet = lines.slice(Math.max(0, i-5), Math.min(lines.length, i+15)).join('\n');
        // Let's see all update(e) bodies to find bottlenecks
        console.log(`==== ${filename}:${i+1} ====\n${snippet}`);
    }
  }
}

searchFile('core-1.1.0.js');
