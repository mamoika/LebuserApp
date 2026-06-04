const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');

const polyfills = lines.slice(14, 44);
const styles = lines.slice(46, 2435);
const app = lines.slice(3023, 5655);

lines.splice(3023, 5655 - 3023, "<!-- @include 'js/app.js' -->");
lines.splice(46, 2435 - 46, "<!-- @include 'css/style.css' -->");
lines.splice(14, 44 - 14, "<!-- @include 'js/polyfills.js' -->");

fs.writeFileSync('src/index.html', lines.join('\n'));
console.log('src/index.html generated');
