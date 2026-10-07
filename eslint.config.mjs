import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['dist/**', 'release/**', '.npm-cache/**', '.test-tmp/**', 'public/wasm/**'] }, js.configs.recommended, ...ts.configs.recommended, {
  files: ['**/*.{ts,tsx,mjs}'],
  languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', WebSocket: 'readonly' } },
  rules: { '@typescript-eslint/no-explicit-any': 'error' }
});
