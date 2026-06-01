const fs = require('fs');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatch) {
  scriptMatch.forEach((tag, idx) => {
    let content = tag.replace(/<\/?script[^>]*>/g, '');
    try {
      acorn.parse(content, { ecmaVersion: 5 });
    } catch(e) {
      console.error(`Syntax Error in block ${idx} (ES5):`, e.message);
    }
  });
}
