const fs = require('fs');

function searchFile(filename) {
  const content = fs.readFileSync(filename, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('new THREE.')) {
        console.log(`${filename}:${i+1} ${line.trim()}`);
    }
  }
}

searchFile('core-1.1.0.js');
