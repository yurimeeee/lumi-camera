import type { BlemishSpot, Geometry, SourceImage } from '@/types/editing';

import { frameSize, sourceToFrame } from './reshape';

/** Shader array size: keep in sync with `uSpots` in lumiShader. */
export const MAX_SPOTS = 48;

const EMPTY = new Array<number>(MAX_SPOTS * 3).fill(0);

export type SpotUniforms = { uSpots: number[]; uSpotCount: number };

export const NO_SPOTS: SpotUniforms = { uSpots: EMPTY, uSpotCount: 0 };

/** 잡티 제거 spots as shader uniforms (centre + radius in render-target pixels). */
export function spotUniforms(
  spots: readonly BlemishSpot[] | null | undefined,
  geometry: Geometry,
  source: Pick<SourceImage, 'width' | 'height'>,
  width: number,
  height: number,
): SpotUniforms {
  if (!spots?.length) return NO_SPOTS;
  const frame = frameSize(source.width, source.height, geometry);
  // Source pixels → render pixels (the frame is a uniform scale of the source).
  const scale = width / frame.width;
  const srcShort = Math.min(source.width, source.height);
  const out = EMPTY.slice();
  let n = 0;
  for (const spot of spots.slice(-MAX_SPOTS)) {
    const f = sourceToFrame(spot, geometry);
    out[n * 3] = f.x * width;
    out[n * 3 + 1] = f.y * height;
    out[n * 3 + 2] = spot.radius * srcShort * scale;
    n++;
  }
  return { uSpots: out, uSpotCount: n };
}
