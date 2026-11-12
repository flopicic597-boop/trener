// Преузимање датотеке на уређај (Android: фасцикла „Преузимања“ / Download).
export function downloadText(text, filename, type = 'application/json;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Дијељење датотеке (нпр. слање на компјутер преко Quick Share, е-поште, Drive-а) ако уређај то подржава */
export async function shareText(text, filename, type = 'application/json') {
  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return true; // корисник је одустао
  }
  return false;
}
