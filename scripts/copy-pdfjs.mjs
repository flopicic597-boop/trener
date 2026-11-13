// Копира табеле знакова (cmaps) и стандардне фонтове pdf.js-а у public/pdfjs/,
// да би се и PDF налази са посебним фонтовима читали исправно и без интернета.
// Покреће се аутоматски прије `npm run build` и `npm run dev`.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dst = join(root, 'public', 'pdfjs');
mkdirSync(dst, { recursive: true });
for (const d of ['cmaps', 'standard_fonts']) {
  if (!existsSync(join(src, d))) throw new Error(`Недостаје pdfjs-dist/${d} — покрените npm install.`);
  cpSync(join(src, d), join(dst, d), { recursive: true });
}
console.log('pdf.js: cmaps и standard_fonts копирани у public/pdfjs/');
