import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--hide-scrollbars','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
const data = await page.evaluate(() => {
  const el = document.querySelector('#picks');
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: 'instant' });
  return y;
});
await new Promise(r => setTimeout(r, 1500));
const rects = await page.evaluate(() => {
  const pick = document.querySelector('#picks');
  const grid = pick.querySelector('.grid');
  const caption = pick.querySelector('p[data-pick-detail]');
  const cards = [...pick.querySelectorAll('[data-pick-card]')];
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), height: Math.round(b.height) }; };
  return { grid: r(grid), caption: r(caption), cards: cards.map(r), scrollY: window.scrollY };
});
console.log(JSON.stringify(rects, null, 2));
await browser.close();
