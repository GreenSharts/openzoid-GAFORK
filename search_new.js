const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('update(e)')) {
        let snippet = lines.slice(i, i+30).join('\n');
        if (snippet.includes('new ')) {
            console.log(`\n==== ${filename}:${i+1} ====\n${snippet}`);
        }
    }
  }
}

searchFile('ui-1.1.0.js');
