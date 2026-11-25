// Browser test: serves this folder and drives index.html with Playwright.
// npm i -D playwright && npx playwright install chromium, then: node tests/run-e2e.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end('not found'); } else { r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
let passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  ok   ' + m); } else { failed++; console.log('  FAIL ' + m); } }
function near(a, b, tol, m) { ok(Math.abs(a - b) <= tol, m + ' (got ' + (typeof a === 'number' ? +a.toFixed(3) : a) + ', want ' + b + ' ± ' + tol + ')'); }
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', rq => { const u = rq.url(); if (!u.startsWith('http://localhost:' + port) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  await page.goto('http://localhost:' + port + '/index.html');
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-shots-'));
  const t = { ok, near, port, shots };
  try { await require('../e2e.js')(page, t); } catch (e) { ok(false, 'scenario threw: ' + e.message.split('\n')[0]); }
  ok(errors.filter(e => !/favicon/.test(e)).length === 0, 'no console or page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  ok(external.length === 0, 'no requests leave the page' + (external.length ? ': ' + external.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  console.log('e2e: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
