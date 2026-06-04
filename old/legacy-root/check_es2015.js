const fs = require('fs');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  try {
    acorn.parse(scriptMatch[1], { ecmaVersion: 2015 });
    console.log("No ES6+ (beyond ES2015) syntax found.");
  } catch(e) {
    console.error("Syntax Error in ES2015:", e.message);
  }
}
