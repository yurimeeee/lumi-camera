import type { AiMaskTarget, MaskImageRef } from '@/types/phase4';

import { fileExists } from '../appFiles';

import { backend } from './backend';
import type { SegmentationSource, SegmentKind } from './types';

/**
 * Entry point for AI segmentation (subject, person, skin, tap-to-select).
 * Results are cached per photo, so the background stage and AI masks of the
 * same photo share one run. Everything runs on the device: Apple Vision on
 * iOS, MediaPipe in the browser — no photo leaves it.
 */

export const SEGMENTATION_BACKEND = backend?.id ?? null;

/** Which AI mask targets this platform can produce. Sky needs a sky model Lumi doesn't ship. */
export function aiTargetSupport(): Record<AiMaskTarget, boolean> {
  const s = backend?.supports;
  return {
    subject: !!s?.subject,
    background: !!s?.subject,
    person: !!s?.person,
    skin: !!s?.skin,
    sky: false,
  };
}

export const TAP_SELECT_SUPPORTED = !!backend?.supports.tap;

const cache = new Map<string, Promise<MaskImageRef>>();

export function segment(source: SegmentationSource, kind: SegmentKind): Promise<MaskImageRef> {
  if (!backend || !backend.supports[kind]) return Promise.reject(new Error('unsupported'));
  const key = `${source.uri}|${kind}`;
  let p = cache.get(key);
  // Unused mask files are pruned (editProject.pruneStoredOriginals): re-run if this one is gone.
  if (p) {
    const cached = p;
    p = cached.then((r) => (fileExists(r.uri) ? r : (cache.delete(key), segment(source, kind))));
  }
  if (!p) {
    p = backend.segment(source, kind);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** The kind of mask an AI target needs (background = the subject, inverted by the mask). */
export function kindOf(target: AiMaskTarget): SegmentKind {
  return target === 'person' ? 'person' : target === 'skin' ? 'skin' : 'subject';
}

export function segmentAt(source: SegmentationSource, point: { x: number; y: number }): Promise<MaskImageRef | null> {
  if (!backend?.supports.tap) return Promise.resolve(null);
  return backend.segmentAt(source, point);
}
