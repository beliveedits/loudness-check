# Loudness Check

Free LUFS meter for editors. Measures integrated loudness, true peak and loudness range, compares platform levels and gives an ffmpeg fix. Runs in your browser.

**Use it online:** https://vaghelabhavesh.com/loudness-check.html
**Step-by-step guide:** [Is your video too loud or too quiet? A plain guide to LUFS and true peak](https://vaghelabhavesh.com/blog/check-video-loudness-lufs-true-peak.html)

No upload, no account, no tracking. The page sets a Content-Security-Policy with `connect-src 'none'`, so its scripts cannot make network requests. MIT licence.

## What it does

Drop in a video or audio file. The tool measures integrated loudness (LUFS), true peak and loudness range, then shows what YouTube, Spotify, Apple Music and broadcast will do with it. Nothing is uploaded.

- Integrated LUFS, true peak, loudness range
- Loudest 3 second and 0.4 second readings
- Verdict for YouTube, Spotify, Apple Music, Amazon, EBU R128 and ATSC
- Loudness curve over time
- Copy-ready ffmpeg gain and loudnorm commands

## Run it

It is plain HTML, CSS and JavaScript. No build step, no dependencies.

```
git clone https://github.com/beliveedits/loudness-check.git
cd loudness-check
python3 -m http.server 8000
# open http://localhost:8000/
```

You can also open `index.html` directly in Chrome or Edge.

## Chrome extension

`extension/` is an unpacked Manifest V3 extension of the same tool. Load it yourself:

1. Open `chrome://extensions` and switch on Developer mode.
2. Choose **Load unpacked** and select the `extension` folder.
3. Click the toolbar icon to open Loudness Check in a tab.

It asks for no permissions, and its Content-Security-Policy blocks network requests.

## Tests

```
npm test
```

Runs the logic tests with Node (no packages needed; ffmpeg is used by some tools to cross-check results). `test.js` states what is checked. The browser test drives the page in a real Chromium: `npm i -D playwright && npx playwright install chromium`, then `npm run test:e2e`.

## Questions

**Is Loudness Check free?**
Yes. It is free and open source under the MIT licence, with no account, no limit and no watermark.

**Is my file uploaded?**
No. Your browser decodes the audio on your device and the measurement runs in the page. A Content-Security-Policy blocks network requests from the page's scripts.

**Is it accurate?**
The method is ITU-R BS.1770-4 with the gating of EBU R128. On four generated test signals, including speech with gaps and a loud signal with high peaks, it matched ffmpeg's ebur128 meter within 0.1 LU for integrated loudness and within 0.35 dB for true peak. I have not compared it with every hardware or plugin meter.

**What loudness should I aim for?**
For online video, a common choice is about -14 LUFS integrated with the true peak at or below -1 dBTP. YouTube is generally reported to turn louder videos down to about -14 LUFS and not to turn quieter ones up. Broadcast uses -23 LUFS in Europe and -24 LKFS in the US. Platforms change their rules, so check the one you publish on.

**What is the difference between LUFS and dB?**
A dB reading such as a peak level describes the loudest instant. LUFS is loudness over the whole programme, weighted to how the ear hears it, so it tracks perceived volume far better than peak or average level.

**Why does my file read lower than expected?**
Parts that are quieter than 70 LUFS, or more than 10 LU below the average, are left out of the integrated figure by the gating rules. That is the standard behaviour, and it stops long silences from dragging the number down.

## Layout

```
index.html   the page
logic.js     pure functions, tested by test.js
app.js       the interface
kit/         shared CSS and helpers (zip writer, timecode, exporters)
extension/   the Chrome extension build
tests/       test helpers and the browser test runner
```

By [Bhavesh Vaghela](https://vaghelabhavesh.com), motion designer and short-form video editor, Rajkot, India. Platform names belong to their owners; this tool is not affiliated with or endorsed by them.

## More free tools

All tools are free, open source and run on your device: see [the full list](https://vaghelabhavesh.com/free-tools.html) or [the collection on GitHub](https://github.com/beliveedits/free-video-and-ad-tools).

- [Silence Cutter](https://github.com/beliveedits/silence-cutter): Finds pauses in a recording and exports a cut list for Premiere Pro, DaVinci Resolve or ffmpeg.
- [Beat Marker](https://github.com/beliveedits/beat-marker): Finds the tempo and every beat of a song and exports markers for After Effects, DaVinci Resolve and caption tracks.
- [Subtitle Fixer](https://github.com/beliveedits/subtitle-fixer): Fixes overlaps, long lines and fast subtitles in SRT and VTT files, retimes them, and converts between formats.
- [Video Review Notes](https://github.com/beliveedits/video-review-notes): Add frame-accurate notes to a video with one key, then export markers for After Effects and Resolve or an email-ready list.
- [Easing Lab](https://github.com/beliveedits/easing-lab): Edit cubic-bezier easing curves and springs, and copy them as CSS, GSAP, Remotion, Lottie or After Effects keyframe values.
- [Frame Grabber](https://github.com/beliveedits/frame-grabber): Grab frames from a video at intervals or exact times, auto-pick the best thumbnails, and download a ZIP or a contact sheet.
- [Ad Copy Checker](https://github.com/beliveedits/ad-copy-checker): Count ad headline and text length for Google, Meta, LinkedIn and TikTok, see where each platform cuts it off, and check lists.
- [Ad Namer](https://github.com/beliveedits/ad-namer): Generate consistent ad names in bulk, add UTM tracking links, copy Meta URL parameters, and check names you already have.
- [Ad Test Planner](https://github.com/beliveedits/ad-test-planner): Plan an ad A/B test: visitors per version, cost and days. Check results with p-values and ranges, and see why peeking misleads.
- [SaaS Metrics Lab](https://github.com/beliveedits/saas-metrics-lab): Work out MRR, NRR, churn, quick ratio, LTV, CAC payback, runway and burn multiple, with every formula shown. Nothing is saved.
- [Creative Diversity Lab](https://github.com/beliveedits/creative-diversity-lab): Check how different your ad creatives really are before you spend.
- [Safe Zone Overlay](https://github.com/beliveedits/safe-zone-overlay): Draws the Reels, TikTok and Shorts safe-zone margins over any video preview.
- [Deskhand](https://github.com/beliveedits/deskhand): Give your laptop a command and it does it. Voice and text, no cloud, no AI model.

## Licence

MIT. See [LICENSE](LICENSE).
