const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>');
if (styleStart !== -1 && styleEnd !== -1) {
  const css = html.substring(styleStart + 7, styleEnd);
  fs.writeFileSync('src/css/style.css', css.trim() + '\n');
}

const scripts = [];
let scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  scripts.push(match[1]);
}

if (scripts.length >= 2) {
  fs.writeFileSync('src/js/polyfills.js', scripts[0].trim() + '\n');
  fs.writeFileSync('src/js/app.js', scripts[1].trim() + '\n');
}

let remainingHtml = html;
remainingHtml = remainingHtml.replace(/<style>[\s\S]*?<\/style>/, "<!-- @include 'css/style.css' -->");
remainingHtml = remainingHtml.replace(/<script>[\s\S]*?<\/script>/, "<!-- @include 'js/polyfills.js' -->");
remainingHtml = remainingHtml.replace(/<script>[\s\S]*?<\/script>/, "<!-- @include 'js/app.js' -->");

fs.writeFileSync('src/index.html', remainingHtml);
console.log('Split done!');
