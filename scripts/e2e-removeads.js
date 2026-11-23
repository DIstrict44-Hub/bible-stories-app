const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:8787/', { waitUntil: 'networkidle2' });
  const before = await p.evaluate(() => ({ ads: document.querySelectorAll('.ad-slide').length, banner: !document.querySelector('#bannerAd').classList.contains('hidden') }));
  await p.click('#menuBtn'); await new Promise(r => setTimeout(r, 500));
  await Promise.all([p.waitForNavigation(), p.click('#removeAdsBtn')]);
  const url1 = p.url(); await new Promise(r => setTimeout(r, 500));
  await Promise.all([p.waitForNavigation(), p.click('#pay')]);
  await new Promise(r => setTimeout(r, 2000));
  const after = await p.evaluate(() => ({ ads: document.querySelectorAll('.ad-slide').length, banner: !document.querySelector('#bannerAd').classList.contains('hidden'), ls: localStorage.getItem('bs_adfree'), toast: document.querySelector('#toast').textContent }));
  console.log(JSON.stringify({ before, checkoutUrl: url1.replace(/session_id=.*/, 'session_id=…'), after }));
  await b.close();
})();
