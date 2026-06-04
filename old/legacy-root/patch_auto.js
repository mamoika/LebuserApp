const fs = require('fs');

// --- GRAFIKVIEW ---
let grafikCode = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// Update parseHours
const oldParse = `function parseHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NN' || v === 'I' || v === 'END') return 0;
  if (v.includes('+')) {
    return v.split('+').reduce((sum, part) => sum + (parseFloat(part.replace(',', '.')) || 0), 0);
  }`;
const newParse = `function parseHours(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v || v === 'W' || v === 'UW' || v === 'L4' || v === 'NN' || v === 'I' || v === 'END') return 0;
  
  if (v.includes('-')) {
    const parts = v.split('-');
    const st = parseFloat(parts[0].replace(',', '.'));
    const en = parseFloat(parts[1].replace(',', '.'));
    if (!isNaN(st) && !isNaN(en)) {
      return en >= st ? en - st : (24 - st) + en;
    }
  }
  
  if (v.includes('+')) {
    return v.split('+').reduce((sum, part) => sum + (parseFloat(part.replace(',', '.')) || 0), 0);
  }`;
grafikCode = grafikCode.replace(oldParse, newParse);

// Update getCellStyle (so '-' also gets recognized as green hours)
// Wait, currently getCellStyle checks if v parses to a number or has '+'
const oldStyleCheck = `if (v.includes('+')) return { bg: '#fff3e0', color: '#e65100' };
  if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#e8f5e9', color: '#2e7d32' };`;
const newStyleCheck = `if (v.includes('-')) return { bg: '#e3f2fd', color: '#0d47a1' }; // niebieski dla przedziałów
  if (v.includes('+')) return { bg: '#fff3e0', color: '#e65100' };
  if (!isNaN(parseFloat(v.replace(',', '.')))) return { bg: '#e8f5e9', color: '#2e7d32' };`;
grafikCode = grafikCode.replace(oldStyleCheck, newStyleCheck);

// Update legend
grafikCode = grafikCode.replace(/\[\'6\+8\',\'Start\+Godz\'\]/, "['6-14','Od-Do (godz)']");

fs.writeFileSync('react-app/src/components/GrafikView.jsx', grafikCode);

// --- TIMELINEVIEW ---
let timelineCode = fs.readFileSync('react-app/src/components/TimelineView.jsx', 'utf8');

const oldTimelineParse = `      if (isWorking && v && !isNaN(parseFloat(v.replace(',', '.')))) {
        if (v.includes('+')) {
          const parts = v.split('+');
          const st = parseFloat(parts[0].replace(',', '.'));
          const dur = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(st) && !isNaN(dur)) {
            finalStart = st;
            finalEnd = st + dur;
          }
        } else {
          const dur = parseFloat(v.replace(',', '.'));
          if (!isNaN(dur)) {
            finalEnd = finalStart + dur;
          }
        }
      }`;
      
const newTimelineParse = `      if (isWorking && v) {
        if (v.includes('-')) {
          const parts = v.split('-');
          const st = parseFloat(parts[0].replace(',', '.'));
          const en = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(st) && !isNaN(en)) {
            finalStart = st;
            finalEnd = en;
          }
        } else if (v.includes('+')) {
          const parts = v.split('+');
          const st = parseFloat(parts[0].replace(',', '.'));
          const dur = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(st) && !isNaN(dur)) {
            finalStart = st;
            finalEnd = (st + dur) % 24;
          }
        } else if (!isNaN(parseFloat(v.replace(',', '.')))) {
          const dur = parseFloat(v.replace(',', '.'));
          if (!isNaN(dur)) {
            finalEnd = (finalStart + dur) % 24;
          }
        }
      }`;
timelineCode = timelineCode.replace(oldTimelineParse, newTimelineParse);

// Update inShift check
const oldInShift = `const inShift = working && h >= startH && h < endH;`;
const newInShift = `const inShift = working && (startH <= endH ? (h >= startH && h < endH) : (h >= startH || h < endH));`;
timelineCode = timelineCode.replace(oldInShift, newInShift);

fs.writeFileSync('react-app/src/components/TimelineView.jsx', timelineCode);
