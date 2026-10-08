import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'og.png');

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#27C8F5"/>
      <stop offset="0.5" stop-color="#398BFF"/>
      <stop offset="1" stop-color="#8B4DFF"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#27C8F5"/>
      <stop offset="0.45" stop-color="#398BFF"/>
      <stop offset="1" stop-color="#8B4DFF"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.75" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#6C4CFF" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#6C4CFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="0.95" r="0.6">
      <stop offset="0" stop-color="#27C8F5" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#27C8F5" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#070A10"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>

  <g transform="translate(90 86)" fill="none" stroke="url(#mark)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 42V26a16 16 0 0 1 16-16h16"/>
    <path d="M66 10h16a16 16 0 0 1 16 16v16"/>
    <path d="M98 66v16a16 16 0 0 1-16 16H66"/>
    <path d="M42 98H26a16 16 0 0 1-16-16V66"/>
  </g>

  <text x="248" y="152" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="58" font-weight="700" letter-spacing="-1.5" fill="#F5F7FB">Click<tspan fill="url(#accent)">IT</tspan></text>

  <text x="90" y="300" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="-2.4" fill="#F5F7FB">Pare de perder horas</text>
  <text x="90" y="386" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="-2.4" fill="url(#accent)">escolhendo fotos.</text>

  <text x="90" y="462" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="27" fill="#9BA6B7">A ClickIT analisa seu ensaio, organiza sequências e sugere os melhores cliques.</text>

  <rect x="90" y="514" width="392" height="60" rx="14" fill="url(#accent)"/>
  <text x="286" y="553" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="26" font-weight="600" fill="#FFFFFF">Seleção inteligente para fotógrafos</text>

  <text x="1110" y="553" text-anchor="end" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="22" fill="#6C778A">processamento local</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('og.png ok');
