const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const base = process.argv[2] || 'http://localhost:8787';
  const dir = __dirname + '/../screenshots-preview/';
  await p.goto(base + '/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 7000)); // let video reach first verse card + install bar
  const playing = await p.evaluate(() => { const v = document.querySelector('#feed video'); return { paused: v.paused, t: v.currentTime, muted: v.muted, ready: v.readyState }; });
  await p.screenshot({ path: dir + '01-feed.png' });
  await p.click('#v-creation .comments'); await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: dir + '02-comments.png' });
  await p.click('#commentsSheet .sheet-close'); await new Promise(r => setTimeout(r, 400));
  await p.click('#menuBtn'); await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: dir + '03-support-menu.png' });
  await p.click('#menuSheet .sheet-close'); await new Promise(r => setTimeout(r, 400));
  const n = await p.evaluate(() => { const ad = document.querySelector('.ad-slide'); ad.scrollIntoView({ behavior: 'instant' }); return document.querySelectorAll('.ad-slide').length; });
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: dir + '04-ad-slot.png' });
  await p.evaluate(() => document.querySelector('#v-david-goliath').scrollIntoView({ behavior: 'instant' }));
  await new Promise(r => setTimeout(r, 3500));
  await p.screenshot({ path: dir + '05-feed-david.png' });
  console.log(JSON.stringify({ playing, adSlides: n, errs }));
  await b.close();
})();
