import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--hide-scrollbars','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const el = document.querySelector('#picks'); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'instant' }); });
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const pick = document.querySelector('#picks');
  const cards = [...pick.querySelectorAll('[data-pick-card]')];
  const caption = pick.querySelector('p[data-pick-detail]');
  const styleOf = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return { transform: cs.transform, translate: cs.translate, top: Math.round(b.top), height: Math.round(b.height), position: cs.position, animation: cs.animationName }; };
  return {
    cards: cards.map(styleOf),
    caption: styleOf(caption),
    captionParentClass: caption.parentElement.className,
    gridOfCaptionParent: getComputedStyle(caption.parentElement).display,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
