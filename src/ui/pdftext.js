// Читање текста из PDF налаза на самом уређају (без интернета, без слања датотеке било гдје).
// Библиотека pdf.js се учитава тек када затреба. Скенирани налаз (слика у PDF-у) нема текст —
// тада се вриједности уносе ручно.

/**
 * Да ли је извучени текст читљив. PDF без исправне ознаке слова у фонту даје низ
 * симбола (често из „приватне“ зоне Unicode-а) — тада ни копирање из PDF прегледача не ради.
 */
export function isReadable(text) {
  const chars = [...String(text || '').replace(/\s+/g, '')];
  if (chars.length < 10) return false;
  const good = chars.filter((c) => /[A-Za-zÀ-žЀ-ӿ0-9.,:;()%/<>=+\-–]/.test(c)).length;
  return good / chars.length >= 0.6;
}

/** dataUrl → Uint8Array */
export async function dataUrlBytes(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Враћа текст PDF-а, ред по ред (ставке на истој висини стране спајају се у један ред,
 * тако да ред табеле налаза „Глукоза 5,4 mmol/L 3,9–6,1“ остаје заједно).
 */
export async function pdfToText(dataUrl) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // табеле знакова и стандардни фонтови (public/pdfjs/) — потребни за PDF-ове са посебним
  // фонтовима какве праве лабораторијски програми; без њих текст испадне као низ симбола
  const base = new URL('pdfjs/', document.baseURI).href;
  const task = pdfjs.getDocument({
    data: await dataUrlBytes(dataUrl), isEvalSupported: false,
    cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/',
  });
  const doc = await task.promise;
  const lines = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find((r) => Math.abs(r.y - y) < 3);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) lines.push(r.items.sort((a, b) => a.x - b.x).map((t) => t.s.trim()).join('  '));
    }
  } finally {
    // ослобађање меморије; грешка при затварању не смије поништити прочитани текст
    try { await (task.destroy ? task.destroy() : doc.destroy?.()); } catch { /* */ }
  }
  return lines.join('\n');
}
