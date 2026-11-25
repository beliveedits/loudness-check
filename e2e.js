const fs = require('fs');
module.exports = async function (page, t) {
  await page.click('#sample'); await page.waitForSelector('#results:not([hidden])', { timeout: 60000 });
  const m = await page.evaluate(() => LC.state.m);
  t.ok(m.integrated > -30 && m.integrated < -5, 'sample is measured (' + m.integrated.toFixed(1) + ' LUFS)');
  t.ok(m.truePeakDb >= m.samplePeakDb - 0.01 && m.truePeakDb < 0.5, 'true peak is at or above the sample peak (' + m.truePeakDb.toFixed(1) + ' dBTP)');
  const rows = await page.locator('#plat tr').count(); t.ok(rows === 6, 'six platform rows are listed (' + rows + ')');
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: t.shots + '/loudness-check-top.png' });
  await page.fill('#tgt', '-16'); const cmd = await page.textContent('#cmd');
  const want = Math.round((-16 - m.integrated) * 10) / 10;
  t.ok(cmd.indexOf('volume=' + want + 'dB') >= 0 && cmd.indexOf('loudnorm=I=-16') >= 0, 'ffmpeg commands follow the target (gain ' + want + ' dB)');
  const note = await page.textContent('#fixNote'); t.ok(/true peak/.test(note), 'fix note mentions true peak after the gain');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlRep')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8'); t.ok(/Integrated loudness: -?\d+\.\d LUFS/.test(txt) && /YouTube/.test(txt), 'report downloads with the readings (' + dl.suggestedFilename() + ')');
  // a real file: decode a WAV through the file input
  const wav = require('path').join(require('os').tmpdir(), 'lc-e2e.wav'); const H = require('./tests/helpers.js');
  const sr = 48000, n = sr * 6, x = new Float32Array(n * 2); for (let i = 0; i < n; i++) { const v = 0.1 * Math.sin(2 * Math.PI * 1000 * i / sr); x[2 * i] = v; x[2 * i + 1] = v; }
  H.writeWav(wav, x, sr, 2); await page.setInputFiles('#file', wav); await page.waitForFunction(() => LC.state.name === 'lc-e2e.wav', null, { timeout: 30000 });
  const m2 = await page.evaluate(() => LC.state.m); t.near(m2.integrated, -20, 0.2, 'a stereo 1 kHz tone at 0.1 reads about -20 LUFS (' + m2.integrated.toFixed(2) + ')');
  t.near(m2.truePeakDb, -20, 0.2, 'and a true peak of about -20 dBTP');
  await page.click('#cpCmd');
};
