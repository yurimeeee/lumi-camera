import { Group, Rect, RoundedRect } from '@shopify/react-native-skia';
import { memo } from 'react';

import type { FrameSettings } from '@/types/film';

import { brightness, shade, type FrameLayout } from './frameLayout';

interface Props {
  frame: FrameSettings;
  layout: FrameLayout;
}

/**
 * The frame around the photo (drawn under it): border colour, an optional
 * mat, film strip sprocket holes, 35mm edge marks, a print's rounded edge.
 * Drawn at the layout's own coordinates (0, 0 = outer top-left).
 */
export const FrameLayer = memo(function FrameLayer({ frame, layout }: Props) {
  if (frame.id === 'none') return null;
  const dark = brightness(frame.color) < 0.5;
  const matColor = shade(frame.color, dark ? 0.12 : -0.05);
  return (
    <Group>
      <RoundedRect x={0} y={0} width={layout.width} height={layout.height} r={layout.outerRadius} color={frame.color} />
      {layout.mat ? (
        <RoundedRect
          x={layout.mat.x}
          y={layout.mat.y}
          width={layout.mat.width}
          height={layout.mat.height}
          r={layout.radius * 1.2}
          color={matColor}
        />
      ) : null}
      {layout.holes.map((h, i) => (
        <RoundedRect key={i} x={h.x} y={h.y} width={h.width} height={h.height} r={h.width * 0.18} color="#E9E2D6" />
      ))}
      {layout.marks.map((m, i) => (
        <Rect key={i} x={m.x} y={m.y} width={m.width} height={m.height} color="#D9822B" opacity={0.75} />
      ))}
    </Group>
  );
});
