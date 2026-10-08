import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '.shots');
const url = process.argv[2] ?? 'http://localhost:3000/';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 950);
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--hide-scrollbars', '--disable-gpu', '--force-device-scale-factor=1', '--lang=pt-BR'],
});

const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });

const consoleErrors = [];
const assetErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleErrors.push(`[${message.type()}] ${message.text()}`);
  }
});
page.on('pageerror', (error) => consoleErrors.push(`[pageerror] ${error.message}`));
page.on('requestfailed', (request) => assetErrors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400 && response.url().includes('/_next/')) {
    assetErrors.push(`[${response.status()}] ${response.url()}`);
  }
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((resolve) => setTimeout(resolve, 3200));

const render = await page.evaluate(() => {
  const sheets = Array.from(document.styleSheets);
  const linked = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
  return {
    stylesheetCount: sheets.length,
    linkedStylesheets: linked,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    hasPanel: Boolean(document.querySelector('.panel, .btn-primary, .eyebrow')),
  };
});

const unstyled = render.stylesheetCount === 0 || render.bodyBackground === 'rgb(255, 255, 255)';

if (assetErrors.length || unstyled) {
  console.error('FALHA DE RENDERIZAÇÃO — screenshot abortado.');
  console.error(JSON.stringify({ ...render, unstyled, assetErrors }, null, 2));
  await browser.close();
  process.exit(1);
}

const metrics = await page.evaluate(() => {
  const doc = document.documentElement;
  const overflow = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const right = rect.right + window.scrollX;
    const left = rect.left + window.scrollX;
    if (right > window.innerWidth + 2 || left < -2) {
      overflow.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 90),
        left: Math.round(left),
        right: Math.round(right),
      });
    }
    if (overflow.length >= 14) break;
  }
  return {
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    scrollHeight: doc.scrollHeight,
    overflow,
  };
});

console.log(JSON.stringify({ ...metrics, ...render }, null, 2));
if (consoleErrors.length) console.log('CONSOLE:\n' + consoleErrors.join('\n'));

/**
 * Contadores animados (escala 100/500/1.000) só podem ser fotografados no valor
 * final. O baseline é lido antes de qualquer scroll, quando o texto ainda é o
 * renderizado pelo React — igual ao estado pós-tween.
 */
const tierBaseline = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-tier]')).map((node) => node.textContent).join('|'),
);

const settleTiers = async () => {
  if (!tierBaseline) return true;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-tier]')).map((node) => node.textContent).join('|'),
    );
    if (current === tierBaseline) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
};

if (!(await settleTiers())) {
  console.error(`FALHA: contadores da escala não assentaram. Esperado "${tierBaseline}".`);
  await browser.close();
  process.exit(1);
}

const targets = JSON.parse(process.env.SHOTS ?? '[]');
for (const target of targets) {
  const name = target.name;
  const selector = target.selector;
  if (selector) {
    const scroll = async () => {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      }, selector);
    };
    await scroll();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await scroll();
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (!(await settleTiers())) {
      console.error(`FALHA: contadores da escala não assentaram antes de "${name}".`);
      await browser.close();
      process.exit(1);
    }
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`shot ${name}`);
}

await browser.close();
