import { renderToString } from 'react-dom/server';
import React from 'react';
import App from './react-app/src/App.jsx';
try {
  console.log("Rendering App...");
  const html = renderToString(React.createElement(App));
  console.log("Success! HTML length:", html.length);
} catch (err) {
  console.error("Error during render:", err);
}
