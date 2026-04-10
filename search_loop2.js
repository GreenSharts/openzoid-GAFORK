const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('for (') && line.includes('length')) {
        let match = line.match(/for \([^;]*;([^;]*);[^\)]*\)/);
        if (match) {
            let cond = match[1];
            if (cond.includes('.length') && !line.includes(',')) {
                // If the loop condition directly computes .length and we aren't caching it
                if (!line.includes('var ') && !line.includes('let ')) continue; // ignore ones without decls
                console.log(`${filename}:${i+1} ${line.trim()}`);
            }
        }
    }
  }
}

searchFile('core-1.1.0.js');
searchFile('ui-1.1.0.js');
