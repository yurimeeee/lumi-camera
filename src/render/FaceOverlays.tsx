import { Path, Points, Skia, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import type { DetectedFace, Point } from '@/services/faceDetection/types';
import { warpForward, type FaceWarpPlan } from '@/services/faceWarp/FaceWarpEngine';
import { sourceToFrame } from '@/services/frameCoords';
import type { Geometry } from '@/types/editing';

type Px = { x: number; y: number };

/** Moves overlay points with the face warp so they stay on the reshaped face. */
const follow = (pts: readonly Px[], plan: FaceWarpPlan | null) => (plan ? pts.map((p) => warpForward(p, plan)) : pts);

function smoothClosedPath(pts: readonly Px[]) {
  const path = Skia.Path.Make();
  const n = pts.length;
  if (n < 3) return path;
  // Quadratic curves through edge midpoints: a soft outline, no corners.
  const mid = (a: Px, b: Px) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1]!, pts[0]!);
  path.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % n]!);
    path.quadTo(p.x, p.y, m.x, m.y);
  }
  path.close();
  return path;
}

/**
 * Face picker for photos with several faces: a hairline outline per face,
 * brighter on the one being edited. Deliberately quiet so it never competes
 * with the photo.
 */
export const FaceGuides = memo(function FaceGuides({
  outlines,
  selectedId,
  plan,
}: {
  outlines: readonly { id: string; points: readonly Px[] }[];
  selectedId: string | null;
  plan: FaceWarpPlan | null;
}) {
  const paths = useMemo(
    () => outlines.map((o) => ({ id: o.id, path: smoothClosedPath(follow(o.points, plan)) })),
    [outlines, plan],
  );
  return (
    <>
      {paths.map(({ id, path }) => {
        const selected = id === selectedId;
        return (
          <Path
            key={id}
            path={path}
            style="stroke"
            strokeWidth={selected ? 1.5 : 1}
            color={selected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)'}
          />
        );
      })}
    </>
  );
});

const GROUP_COLORS = {
  mesh: 'rgba(255,255,255,0.45)',
  contour: '#F5D76E',
  eyes: '#6ED3F5',
  brows: '#F5A66E',
  nose: '#8BE07A',
  lips: '#F57A8B',
} as const;

/**
 * Dev-only landmark dots, coloured by region (face contour, eyes, brows,
 * nose, lips; plus the dense mesh when the detector has one), to check that
 * each region tracks the face. They follow the warp, so on the After view
 * they should sit on the reshaped features.
 */
export const LandmarkDebugLayer = memo(function LandmarkDebugLayer({
  faces,
  geometry,
  width,
  height,
  plan,
}: {
  faces: readonly DetectedFace[];
  geometry: Geometry;
  width: number;
  height: number;
  plan: FaceWarpPlan | null;
}) {
  const groups = useMemo(() => {
    const toPx = (ps: readonly Point[]) =>
      follow(
        ps.map((p) => {
          const q = sourceToFrame(p, geometry);
          return { x: q.x * width, y: q.y * height };
        }),
        plan,
      ).map((p) => vec(p.x, p.y));
    const out: { key: string; color: string; size: number; points: ReturnType<typeof vec>[] }[] = [];
    for (const f of faces) {
      const lm = f.landmarks;
      if (lm.mesh) out.push({ key: `${f.id}-mesh`, color: GROUP_COLORS.mesh, size: 1.5, points: toPx(lm.mesh) });
      out.push({ key: `${f.id}-contour`, color: GROUP_COLORS.contour, size: 3, points: toPx(lm.faceContour) });
      out.push({ key: `${f.id}-eyes`, color: GROUP_COLORS.eyes, size: 3, points: toPx([...lm.leftEye.contour, ...lm.rightEye.contour, lm.leftEye.center, lm.rightEye.center]) });
      out.push({ key: `${f.id}-brows`, color: GROUP_COLORS.brows, size: 3, points: toPx([...lm.leftEyebrow, ...lm.rightEyebrow]) });
      out.push({
        key: `${f.id}-nose`,
        color: GROUP_COLORS.nose,
        size: 3,
        points: toPx([...lm.nose.bridge, lm.nose.tip, lm.nose.leftWing, lm.nose.rightWing, lm.nose.base, lm.nose.leftNostril, lm.nose.rightNostril]),
      });
      out.push({ key: `${f.id}-lips`, color: GROUP_COLORS.lips, size: 3, points: toPx([...lm.lips.outer, ...lm.lips.inner, lm.philtrum]) });
    }
    return out;
  }, [faces, geometry, width, height, plan]);

  return (
    <>
      {groups.map((g) => (
        <Points key={g.key} points={g.points} mode="points" color={g.color} strokeWidth={g.size} strokeCap="round" />
      ))}
    </>
  );
});
