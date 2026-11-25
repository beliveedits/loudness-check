/*! Loudness Check. MIT licence. Needs kit-core.js, kit.js and logic.js. */
(function () {
  'use strict';
  var $ = FT.$, L = window.LCLogic;
  var state = { name: '', m: null };

  function f1(x) { return isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-inf'; }

  function stats() {
    var m = state.m;
    $('#stats').innerHTML =
      '<div><b>' + f1(m.integrated) + '</b><span>Integrated LUFS</span></div>' +
      '<div><b>' + f1(m.truePeakDb) + '</b><span>True peak dBTP</span></div>' +
      '<div><b>' + f1(m.lra) + '</b><span>Loudness range LU</span></div>' +
      '<div><b>' + f1(m.shortTermMax) + '</b><span>Loudest 3 s LUFS</span></div>' +
      '<div><b>' + f1(m.momentaryMax) + '</b><span>Loudest 0.4 s LUFS</span></div>' +
      '<div><b>' + f1(m.samplePeakDb) + '</b><span>Sample peak dBFS</span></div>';
  }

  function platforms() {
    var m = state.m, rows = '';
    L.TARGETS.forEach(function (t) {
      var v = L.verdict(m, t), cls = t.mode === 'deliver' ? (v.ok ? 'ok' : 'bad') : '';
      rows += '<tr><td>' + FT.esc(t.name) + '</td><td class="num">' + t.lufs + ' LUFS</td><td' + (cls ? ' class="' + cls + '"' : '') + '>' + FT.esc(v.text) + '</td><td>' + FT.esc(t.note) + '</td></tr>';
    });
    $('#plat').innerHTML = rows;
  }

  function fix() {
    var m = state.m, tgt = parseFloat($('#tgt').value), tpc = parseFloat($('#tpc').value);
    if (!isFinite(tgt) || !isFinite(tpc)) return;
    var gain = Math.round((tgt - m.integrated) * 10) / 10, after = m.truePeakDb + gain;
    $('#fixNote').textContent = 'To reach ' + tgt + ' LUFS the level changes by ' + (gain > 0 ? '+' : '') + gain + ' dB. A plain gain change would put the true peak at ' + f1(after) + ' dBTP' +
      (after > tpc ? ', above your ' + tpc + ' dBTP ceiling, so use the limiter version or turn the target down.' : ', inside your ' + tpc + ' dBTP ceiling, so the simple gain is safe.');
    $('#cmd').textContent = L.commands(m, tgt, tpc);
    draw();
  }

  function draw() {
    var m = state.m, cv = $('#curve'), f = FT.fitCanvas(cv), g = f.g, w = f.w, h = f.h, lo = -50, hi = 0;
    g.fillStyle = FT.cssVar('--film') || '#0d1015'; g.fillRect(0, 0, w, h);
    function X(t) { return t / m.duration * w; }
    function Y(v) { return h - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * h; }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.font = '11px system-ui, sans-serif'; g.fillStyle = '#8b94a5';
    [-40, -30, -20, -10, 0].forEach(function (v) { var y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText(v + '', 4, y - 3); });
    var tgt = parseFloat($('#tgt').value);
    if (isFinite(tgt)) { g.strokeStyle = '#ff6b5b'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, Y(tgt)); g.lineTo(w, Y(tgt)); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff6b5b'; g.fillText('target ' + tgt, w - 70, Y(tgt) - 4); }
    g.strokeStyle = '#9aa4b5'; g.lineWidth = 1.5; g.beginPath(); var started = false;
    m.curve.forEach(function (p) { if (!isFinite(p.v)) { started = false; return; } var x = X(p.t), y = Y(p.v); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }); g.stroke();
    if (isFinite(m.integrated)) { g.strokeStyle = '#e8ecf4'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, Y(m.integrated)); g.lineTo(w, Y(m.integrated)); g.stroke(); g.setLineDash([]); }
    $('#curveNote').textContent = 'Grey line: loudness over the last 3 seconds. White dotted line: integrated loudness (' + f1(m.integrated) + ' LUFS). Red dashed line: your target.';
  }

  function show(name, ch, sr) {
    FT.status($('#status'), 'Measuring ' + name + '...'); $('#barwrap').hidden = false; $('#bar').style.width = '75%';
    setTimeout(function () {
      var m;
      try { m = L.measure(ch, sr); } catch (e) { FT.status($('#status'), 'Could not measure that audio.', 'error'); $('#barwrap').hidden = true; return; }
      $('#barwrap').hidden = true;
      if (!isFinite(m.integrated)) { $('#results').hidden = true; FT.status($('#status'), 'That file is silent, or too short to measure (it needs at least 0.4 seconds of sound).', 'error'); return; }
      state.m = m; state.name = name; $('#results').hidden = false;
      stats(); platforms(); fix();
      FT.status($('#status'), name + ': ' + f1(m.integrated) + ' LUFS integrated, true peak ' + f1(m.truePeakDb) + ' dBTP.');
    }, 30);
  }

  function openFile(file) {
    FT.status($('#status'), 'Reading audio from ' + file.name + '...'); $('#barwrap').hidden = false; $('#bar').style.width = '35%';
    FT.decodeAudio(file, 48000).then(function (d) { show(file.name, d.channels, d.sampleRate); },
      function () { $('#barwrap').hidden = true; FT.status($('#status'), 'This browser could not read audio from that file. Try an MP3, WAV or H.264 MP4.', 'error'); });
  }

  // generated voice-over: speech-like bursts over quiet room tone, a little loud on purpose
  function sample() {
    var sr = 48000, dur = 30, n = sr * dur, a = new Float32Array(n), r = FT.rng(11), lp = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr, on = (t % 6) < 4.2, syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t), n0 = r() * 2 - 1; lp += 0.12 * (n0 - lp);
      var voice = (0.55 * Math.sin(2 * Math.PI * 140 * t) + 0.25 * Math.sin(2 * Math.PI * 420 * t) + 0.2 * lp * 3) * syl;
      a[i] = on ? 0.42 * voice : 0.002 * n0;
    }
    return { channels: [a, a], sampleRate: sr };
  }

  function report() {
    var m = state.m, tgt = parseFloat($('#tgt').value), tpc = parseFloat($('#tpc').value), s = [];
    s.push('Loudness report for ' + state.name, 'Measured in the browser with ITU-R BS.1770-4 (K-weighting, gated).', '');
    s.push('Integrated loudness: ' + f1(m.integrated) + ' LUFS', 'Loudness range: ' + f1(m.lra) + ' LU', 'True peak: ' + f1(m.truePeakDb) + ' dBTP', 'Sample peak: ' + f1(m.samplePeakDb) + ' dBFS', 'Loudest 3 s: ' + f1(m.shortTermMax) + ' LUFS', 'Loudest 0.4 s: ' + f1(m.momentaryMax) + ' LUFS', 'Duration: ' + FT.fmtDur(m.duration), '');
    L.TARGETS.forEach(function (t) { s.push(t.name + ' (' + t.lufs + ' LUFS): ' + L.verdict(m, t).text); });
    s.push('', 'Target ' + tgt + ' LUFS, ceiling ' + tpc + ' dBTP:', L.commands(m, tgt, tpc));
    return s.join('\n');
  }

  function wire() {
    FT.dropzone($('#drop'), $('#file'), function (f) { openFile(f[0]); });
    $('#pick').addEventListener('click', function () { $('#file').click(); });
    $('#sample').addEventListener('click', function () { var d = sample(); show('generated-voice-over.wav', d.channels, d.sampleRate); });
    ['tgt', 'tpc'].forEach(function (id) { $('#' + id).addEventListener('input', function () { if (state.m) fix(); }); });
    $('#cpCmd').addEventListener('click', function () { FT.copy($('#cmd').textContent, $('#cpCmd')); });
    $('#dlRep').addEventListener('click', function () { FT.download(FT.baseName(state.name).replace(/[^\w.-]+/g, '_') + '-loudness-report.txt', report(), 'text/plain;charset=utf-8'); });
    window.addEventListener('resize', function () { if (state.m) draw(); });
    window.LC = { state: state };
  }
  wire();
})();
