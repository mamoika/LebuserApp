const fs = require('fs');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  try {
    // ES2015 parser will fail if there is a trailing comma in function args
    acorn.parse(scriptMatch[1], { ecmaVersion: 2015 });
  } catch (e) {
    console.error("Syntax Error in ES2015:", e.message);
  }
}
