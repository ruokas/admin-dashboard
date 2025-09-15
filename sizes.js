export const SIZE_MAP = {
  sm: { width: 240, height: 240 },
  md: { width: 360, height: 360 },
  lg: { width: 480, height: 480 },
};

export function sizeFromWidth(w) {
  if (w >= 420) return 'lg';
  if (w >= 300) return 'md';
  return 'sm';
}

export function sizeFromHeight(h) {
  if (h >= 420) return 'lg';
  if (h >= 300) return 'md';
  return 'sm';
}
