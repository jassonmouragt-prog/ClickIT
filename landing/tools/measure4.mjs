import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--hide-scrollbars','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
page.on('console', (m) => console.log('LOG:', m.text()));
page.on('pageerror', (e) => console.log('ERR:', e.message));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
for (let i = 0; i < 26; i++) { await page.mouse.wheel({ deltaY: 140 }); await new Promise(r => setTimeout(r, 90)); }
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#picks [data-pick-card]')];
  return { scrollY: Math.round(window.scrollY), transforms: cards.map((c) => getComputedStyle(c).transform) };
});
console.log(JSON.stringify(info));
await browser.close();
