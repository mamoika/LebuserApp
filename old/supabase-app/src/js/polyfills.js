// SUPER-CATCHER
if (!String.prototype.includes) { String.prototype.includes = function(search, start) { 'use strict'; if (typeof start !== 'number') { start = 0; } if (start + search.length > this.length) { return false; } else { return this.indexOf(search, start) !== -1; } }; }
if (!Array.prototype.includes) { Object.defineProperty(Array.prototype, 'includes', { value: function(searchElement, fromIndex) { if (this == null) { throw new TypeError('"this" is null or not defined'); } var o = Object(this); var len = o.length >>> 0; if (len === 0) { return false; } var n = fromIndex | 0; var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0); function sameValueZero(x, y) { return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y)); } while (k < len) { if (sameValueZero(o[k], searchElement)) { return true; } k++; } return false; } }); }

if (window.NodeList && !NodeList.prototype.forEach) { NodeList.prototype.forEach = Array.prototype.forEach; }
if (!Object.values) { Object.values = function(obj) { return Object.keys(obj).map(function(e) { return obj[e]; }); }; }

window.onerror = function(msg, url, lineNo, columnNo, error) {
  var errText = 'CRITICAL ERROR: ' + msg + ' at line ' + lineNo + ':' + columnNo;
  var loader = document.querySelector('.loader');
  if (loader) {
    loader.textContent = errText;
    loader.style.color = 'red';
    loader.style.background = 'white';
    loader.style.padding = '10px';
    loader.style.border = '2px solid red';
  } else {
    document.body.innerHTML = '<div style="color:red;padding:20px;">' + errText + '</div>';
  }
  return false;
};
window.addEventListener("unhandledrejection", function(event) {
  var errText = 'PROMISE ERROR: ' + (event.reason ? event.reason.message : 'Unknown');
  var loader = document.querySelector('.loader');
  if (loader) { loader.textContent = errText; loader.style.color = 'red'; }
});

// Polyfills for older browsers (e.g. Safari 9, older Android) to prevent silent crashes in GAS callbacks
if (!String.prototype.includes) { String.prototype.includes = function(search, start) { 'use strict'; if (typeof start !== 'number') { start = 0; } if (start + search.length > this.length) { return false; } else { return this.indexOf(search, start) !== -1; } }; }
if (!Array.prototype.includes) { Object.defineProperty(Array.prototype, 'includes', { value: function(searchElement, fromIndex) { if (this == null) { throw new TypeError('"this" is null or not defined'); } var o = Object(this); var len = o.length >>> 0; if (len === 0) { return false; } var n = fromIndex | 0; var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0); function sameValueZero(x, y) { return x === y || (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y)); } while (k < len) { if (sameValueZero(o[k], searchElement)) { return true; } k++; } return false; } }); }
