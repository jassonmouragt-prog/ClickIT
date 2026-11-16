import js from '@eslint/js';
import ts from 'typescript-eslint';

const nodeGlobals = {
  console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly',
  AbortSignal: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', WebSocket: 'readonly', Buffer: 'readonly',
  TextDecoder: 'readonly', TextEncoder: 'readonly', structuredClone: 'readonly'
};
/** Globais de pagina: avaliados dentro do browser pelos scripts de captura. */
const pageGlobals = { document: 'readonly', window: 'readonly', getComputedStyle: 'readonly' };

export default ts.config(
  { ignores: ['dist/**', 'release/**', '.npm-cache/**', '.test-tmp/**', 'public/wasm/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { globals: nodeGlobals },
    rules: { '@typescript-eslint/no-explicit-any': 'error' }
  },
  {
    // Scripts de captura da landing: parte roda no Node (puppeteer) e parte e
    // avaliada dentro da pagina (document/window/getComputedStyle).
    files: ['landing/tools/**/*.mjs'],
    languageOptions: { globals: { ...nodeGlobals, ...pageGlobals } }
  }
);
