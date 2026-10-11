// Post-build: inline JS + CSS into a single self-contained dist/index.html.
// This lets the dashboard run by double-clicking the file (file://) on ANY
// device, not just when served over HTTP.
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dist = join(process.cwd(), 'dist');
const htmlPath = join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

// Inline the stylesheet.
const cssMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\.?\/?([^"]+\.css)"[^>]*>/);
if (cssMatch) {
  const css = readFileSync(join(dist, cssMatch[1].replace(/^\.\//, '')), 'utf8');
  html = html.replace(cssMatch[0], `<style>\n${css}\n</style>`);
}

// Inline the module script (escape any closing tags so they can't break out).
const jsMatch = html.match(/<script[^>]+type="module"[^>]+src="\.?\/?([^"]+\.js)"[^>]*><\/script>/);
if (jsMatch) {
  let js = readFileSync(join(dist, jsMatch[1].replace(/^\.\//, '')), 'utf8');
  js = js.replace(/<\/script>/gi, '<\\/script>');
  html = html.replace(jsMatch[0], `<script type="module">\n${js}\n</script>`);
}

writeFileSync(htmlPath, html);
console.log(`Inlined assets -> single-file ${htmlPath} (${(html.length / 1024).toFixed(1)} KB)`);
