const H = require('./tests/helpers.js');
const L = require('./logic.js');
const os = require('os'), path = require('path'), fs = require('fs');
console.log('Loudness Check');
// 1. filter coefficients against the published BS.1770 values at 48 kHz
const [sh, hp] = L.kWeighting(48000);
H.near(sh.b[0], 1.53512485958697, 1e-6, 'shelf b0 at 48 kHz');
H.near(sh.b[1], -2.69169618940638, 1e-6, 'shelf b1 at 48 kHz');
H.near(sh.a[0], -1.69065929318241, 1e-6, 'shelf a1 at 48 kHz');
H.near(hp.a[0], -1.99004745483398, 1e-6, 'high-pass a1 at 48 kHz');
H.near(hp.a[1], 0.99007225036621, 1e-6, 'high-pass a2 at 48 kHz');
// 2. compare with ffmpeg ebur128 on test signals
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
function ebur(file) {
  const r = H.ff(['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr, tail = r.slice(r.lastIndexOf('Summary:'));
  return { I: +/I:\s+(-?[\d.]+) LUFS/.exec(tail)[1], LRA: +/LRA:\s+([\d.]+) LU/.exec(tail)[1], TP: +/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)[1] };
}
function build(name, sr, secs, gen) {
  const n = sr * secs, L1 = new Float32Array(n), R1 = new Float32Array(n), rnd = H.rng(3);
  for (let i = 0; i < n; i++) { const [l, r] = gen(i / sr, rnd); L1[i] = l; R1[i] = r; }
  const inter = new Float32Array(n * 2); for (let i = 0; i < n; i++) { inter[2 * i] = L1[i]; inter[2 * i + 1] = R1[i]; }
  const f = path.join(tmp, name + '.wav'); H.writeWav(f, inter, sr, 2); return { f, ch: [L1, R1], sr };
}
const cases = [
  ['sine', 48000, 20, (t) => { const v = 0.1 * Math.sin(2 * Math.PI * 1000 * t); return [v, v]; }],
  ['music-like', 48000, 40, (t, r) => { const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.15 * t), v = 0.25 * env * (0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 1320 * t) + 0.2 * (r() * 2 - 1)); return [v, 0.8 * v]; }],
  ['speech-gaps', 44100, 40, (t, r) => { const on = (t % 8) < 5, v = on ? 0.3 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) * (0.5 * Math.sin(2 * Math.PI * 300 * t) + 0.5 * (r() * 2 - 1)) : 0.001 * (r() * 2 - 1); return [v, v]; }],
  ['loud-peaks', 48000, 20, (t, r) => { const v = 0.9 * Math.sin(2 * Math.PI * 3000 * t + 0.7) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t)); return [v, v]; }]
];
for (const [name, sr, secs, gen] of cases) {
  const s = build(name, sr, secs, gen), m = L.measure(s.ch, s.sr), e = ebur(s.f);
  H.near(m.integrated, e.I, 0.1, name + ': integrated loudness matches ffmpeg (' + e.I + ' LUFS)');
  H.near(m.lra, e.LRA, 1.0, name + ': loudness range matches ffmpeg (' + e.LRA + ' LU)');
  H.near(m.truePeakDb, e.TP, 0.35, name + ': true peak matches ffmpeg (' + e.TP + ' dBTP)');
}
// 3. gating: adding silence must not change the integrated loudness
const a = build('a', 48000, 20, (t) => { const v = 0.1 * Math.sin(2 * Math.PI * 1000 * t); return [v, v]; });
const b = build('b', 48000, 40, (t) => { const v = t < 20 ? 0.1 * Math.sin(2 * Math.PI * 1000 * t) : 0; return [v, v]; });
H.near(L.measure(b.ch, 48000).integrated, L.measure(a.ch, 48000).integrated, 0.05, 'silence is gated out of the integrated loudness');
// 4. platform verdicts
const m = { integrated: -9.2, truePeakDb: -0.3 };
H.ok(/Turned down by about 4.8 dB/.test(L.verdict(m, L.TARGETS[0]).text), 'YouTube turns a -9.2 LUFS video down by 4.8 dB');
H.ok(/not turned up/.test(L.verdict({ integrated: -20, truePeakDb: -3 }, L.TARGETS[0]).text), 'YouTube does not turn quiet video up');
H.ok(L.verdict({ integrated: -23.2, truePeakDb: -1.5 }, L.TARGETS[4]).ok && !L.verdict({ integrated: -23.2, truePeakDb: -0.5 }, L.TARGETS[4]).ok, 'EBU R128 passes at -23.2 LUFS / -1.5 dBTP and fails at -0.5 dBTP');
H.ok(/volume=-4.8dB/.test(L.commands({ integrated: -9.2 }, -14, -1)), 'ffmpeg gain command uses the difference');
H.done('loudness-check logic');
