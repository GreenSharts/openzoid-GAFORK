const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // check for .value = new
    if (line.includes('value = new ') || line.includes('value: new ') || line.includes('.set(')) {
        if (!line.includes("this.") && !line.includes("= ")) {
             continue;
        }
    }
  }
}

searchFile('core-1.0.102.js');
