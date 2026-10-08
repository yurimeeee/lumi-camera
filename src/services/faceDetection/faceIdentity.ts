import type { FaceAnchor } from '@/types/editing';

import type { DetectedFace } from './types';

/**
 * Stable face ids across detections.
 *
 * Detection numbers faces largest first (`face-0`, `face-1`, …), which is
 * stable for one image and one detector. A face's edits are stored under its
 * id together with an anchor (where the face was when first edited). When a
 * later detection could order faces differently — a restored project, another
 * detector version, a near tie in size — faces are matched to the anchors by
 * position, so edits never jump to another person.
 */

/** Anchor of a detected face (source-normalised centre, size against the larger image side). */
export function anchorOf(face: Pick<DetectedFace, 'bounds'>, imageWidth: number, imageHeight: number): FaceAnchor {
  const b = face.bounds;
  const long = Math.max(imageWidth, imageHeight);
  return {
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
    size: Math.max(b.width * imageWidth, b.height * imageHeight) / long,
  };
}

/** A face matches an anchor when their centres are closer than this share of the face size (and sizes agree within 2×). */
const MATCH_DISTANCE = 0.5;

/**
 * Renames `faces` (fresh detection, largest first) so faces near a stored
 * anchor take that anchor's id; the rest get the lowest free `face-N`. Pairs
 * are taken closest first, so two people standing close never swap.
 */
export function assignFaceIds(
  faces: readonly DetectedFace[],
  anchors: Readonly<Record<string, FaceAnchor>>,
  imageWidth: number,
  imageHeight: number,
): DetectedFace[] {
  const ids = Object.keys(anchors);
  if (ids.length === 0 || faces.length === 0) return faces.map((f, i) => ({ ...f, id: `face-${i}` }));
  const aspect = imageHeight / imageWidth;
  const long = Math.max(imageWidth, imageHeight);
  const pairs: { face: number; id: string; d: number }[] = [];
  faces.forEach((f, fi) => {
    const a = anchorOf(f, imageWidth, imageHeight);
    for (const id of ids) {
      const b = anchors[id]!;
      const ratio = a.size / Math.max(1e-6, b.size);
      if (ratio > 2 || ratio < 0.5) continue;
      // Distance in pixels of the larger side, relative to the face size.
      const dx = ((a.x - b.x) * imageWidth) / long;
      const dy = ((a.y - b.y) * imageWidth * aspect) / long;
      const d = Math.hypot(dx, dy) / Math.max(1e-6, Math.max(a.size, b.size));
      if (d <= MATCH_DISTANCE) pairs.push({ face: fi, id, d });
    }
  });
  pairs.sort((p, q) => p.d - q.d);
  const byFace = new Map<number, string>();
  // Ids of anchors whose face wasn't found stay reserved: a new face must not
  // inherit someone else's edits.
  const reserved = new Set<string>(ids);
  const taken = new Set<string>();
  for (const p of pairs) {
    if (byFace.has(p.face) || taken.has(p.id)) continue;
    byFace.set(p.face, p.id);
    taken.add(p.id);
  }
  let next = 0;
  const freshId = () => {
    while (taken.has(`face-${next}`) || reserved.has(`face-${next}`)) next++;
    const id = `face-${next}`;
    taken.add(id);
    return id;
  };
  // Matched ids first, so unmatched faces can't take an anchor's id.
  return faces.map((f, i) => ({ ...f, id: byFace.get(i) ?? '' })).map((f) => (f.id ? f : { ...f, id: freshId() }));
}
