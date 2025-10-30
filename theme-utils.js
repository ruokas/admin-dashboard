export function getActiveTheme() {
  let theme = localStorage.getItem('ed_dash_theme');
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }
  let prefersLight = false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch (err) {
      prefersLight = false;
    }
  }
  theme = prefersLight ? 'light' : 'dark';
  localStorage.setItem('ed_dash_theme', theme);
  return theme;
}

export function resolveChartThemeUrl(baseUrl, theme) {
  if (typeof baseUrl !== 'string') {
    return '';
  }
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (!/^https?:/i.test(trimmed)) {
    return trimmed;
  }
  let themedUrl = trimmed;
  try {
    const url = new URL(trimmed);
    if (theme === 'light' || theme === 'dark') {
      url.searchParams.set('theme', theme);
    }
    themedUrl = url.toString();
  } catch (err) {
    themedUrl = trimmed;
  }
  return themedUrl;
}
