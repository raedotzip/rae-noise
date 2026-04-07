import type { PaletteStop } from '../../../src/types';

export function hexToRgb(hex: string): PaletteStop {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: PaletteStop): string {
  const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function swatchGradient(palette: PaletteStop[]): string {
  if (palette.length === 1) {
    const [r, g, b] = palette[0];
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  const stops = palette.map((s, i) => {
    const pct = (i / (palette.length - 1)) * 100;
    return `rgb(${s.map(x => Math.round(x * 255)).join(',')}) ${pct}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}