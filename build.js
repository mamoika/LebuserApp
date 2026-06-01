const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outputFile = path.join(__dirname, 'index.html');

console.log('Building index.html...');

try {
  let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

  // Regex to match <!-- @include 'filename' -->
  const includeRegex = /<!--\s*@include\s+'([^']+)'\s*-->/g;

  html = html.replace(includeRegex, (match, filename) => {
    const filePath = path.join(srcDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`Including ${filename}...`);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // return the raw content, tags are handled in src/index.html
      return content;
    } else {
      console.warn(`WARNING: Included file ${filename} not found!`);
      return match;
    }
  });

  fs.writeFileSync(outputFile, html);
  console.log('Build successful! index.html generated.');
} catch (err) {
  console.error('Build failed:', err);
}
