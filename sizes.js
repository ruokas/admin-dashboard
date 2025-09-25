export const SIZE_MAP = {
  sm: { width: 240, height: 240 },
  md: { width: 360, height: 360 },
  lg: { width: 480, height: 480 },
};

function sizeFromDimension(value, dimension) {
  const entries = Object.entries(SIZE_MAP)
    .map(([key, dims]) => [key, Number(dims?.[dimension])])
    .filter(([, val]) => Number.isFinite(val))
    .sort((a, b) => a[1] - b[1]);

  if (!entries.length) return 'md';

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return entries[0][0];
  }

  for (let i = 0; i < entries.length - 1; i += 1) {
    const currentVal = entries[i][1];
    const nextVal = entries[i + 1][1];
    const midpoint = currentVal + (nextVal - currentVal) / 2;
    if (numericValue < midpoint) {
      return entries[i][0];
    }
  }

  return entries[entries.length - 1][0];
}

export function sizeFromWidth(w) {
  return sizeFromDimension(w, 'width');
}

export function sizeFromHeight(h) {
  return sizeFromDimension(h, 'height');
}
