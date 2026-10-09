/**
 * Minimal SVG reader for the frame kit (assets/frames). Turns a frame SVG
 * into drawable primitives — paper base, photo hole, perforations, ruled
 * lines, tape, captions — so the frame can be recoloured (only its paper),
 * re-proportioned (borders recomputed, nothing stretched) and drawn by Skia
 * identically on iOS, Android, web and in the tests. Skia's own SVG module is
 * not used: on web it rasterises through an <img> asynchronously, which an
 * export render cannot wait for.
 *
 * Supported: <svg width height viewBox>, <mask> with a white full rect and a
 * black hole rect, <rect>, <path> (M/L/H/V/Z polylines, other commands kept
 * as raw path data), <text>, fill / stroke / stroke-width / opacity /
 * letter-spacing / font-size / rotate(a cx cy). Anything else throws, so a new
 * asset that needs more is caught by the registry test, not drawn wrong.
 */

export interface SvgRotate {
  deg: number;
  cx: number;
  cy: number;
}

export type SvgElement =
  | { type: 'rect'; x: number; y: number; width: number; height: number; rx: number; fill: string; opacity: number; rotate: SvgRotate | null }
  | {
      type: 'polyline';
      points: { x: number; y: number }[];
      closed: boolean;
      stroke: string | null;
      strokeWidth: number;
      fill: string | null;
      opacity: number;
      lineJoin: 'miter' | 'round' | 'bevel';
    }
  | { type: 'path'; d: string; stroke: string | null; strokeWidth: number; fill: string | null; opacity: number; lineJoin: 'miter' | 'round' | 'bevel' }
  | { type: 'text'; x: number; y: number; text: string; fontSize: number; fill: string; letterSpacing: number; opacity: number };

export interface HoleRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}

export interface FrameSpec {
  width: number;
  height: number;
  /** Photo window (the mask's black rect). */
  hole: HoleRect;
  /** Paper colour (the masked base rect) — the frame's editable colour token. */
  baseColor: string;
  /** Everything drawn on top of the paper, in document order. */
  elements: SvgElement[];
}

export interface DecorationSpec {
  viewBox: { x: number; y: number; width: number; height: number };
  elements: SvgElement[];
}

interface Tag {
  name: string;
  attrs: Record<string, string>;
  /** Text content up to the matching close tag (only for <text>). */
  text: string;
  selfClosing: boolean;
  closing: boolean;
}

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]!] = m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function tokenize(svg: string): Tag[] {
  const tags: Tag[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const closing = m[1] === '/';
    const name = m[2]!;
    const selfClosing = m[4] === '/';
    let text = '';
    if (!closing && !selfClosing && name === 'text') {
      const end = svg.indexOf('</text>', re.lastIndex);
      if (end < 0) throw new Error('svg: unterminated <text>');
      text = svg.slice(re.lastIndex, end);
      re.lastIndex = end + '</text>'.length;
      tags.push({ name, attrs: parseAttrs(m[3] ?? ''), text, selfClosing: true, closing: false });
      continue;
    }
    tags.push({ name, attrs: parseAttrs(m[3] ?? ''), text, selfClosing, closing });
  }
  return tags;
}

const num = (v: string | undefined, fallback = 0): number => {
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) throw new Error(`svg: bad number "${v}"`);
  return n;
};

/** Length that may be a percentage of `ref`. */
const len = (v: string | undefined, ref: number, fallback = 0): number =>
  v !== undefined && v.endsWith('%') ? (parseFloat(v) / 100) * ref : num(v, fallback);

function parseRotate(t: string | undefined): SvgRotate | null {
  if (!t) return null;
  const m = /^\s*rotate\(\s*([-\d.]+)(?:[\s,]+([-\d.]+)[\s,]+([-\d.]+))?\s*\)\s*$/.exec(t);
  if (!m) throw new Error(`svg: unsupported transform "${t}"`);
  return { deg: num(m[1]), cx: num(m[2]), cy: num(m[3]) };
}

const paint = (v: string | undefined): string | null => (v === undefined || v === 'none' ? null : v);

const lineJoin = (v: string | undefined): 'miter' | 'round' | 'bevel' => (v === 'round' || v === 'bevel' ? v : 'miter');

/** M/L/H/V/Z (absolute or relative) → points; null when the path uses curves. */
export function parsePolyline(d: string): { points: { x: number; y: number }[]; closed: boolean } | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return null;
  const points: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let cmd = '';
  let closed = false;
  let i = 0;
  const next = () => {
    const t = tokens[i++];
    if (t === undefined || /[a-zA-Z]/.test(t)) throw new Error(`svg: bad path "${d}"`);
    return parseFloat(t);
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        closed = true;
        continue;
      }
      if (!'MmLlHhVv'.includes(cmd)) return null;
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
        x = (rel ? x : 0) + next();
        y = (rel ? y : 0) + next();
        break;
      case 'H':
        x = (rel ? x : 0) + next();
        break;
      case 'V':
        y = (rel ? y : 0) + next();
        break;
      default:
        return null;
    }
    points.push({ x, y });
    // Implicit L after M.
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return { points, closed };
}

function readElement(tag: Tag, inherited: { width: number; height: number }): SvgElement | null {
  const a = tag.attrs;
  const opacity = num(a.opacity, 1);
  switch (tag.name) {
    case 'rect':
      return {
        type: 'rect',
        x: len(a.x, inherited.width),
        y: len(a.y, inherited.height),
        width: len(a.width, inherited.width),
        height: len(a.height, inherited.height),
        rx: num(a.rx ?? a.ry),
        fill: a.fill ?? '#000000',
        opacity,
        rotate: parseRotate(a.transform),
      };
    case 'path': {
      if (a.transform) throw new Error('svg: transformed <path> is not supported');
      const d = a.d ?? '';
      // SVG default fill is black; strokes default to none.
      const fill = a.fill === undefined ? '#000000' : paint(a.fill);
      const stroke = paint(a.stroke);
      const strokeWidth = num(a['stroke-width'], 1);
      const poly = parsePolyline(d);
      if (poly) return { type: 'polyline', ...poly, stroke, strokeWidth, fill: poly.closed ? fill : null, opacity, lineJoin: lineJoin(a['stroke-linejoin']) };
      return { type: 'path', d, stroke, strokeWidth, fill, opacity, lineJoin: lineJoin(a['stroke-linejoin']) };
    }
    case 'text':
      if (a.transform) throw new Error('svg: transformed <text> is not supported');
      return {
        type: 'text',
        x: num(a.x),
        y: num(a.y),
        // SVG collapses runs of whitespace (no xml:space="preserve" in the kit).
        text: tag.text.replace(/\s+/g, ' ').trim(),
        fontSize: num(a['font-size'], 16),
        fill: a.fill ?? '#000000',
        letterSpacing: num(a['letter-spacing']),
        opacity,
      };
    default:
      throw new Error(`svg: unsupported element <${tag.name}>`);
  }
}

function readRoot(tags: Tag[]) {
  const root = tags.find((t) => t.name === 'svg' && !t.closing);
  if (!root) throw new Error('svg: no <svg> root');
  const vb = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const viewBox =
    vb.length === 4 && vb.every(Number.isFinite)
      ? { x: vb[0]!, y: vb[1]!, width: vb[2]!, height: vb[3]! }
      : { x: 0, y: 0, width: num(root.attrs.width), height: num(root.attrs.height) };
  return { root, viewBox };
}

const parsedFrames = new Map<string, FrameSpec>();

/** Parses a frame SVG (cached by source text). */
export function parseFrameSvg(svg: string): FrameSpec {
  const hit = parsedFrames.get(svg);
  if (hit) return hit;
  const tags = tokenize(svg);
  const { viewBox } = readRoot(tags);
  if (viewBox.x !== 0 || viewBox.y !== 0) throw new Error('svg: viewBox must start at 0 0');
  const size = { width: viewBox.width, height: viewBox.height };

  let hole: HoleRect | null = null;
  let baseColor: string | null = null;
  const elements: SvgElement[] = [];
  let depth = 0; // inside <defs>/<mask>
  for (const tag of tags) {
    if (tag.name === 'svg') continue;
    if (tag.name === 'defs' || tag.name === 'mask') {
      if (tag.closing) depth--;
      else if (!tag.selfClosing) depth++;
      continue;
    }
    if (tag.closing) continue;
    if (depth > 0) {
      // Mask content: white = paper, black = hole.
      if (tag.name !== 'rect') throw new Error('svg: mask may only contain rects');
      if ((tag.attrs.fill ?? '').toLowerCase() === 'black') {
        hole = {
          x: num(tag.attrs.x),
          y: num(tag.attrs.y),
          width: num(tag.attrs.width),
          height: num(tag.attrs.height),
          rx: num(tag.attrs.rx ?? tag.attrs.ry),
        };
      }
      continue;
    }
    if (tag.attrs.mask) {
      if (tag.name !== 'rect' || !tag.attrs.fill) throw new Error('svg: masked element must be a filled rect');
      baseColor = tag.attrs.fill;
      continue;
    }
    const el = readElement(tag, size);
    if (el) elements.push(el);
  }
  if (!hole) throw new Error('svg: frame has no photo hole');
  if (!baseColor) throw new Error('svg: frame has no paper base');
  const spec: FrameSpec = { ...size, hole, baseColor, elements };
  parsedFrames.set(svg, spec);
  return spec;
}

const parsedDecorations = new Map<string, DecorationSpec>();

/** Parses a line-art decoration SVG (cached by source text). */
export function parseDecorationSvg(svg: string): DecorationSpec {
  const hit = parsedDecorations.get(svg);
  if (hit) return hit;
  const tags = tokenize(svg);
  const { viewBox } = readRoot(tags);
  const elements: SvgElement[] = [];
  for (const tag of tags) {
    if (tag.name === 'svg' || tag.closing) continue;
    const el = readElement(tag, viewBox);
    if (el) elements.push(el);
  }
  const spec = { viewBox, elements };
  parsedDecorations.set(svg, spec);
  return spec;
}
