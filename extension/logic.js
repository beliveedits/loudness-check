/*! Loudness Check: ITU-R BS.1770-4 loudness, EBU R128 range and true peak. MIT licence. Pure functions, no DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LCLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // K-weighting: a high shelf then a high-pass, designed for any sample rate (BS.1770-4 values, bilinear transform).
  function kWeighting(fs) {
    // Stage 1: high shelf (about +4 dB above 1.5 kHz). Stage 2: high-pass near 38 Hz. Constants are the BS.1770-4 filter values.
    var f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    var K = Math.tan(Math.PI * f0 / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K;
    var shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
                  a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    var fh = 38.13547087602444, Qh = 0.5003270373238773, Kh = Math.tan(Math.PI * fh / fs), ah = 1 + Kh / Qh + Kh * Kh;
    var hp = { b: [1, -2, 1], a: [2 * (Kh * Kh - 1) / ah, (1 - Kh / Qh + Kh * Kh) / ah] };
    return [shelf, hp];
  }

  function makeBiquad(c) {
    var z1 = 0, z2 = 0, b0 = c.b[0], b1 = c.b[1], b2 = c.b[2], a1 = c.a[0], a2 = c.a[1];
    return function (x) { var y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y; return y; };
  }

  function channelWeights(n) { return n >= 6 ? [1, 1, 1, 0, 1.41, 1.41].concat(new Array(n - 6).fill(0)) : new Array(n).fill(1); }

  // Mean square of the K-weighted signal in each 100 ms chunk, summed over channels with their weights.
  function chunkEnergies(channels, sr) {
    var n = channels[0].length, chunk = Math.round(sr * 0.1), count = Math.floor(n / chunk), w = channelWeights(channels.length), out = new Float64Array(count);
    channels.forEach(function (x, ci) {
      if (!w[ci]) return;
      var f = kWeighting(sr).map(makeBiquad);
      for (var k = 0; k < count; k++) {
        var s = 0, a = k * chunk, b = a + chunk;
        for (var i = a; i < b; i++) { var y = f[1](f[0](x[i])); s += y * y; }
        out[k] += w[ci] * s / chunk;
      }
    });
    return out;
  }

  function toLufs(z) { return z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity; }

  function integrated(energies) {
    var blocks = [], i;
    for (i = 0; i + 4 <= energies.length; i++) blocks.push((energies[i] + energies[i + 1] + energies[i + 2] + energies[i + 3]) / 4);
    var above = blocks.filter(function (z) { return toLufs(z) > -70; });
    if (!above.length) return { lufs: -Infinity, blocks: blocks };
    var mean = above.reduce(function (a, b) { return a + b; }, 0) / above.length, gate = toLufs(mean) - 10;
    var gated = above.filter(function (z) { return toLufs(z) >= gate; });
    var m2 = gated.reduce(function (a, b) { return a + b; }, 0) / gated.length;
    return { lufs: toLufs(m2), blocks: blocks };
  }

  // EBU Tech 3342: short-term (3 s) loudness, gated at -70 LUFS and 20 LU below the average, then the 10th to 95th percentile spread.
  function loudnessRange(energies) {
    var st = [], i, j;
    for (i = 0; i + 30 <= energies.length; i++) { var s = 0; for (j = 0; j < 30; j++) s += energies[i + j]; st.push(s / 30); }
    var above = st.filter(function (z) { return toLufs(z) > -70; });
    if (above.length < 2) return { lra: 0, st: st };
    var mean = above.reduce(function (a, b) { return a + b; }, 0) / above.length, gate = toLufs(mean) - 20;
    var v = above.filter(function (z) { return toLufs(z) >= gate; }).map(toLufs).sort(function (a, b) { return a - b; });
    if (v.length < 2) return { lra: 0, st: st };
    function pct(p) { var x = p * (v.length - 1), lo = Math.floor(x), hi = Math.ceil(x); return v[lo] + (v[hi] - v[lo]) * (x - lo); }
    return { lra: pct(0.95) - pct(0.10), st: st };
  }

  // 4x oversampled peak using a windowed-sinc interpolator, checked only where the signal is within 6 dB of its sample peak.
  var TP_TAPS = 24, TP_PHASES = (function () {
    var ph = [];
    for (var p = 1; p < 4; p++) {
      var h = [], frac = p / 4, sum = 0;
      for (var k = -TP_TAPS / 2 + 1; k <= TP_TAPS / 2; k++) {
        var x = k - frac, s = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x), w = 0.5 + 0.5 * Math.cos(Math.PI * x / (TP_TAPS / 2 + 0.5));
        var v = s * w; h.push(v); sum += v;
      }
      ph.push(h.map(function (v) { return v / sum; }));
    }
    return ph;
  })();
  function truePeak(channels, samplePeak) {
    var best = samplePeak, floor = samplePeak * 0.5, half = TP_TAPS / 2;
    channels.forEach(function (x) {
      var n = x.length;
      for (var i = half; i < n - half; i++) {
        if (Math.abs(x[i]) < floor && Math.abs(x[i + 1]) < floor) continue;
        for (var p = 0; p < 3; p++) {
          var h = TP_PHASES[p], s = 0;
          for (var k = 0; k < TP_TAPS; k++) s += h[k] * x[i - half + 1 + k];
          if (Math.abs(s) > best) best = Math.abs(s);
        }
      }
    });
    return best;
  }
  function db(x) { return x > 0 ? 20 * Math.log10(x) : -Infinity; }

  function measure(channels, sr) {
    var n = channels[0].length, sp = 0;
    channels.forEach(function (x) { for (var i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > sp) sp = a; } });
    var e = chunkEnergies(channels, sr), ig = integrated(e), lr = loudnessRange(e), mom = -Infinity, stMax = -Infinity, i;
    ig.blocks.forEach(function (z) { var l = toLufs(z); if (l > mom) mom = l; });
    lr.st.forEach(function (z) { var l = toLufs(z); if (l > stMax) stMax = l; });
    var curve = lr.st.map(function (z, k) { return { t: k * 0.1 + 1.5, v: toLufs(z) }; });
    return { duration: n / sr, integrated: ig.lufs, lra: lr.lra, momentaryMax: mom, shortTermMax: stMax, samplePeakDb: db(sp), truePeakDb: db(truePeak(channels, sp)), curve: curve };
  }

  // Platform reference levels that are widely quoted. Platforms can change them, so the tool says so.
  var TARGETS = [
    { id: 'yt', name: 'YouTube', lufs: -14, mode: 'down', note: 'Turns louder videos down. Quiet videos are not turned up.' },
    { id: 'sp', name: 'Spotify (default)', lufs: -14, mode: 'both', note: 'Turns loud tracks down and quiet ones up as far as peaks allow.' },
    { id: 'am', name: 'Apple Music', lufs: -16, mode: 'both', note: 'Sound Check; quiet tracks are raised only as far as peaks allow.' },
    { id: 'az', name: 'Amazon Music', lufs: -14, mode: 'down', note: 'Turns louder tracks down.' },
    { id: 'ebu', name: 'Broadcast (EBU R128)', lufs: -23, mode: 'deliver', tol: 0.5, tp: -1, note: 'Deliver at -23 LUFS, true peak no higher than -1 dBTP.' },
    { id: 'atsc', name: 'US TV (ATSC A/85)', lufs: -24, mode: 'deliver', tol: 2, tp: -2, note: 'Deliver at -24 LKFS within 2 LU, true peak no higher than -2 dBTP.' }
  ];
  function verdict(m, t) {
    var diff = t.lufs - m.integrated, g = Math.round(diff * 10) / 10;
    if (t.mode === 'deliver') {
      var okL = Math.abs(diff) <= t.tol, okP = m.truePeakDb <= t.tp + 1e-9;
      return { gain: g, ok: okL && okP, text: (okL ? 'On target' : 'Needs ' + (g > 0 ? '+' : '') + g + ' dB') + (okP ? '' : ', true peak too high (limit ' + t.tp + ' dBTP)') };
    }
    if (t.mode === 'down') return { gain: Math.min(0, g), ok: g >= 0 ? true : false, text: g < 0 ? 'Turned down by about ' + Math.abs(g) + ' dB' : 'Left as it is (not turned up)' };
    return { gain: g, ok: Math.abs(g) < 0.5, text: g < 0 ? 'Turned down by about ' + Math.abs(g) + ' dB' : (Math.abs(g) < 0.5 ? 'About right' : 'May be turned up by about ' + g + ' dB if peaks allow') };
  }

  function commands(m, target, tp) {
    var g = Math.round((target - m.integrated) * 10) / 10;
    return 'Simple gain (keeps dynamics, may clip if peaks exceed 0 dBTP):\nffmpeg -i input.mp4 -c:v copy -af "volume=' + g + 'dB" output.mp4\n\nLoudness normalisation with a limiter (ffmpeg loudnorm, one pass):\nffmpeg -i input.mp4 -c:v copy -af "loudnorm=I=' + target + ':TP=' + tp + ':LRA=11" -ar 48000 output.mp4';
  }

  return { kWeighting: kWeighting, measure: measure, chunkEnergies: chunkEnergies, integrated: integrated, loudnessRange: loudnessRange, truePeak: truePeak, TARGETS: TARGETS, verdict: verdict, commands: commands, toLufs: toLufs, db: db };
});
