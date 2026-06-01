const fs = require('fs');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
if (scriptMatch) {
  scriptMatch.forEach((tag, idx) => {
    let content = tag.replace(/<\/?script[^>]*>/g, '');
    try {
      acorn.parse(content, { ecmaVersion: 2016 });
      console.log(`Block ${idx} passes ES2016`);
    } catch(e) {
      console.error(`Syntax Error in block ${idx} (ES2016):`, e.message);
    }
  });
}
