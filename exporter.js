/**
 * Eksportuoja prietaisų skydelio būseną į JSON failą ir inicijuoja parsisiuntimą.
 * @param {object} state - Dabartinė būsena, kuri bus serializuojama.
 * @param {object} [deps] - Priklausomybės testavimui (document, URL, now).
 * @returns {HTMLAnchorElement} Nuoroda, kuri naudojama parsisiuntimui (patogu testams).
 */
export function exportJson(state, deps = {}) {
  const {
    document: doc = globalThis.document,
    URL: urlObj = globalThis.URL,
    now = () => Date.now(),
  } = deps;
  if (!doc || !urlObj) {
    throw new Error('Reikalingi document ir URL objektai eksportui.');
  }
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const a = doc.createElement('a');
  a.href = urlObj.createObjectURL(blob);
  const title = state?.title || 'smp-skydas';
  const timestamp = typeof now === 'function' ? now() : Date.now();
  a.download = `${title}-${timestamp}.json`;
  if (typeof a.click === 'function') a.click();
  urlObj.revokeObjectURL(a.href);
  return a;
}
