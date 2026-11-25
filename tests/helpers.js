// Test helpers: WAV read/write and ffmpeg access for Node tests.
const fs = require('fs');
const cp = require('child_process');
function writeWav(path, data, sr, channels) {
  channels = channels || 1;
  const n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2 * channels, 28); buf.writeUInt16LE(2 * channels, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, buf);
}
function readWav(path) {
  const b = fs.readFileSync(path); let o = 12, fmt = null, data = null;
  while (o < b.length - 8) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') { data = b.subarray(o + 8, o + 8 + sz); break; } o += 8 + sz + (sz & 1); }
  const n = data.length / 2 / fmt.ch, chans = []; for (let c = 0; c < fmt.ch; c++) chans.push(new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = data.readInt16LE((i * fmt.ch + c) * 2) / 32768;
  const mono = new Float32Array(n); for (let c = 0; c < fmt.ch; c++) for (let i = 0; i < n; i++) mono[i] += chans[c][i] / fmt.ch;
  return { sr: fmt.sr, chans, mono, n };
}
function ff(args) { return cp.spawnSync('ffmpeg', args, { encoding: 'utf8' }); }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let failed = 0, passed = 0;
function ok(cond, msg) { if (cond) { passed++; console.log('  ok   ' + msg); } else { failed++; console.log('  FAIL ' + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + (typeof a === 'number' ? a.toFixed(3) : a) + ', want ' + b + ' ± ' + tol + ')'); }
function done(name) { console.log(name + ': ' + passed + ' passed, ' + failed + ' failed'); if (failed) process.exit(1); }
module.exports = { writeWav, readWav, ff, rng, ok, near, done };
