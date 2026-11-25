/*! Free video and ad tools by Bhavesh Vaghela. MIT licence. Shared browser helpers. Needs kit-core.js first. */
(function () {
  'use strict';
  var FT = window.FT = window.FT || {};

  FT.$ = function (s, r) { return (r || document).querySelector(s); };
  FT.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  FT.h = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };

  FT.download = function (name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };

  FT.copy = function (text, btn) {
    function done(ok) {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old);
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C to copy'; setTimeout(function () { btn.textContent = old; }, 1600);
    }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback); else fallback();
  };

  FT.status = function (el, msg, kind) { if (el) { el.textContent = msg || ''; el.setAttribute('data-kind', kind || ''); } };

  // drop zone + file input
  FT.dropzone = function (zone, input, onFiles) {
    function take(list) { var f = Array.prototype.slice.call(list || []); if (f.length) onFiles(f); }
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    if (input) input.addEventListener('change', function () { take(input.files); input.value = ''; });
  };

  // Decode the audio of any audio or video file the browser can play. Returns mono data (mix of all channels) plus the channel arrays.
  FT.decodeAudio = function (file, sampleRate) {
    return file.arrayBuffer().then(function (buf) {
      var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var ctx = new Ctx(2, 1, sampleRate || 48000);
      return new Promise(function (res, rej) { ctx.decodeAudioData(buf, res, rej); });
    }).then(function (ab) {
      var chans = [], n = ab.length, i, c;
      for (c = 0; c < ab.numberOfChannels; c++) chans.push(ab.getChannelData(c));
      var mono = new Float32Array(n);
      for (c = 0; c < chans.length; c++) for (i = 0; i < n; i++) mono[i] += chans[c][i] / chans.length;
      return { mono: mono, channels: chans, sampleRate: ab.sampleRate, duration: ab.duration };
    });
  };

  // peaks for drawing: array of [min, max] per pixel column
  FT.peaks = function (data, cols) {
    var out = new Array(cols), step = data.length / cols;
    for (var x = 0; x < cols; x++) {
      var a = Math.floor(x * step), b = Math.min(data.length, Math.floor((x + 1) * step) + 1), lo = 0, hi = 0;
      for (var i = a; i < b; i++) { var v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      out[x] = [lo, hi];
    }
    return out;
  };

  FT.cssVar = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };

  FT.fitCanvas = function (canvas) {
    var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    var g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g: g, w: w, h: h };
  };

  // simple video loader: returns a ready <video> with metadata, from a File or Blob
  FT.openVideo = function (file) {
    return new Promise(function (res, rej) {
      var v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.playsInline = true;
      var url = URL.createObjectURL(file); v.src = url;
      var t = setTimeout(function () { rej(new Error('Timed out. This browser may not support the video format.')); }, 20000);
      v.onloadeddata = function () {
        // recordings made in the browser have no length until the end is reached once
        if (v.duration === Infinity) {
          v.ontimeupdate = function () { if (isFinite(v.duration)) { v.ontimeupdate = null; v.currentTime = 0; clearTimeout(t); res({ video: v, url: url }); } };
          v.currentTime = 1e101;
        } else { clearTimeout(t); res({ video: v, url: url }); }
      };
      v.onerror = function () { clearTimeout(t); rej(new Error('This browser cannot play that file. Export an H.264 MP4 and try again.')); };
    });
  };
  // A short test clip recorded in the page (moving shapes and a counter), so a tool can be tried without a file.
  FT.sampleVideo = function (seconds, fps) {
    seconds = seconds || 6; fps = fps || 25;
    return new Promise(function (res, rej) {
      if (!window.MediaRecorder) { rej(new Error('This browser cannot record a test clip. Use your own video.')); return; }
      var c = document.createElement('canvas'); c.width = 640; c.height = 360; var g = c.getContext('2d'), stream = c.captureStream(fps), chunks = [], t0 = 0, frame = 0;
      var rec; try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); } catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { rej(e2); return; } }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () { res(new Blob(chunks, { type: 'video/webm' })); };
      function draw(t) {
        var h = (t * 40) % 360, gr = g.createLinearGradient(0, 0, 640, 360); gr.addColorStop(0, 'hsl(' + h + ',55%,32%)'); gr.addColorStop(1, 'hsl(' + ((h + 70) % 360) + ',55%,18%)');
        g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(60 + (520 * ((t / seconds) % 1)), 180 + 90 * Math.sin(t * 3), 34, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(t.toFixed(1) + ' s', 320, 90);
        g.font = '20px system-ui, sans-serif'; g.fillText('test clip, frame ' + frame, 320, 330);
      }
      rec.start(); t0 = performance.now();
      var timer = setInterval(function () {
        var t = (performance.now() - t0) / 1000; draw(t); frame++;
        if (t >= seconds) { clearInterval(timer); setTimeout(function () { rec.stop(); }, 100); }
      }, 1000 / fps);
    });
  };
  FT.seek = function (v, t) {
    return new Promise(function (res) {
      var done = false;
      function fin() { if (!done) { done = true; v.removeEventListener('seeked', fin); res(); } }
      v.addEventListener('seeked', fin); v.currentTime = t; setTimeout(fin, 3000);
    });
  };
  // 16-bit mono WAV file from float samples (used for generated samples and previews)
  FT.wavBlob = function (data, sampleRate) {
    var n = data.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function s(o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); }
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, data[i])); v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true); }
    return new Blob([buf], { type: 'audio/wav' });
  };
  // deterministic pseudo random numbers for generated samples
  FT.rng = function (seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
})();
