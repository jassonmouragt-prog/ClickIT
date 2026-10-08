import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--hide-scrollbars','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2000));
for (let i = 0; i < 30; i++) { await page.mouse.wheel({ deltaY: 120 }); await new Promise(r => setTimeout(r, 90)); }
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const pick = document.querySelector('#picks');
  const rect = pick.getBoundingClientRect();
  const cards = [...pick.querySelectorAll('[data-pick-card]')];
  return {
    sectionTop: Math.round(rect.top),
    scrollY: Math.round(window.scrollY),
    transforms: cards.map((c) => getComputedStyle(c).transform),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
