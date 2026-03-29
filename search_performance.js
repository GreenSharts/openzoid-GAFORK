const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find missing var/let declarations
    if (line.match(/^\s*[a-zA-Z_]\w*\s*=[^=]/)) {
        if (!line.includes("this.") && !line.includes("=") && !line.includes("==")) {
             continue;
        }
    }
  }
}

searchFile('core-1.0.102.js');
searchFile('ui-1.0.72.js');
