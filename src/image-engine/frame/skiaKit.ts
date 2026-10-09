import { Skia, type SkPaint, type SkRuntimeEffect } from '@shopify/react-native-skia';

/** Small helpers shared by the frame renderer and compositor. */

/** #RGB / #RRGGBB → 0…1 RGB (falls back to white). */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return [1, 1, 1];
  const v = parseInt(h, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Normalises user input to #RRGGBB, or null when it isn't a colour. */
export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

export function fillPaint(color: string, opacity = 1): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  if (opacity < 1) p.setAlphaf(Math.max(0, opacity) * p.getAlphaf());
  return p;
}

const layouts = new WeakMap<SkRuntimeEffect, { name: string; slot: number; size: number }[]>();

/** Uniform dictionary → the flat float array, in the effect's declaration order. */
export function flattenUniforms(effect: SkRuntimeEffect, values: Record<string, number | readonly number[]>): number[] {
  let layout = layouts.get(effect);
  if (!layout) {
    const total = effect.getUniformFloatCount();
    const raw = [];
    for (let i = 0; i < effect.getUniformCount(); i++) raw.push({ name: effect.getUniformName(i), slot: effect.getUniform(i).slot, size: 0 });
    // Arrays span until the next uniform's slot.
    const sorted = [...raw].sort((a, b) => a.slot - b.slot);
    sorted.forEach((u, i) => (u.size = (sorted[i + 1]?.slot ?? total) - u.slot));
    layout = raw;
    layouts.set(effect, layout);
  }
  const out = new Array<number>(effect.getUniformFloatCount()).fill(0);
  for (const u of layout) {
    const v = values[u.name];
    if (v === undefined) throw new Error(`uniform ${u.name} missing`);
    const flat = typeof v === 'number' ? [v] : (v as readonly unknown[]).flat(4) as number[];
    for (let i = 0; i < Math.min(u.size, flat.length); i++) out[u.slot + i] = Number(flat[i]) || 0;
  }
  return out;
}

/** Stable 1…9999 seed from a layer id (each print gets its own paper pattern). */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 1 + ((h >>> 0) % 9999);
}

/** 4×5 colour matrix for brightness (-1…1) and saturation (-1…1). */
export function adjustMatrix(brightness: number, saturation: number): number[] {
  const s = 1 + saturation;
  const lr = 0.2126 * (1 - s);
  const lg = 0.7152 * (1 - s);
  const lb = 0.0722 * (1 - s);
  const b = brightness * 0.35;
  return [lr + s, lg, lb, 0, b, lr, lg + s, lb, 0, b, lr, lg, lb + s, 0, b, 0, 0, 0, 1, 0];
}
