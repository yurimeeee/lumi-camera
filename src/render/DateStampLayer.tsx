import { BlurMask, Group, Path, Skia, Text, type SkFont, type SkPath, type SkTypeface } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { colors } from '@/constants/theme';

/**
 * Film-camera style date imprint (orange 7-segment digits with a faint glow),
 * bottom-right of the frame. DSEG7 has no apostrophe/slash glyphs, so those
 * separators are drawn as small slanted segments to match.
 */

type Run = { kind: 'text'; text: string; x: number } | { kind: 'mark'; path: SkPath };

interface StampLayout {
  font: SkFont;
  baseline: number;
  runs: Run[];
  glow: number;
}

export function layoutDateStamp(text: string, typeface: SkTypeface, width: number, height: number): StampLayout {
  const short = Math.min(width, height);
  const size = Math.max(10, short * 0.036);
  const font = Skia.Font(typeface, size);
  const margin = short * 0.055;

  const advance = (ch: string) => {
    if (ch === "'") return size * 0.38;
    if (ch === '/') return size * 0.62;
    const ids = font.getGlyphIDs(ch);
    return font.getGlyphWidths(ids)[0] ?? size * 0.7;
  };

  const chars = [...text];
  const total = chars.reduce((sum, ch) => sum + advance(ch), 0);
  const baseline = height - margin;
  const runs: Run[] = [];
  let x = width - margin - total;
  let buffer = '';
  let bufferX = x;

  const flush = () => {
    if (buffer) runs.push({ kind: 'text', text: buffer, x: bufferX });
    buffer = '';
  };

  for (const ch of chars) {
    if (ch === "'" || ch === '/') {
      flush();
      const path = Skia.Path.Make();
      const t = size * 0.11; // stroke thickness, matches DSEG segment weight
      if (ch === "'") {
        const top = baseline - size * 1.0;
        const bottom = baseline - size * 0.68;
        path.moveTo(x + size * 0.16, top);
        path.lineTo(x + size * 0.16 + t, top);
        path.lineTo(x + size * 0.06 + t, bottom);
        path.lineTo(x + size * 0.06, bottom);
      } else {
        const top = baseline - size * 1.0;
        path.moveTo(x + size * 0.46, top);
        path.lineTo(x + size * 0.46 + t, top);
        path.lineTo(x + size * 0.1 + t, baseline);
        path.lineTo(x + size * 0.1, baseline);
      }
      path.close();
      runs.push({ kind: 'mark', path });
      x += advance(ch);
      bufferX = x;
    } else {
      if (!buffer) bufferX = x;
      buffer += ch;
      x += advance(ch);
    }
  }
  flush();
  return { font, baseline, runs, glow: size * 0.35 };
}

function Glyphs({ layout }: { layout: StampLayout }) {
  return (
    <>
      {layout.runs.map((run, i) =>
        run.kind === 'text' ? (
          <Text key={i} text={run.text} x={run.x} y={layout.baseline} font={layout.font} />
        ) : (
          <Path key={i} path={run.path} />
        ),
      )}
    </>
  );
}

interface Props {
  text: string;
  typeface: SkTypeface;
  width: number;
  height: number;
}

export const DateStampLayer = memo(function DateStampLayer({ text, typeface, width, height }: Props) {
  const layout = useMemo(() => layoutDateStamp(text, typeface, width, height), [text, typeface, width, height]);
  return (
    <Group color={colors.dateStamp}>
      <Group opacity={0.55}>
        <BlurMask blur={layout.glow} style="normal" />
        <Glyphs layout={layout} />
      </Group>
      <Group opacity={0.92}>
        <Glyphs layout={layout} />
      </Group>
    </Group>
  );
});

export const DATE_STAMP_FONT = require('../../assets/fonts/DSEG7Classic-Bold.ttf');
