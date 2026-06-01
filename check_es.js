const fs = require('fs');
const acorn = require('acorn');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  try {
    acorn.parse(scriptMatch[1], { ecmaVersion: 2019 });
    console.log("No ES2020+ syntax found.");
  } catch(e) {
    console.error("Syntax Error:", e.message);
  }
} else {
  console.log("No script tag found.");
}
