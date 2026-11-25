/*! Free video and ad tools by Bhavesh Vaghela. MIT licence. Shared pure helpers (no DOM, runs in browsers and Node). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FT = Object.assign(root.FT || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function round(x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; }

  // ---- time formats --------------------------------------------------------
  // Non-drop-frame timecode. fps may be 23.976, 29.97 etc.: the counting base is the nearest whole number.
  function tcBase(fps) { return Math.round(fps); }
  function framesAt(sec, fps) { return Math.round(sec * fps); }
  function tcFromFrames(f, fps) {
    var b = tcBase(fps); f = Math.max(0, Math.round(f));
    var ff = f % b, s = Math.floor(f / b), ss = s % 60, m = Math.floor(s / 60), mm = m % 60, hh = Math.floor(m / 60);
    return pad(hh) + ':' + pad(mm) + ':' + pad(ss) + ':' + pad(ff);
  }
  function tc(sec, fps, startSec) { return tcFromFrames(framesAt((startSec || 0) + sec, fps), fps); }
  function parseTc(str, fps) {
    var m = /^(\d+):(\d\d):(\d\d)[:;](\d\d)$/.exec(String(str).trim());
    if (!m) return NaN;
    var b = tcBase(fps), frames = (((+m[1]) * 60 + (+m[2])) * 60 + (+m[3])) * b + (+m[4]);
    return frames / fps;
  }
  function hms(sec, ms) {
    sec = Math.max(0, sec);
    var total = Math.round(sec * 1000), msv = total % 1000, s = Math.floor(total / 1000), ss = s % 60, m = Math.floor(s / 60), mm = m % 60, hh = Math.floor(m / 60);
    return pad(hh) + ':' + pad(mm) + ':' + pad(ss) + (ms === undefined ? '' : ms + pad(msv, 3));
  }
  function srtTime(sec) { return hms(sec, ','); }
  function vttTime(sec) { return hms(sec, '.'); }
  function fmtDur(sec) {
    sec = Math.max(0, sec);
    if (sec < 60) return round(sec, 1) + ' s';
    var m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    if (s === 60) { m += 1; s = 0; }
    if (m < 60) return m + ' min ' + pad(s) + ' s';
    return Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return round(n / 1024, 1) + ' KB';
    if (n < 1073741824) return round(n / 1048576, 1) + ' MB';
    return round(n / 1073741824, 2) + ' GB';
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function baseName(name) { return String(name).replace(/\.[^.]+$/, ''); }

  // ---- CSV -------------------------------------------------------------------
  function csvCell(v) {
    v = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCSV(rows, sep) { sep = sep || ','; return rows.map(function (r) { return r.map(csvCell).join(sep); }).join('\r\n') + '\r\n'; }
  function parseCSV(text, sep) {
    text = String(text).replace(/^﻿/, '');
    if (!sep) {
      var first = text.split(/\r?\n/)[0] || '', c = { ',': 0, ';': 0, '\t': 0 };
      for (var k in c) c[k] = first.split(k).length - 1;
      sep = c['\t'] > c[','] && c['\t'] >= c[';'] ? '\t' : (c[';'] > c[','] ? ';' : ',');
    }
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---- ZIP (stored, no compression) ----------------------------------------------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(str) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str) : Uint8Array.from(Buffer.from(str, 'utf8')); }
  // files: [{name: 'a.png', data: Uint8Array}]
  function zip(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true); dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      lh.set(name, 30);
      var ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true); ch.set(name, 46);
      parts.push(lh, data); central.push(ch); offset += lh.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, csize, true); ev.setUint32(16, offset, true);
    var all = parts.concat(central, [end]), total = all.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  // ---- markers and cut lists ------------------------------------------------------
  // marker: {t: seconds, name: 'text', dur?: seconds, color?: 'Blue'}
  function mname(m, i) { return (m.name && String(m.name).trim()) || ('Marker ' + (i + 1)); }
  function markersCSV(markers, fps) {
    var rows = [['#', 'Name', 'Seconds', 'Timecode']];
    markers.forEach(function (m, i) { rows.push([i + 1, mname(m, i), round(m.t, 3), tc(m.t, fps)]); });
    return toCSV(rows);
  }
  function markersTSV(markers, fps) {
    var lines = ['Marker Name\tDescription\tIn\tOut\tDuration\tMarker Type'];
    markers.forEach(function (m, i) {
      var inn = tc(m.t, fps), out = tc(m.t + (m.dur || 0), fps), d = tcFromFrames(framesAt(m.dur || 0, fps), fps);
      lines.push([mname(m, i), m.note || '', inn, out, d, 'Comment'].join('\t'));
    });
    return lines.join('\n') + '\n';
  }
  function markersSRT(markers, minDur) {
    return markers.map(function (m, i) {
      var end = m.t + Math.max(minDur || 0.5, m.dur || 0);
      return (i + 1) + '\n' + srtTime(m.t) + ' --> ' + srtTime(end) + '\n' + mname(m, i) + '\n';
    }).join('\n');
  }
  function markersEDL(markers, o) {
    o = o || {};
    var fps = o.fps || 25, start = o.startSec === undefined ? 3600 : o.startSec, title = o.title || 'Markers';
    var lines = ['TITLE: ' + title, 'FCM: NON-DROP FRAME', ''];
    markers.forEach(function (m, i) {
      var a = tc(m.t, fps, start), b = tcFromFrames(framesAt(m.t, fps) + framesAt(start, fps) + 1, fps);
      var n = pad(i + 1, 3);
      lines.push(n + '  001      V     C        ' + a + ' ' + b + ' ' + a + ' ' + b + '  ');
      lines.push(' |C:Resolve' + (m.color || 'Blue') + ' |M:' + mname(m, i).replace(/\|/g, '/') + ' |D:1');
      lines.push('');
    });
    return lines.join('\n');
  }
  function jsString(s) { return JSON.stringify(String(s)); }
  function markersJSX(markers, o) {
    o = o || {};
    var list = markers.map(function (m, i) { return '  [' + round(m.t, 4) + ', ' + jsString(mname(m, i)) + ']'; }).join(',\n');
    return [
      '// Adds ' + markers.length + ' markers. In After Effects: File > Scripts > Run Script File.',
      '// Select a layer first to put the markers on that layer; with no layer selected they go on the composition.',
      '(function () {',
      '  var comp = app.project.activeItem;',
      '  if (!(comp instanceof CompItem)) { alert("Open a composition first."); return; }',
      '  var target = comp.selectedLayers.length ? comp.selectedLayers[0].property("Marker") : comp.markerProperty;',
      '  var markers = [',
      list,
      '  ];',
      '  app.beginUndoGroup("Add markers");',
      '  for (var i = 0; i < markers.length; i++) {',
      '    target.setValueAtTime(markers[i][0], new MarkerValue(markers[i][1]));',
      '  }',
      '  app.endUndoGroup();',
      '})();',
      ''
    ].join('\n');
  }
  // segments: [{start, end}] seconds in the source. Builds a CMX 3600 cut list that plays them back to back.
  function cutsEDL(segments, o) {
    o = o || {};
    var fps = o.fps || 25, rec0 = o.startSec === undefined ? 3600 : o.startSec, title = o.title || 'Cuts', reel = (o.reel || 'AX').toUpperCase().slice(0, 8);
    var tracks = o.tracks || 'VA', lines = ['TITLE: ' + title, 'FCM: NON-DROP FRAME', ''];
    var recF = framesAt(rec0, fps), n = 0;
    segments.forEach(function (s) {
      var sf = framesAt(s.start, fps), ef = framesAt(s.end, fps), len = ef - sf;
      if (len < 1) return;
      n++;
      var si = tcFromFrames(sf, fps), so = tcFromFrames(ef, fps), ri = tcFromFrames(recF, fps), ro = tcFromFrames(recF + len, fps);
      var tl = [];
      if (tracks.indexOf('V') >= 0) tl.push('V');
      if (tracks.indexOf('A') >= 0) tl.push('A');
      tl.forEach(function (t) { lines.push(pad(n, 3) + '  ' + (reel + '        ').slice(0, 8) + ' ' + (t + '     ').slice(0, 5) + ' C        ' + si + ' ' + so + ' ' + ri + ' ' + ro); });
      if (o.clip) lines.push('* FROM CLIP NAME: ' + o.clip);
      lines.push('');
      recF += len;
    });
    return lines.join('\n');
  }
  function segmentsCSV(segments, fps) {
    var rows = [['#', 'Start (s)', 'End (s)', 'Length (s)', 'Start timecode', 'End timecode']];
    segments.forEach(function (s, i) { rows.push([i + 1, round(s.start, 3), round(s.end, 3), round(s.end - s.start, 3), tc(s.start, fps), tc(s.end, fps)]); });
    return toCSV(rows);
  }

  return {
    pad: pad, esc: esc, clamp: clamp, round: round,
    tc: tc, tcFromFrames: tcFromFrames, framesAt: framesAt, parseTc: parseTc, srtTime: srtTime, vttTime: vttTime, hms: hms, fmtDur: fmtDur, fmtBytes: fmtBytes, slug: slug, baseName: baseName,
    csvCell: csvCell, toCSV: toCSV, parseCSV: parseCSV, crc32: crc32, zip: zip, utf8: utf8,
    markersCSV: markersCSV, markersTSV: markersTSV, markersSRT: markersSRT, markersEDL: markersEDL, markersJSX: markersJSX,
    cutsEDL: cutsEDL, segmentsCSV: segmentsCSV
  };
});
