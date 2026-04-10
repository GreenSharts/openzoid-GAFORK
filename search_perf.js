const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // .center() calls applyMatrix in update() !
    if (line.includes('this.center()')) {
        console.log(`\n==== ${filename}:${i+1} ====\n${line.trim()}`);
    }
  }
}

searchFile('core-1.1.0.js');
