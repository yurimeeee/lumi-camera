import { hasFaceEdits } from '@/constants/faceRetouch';
import type { DetectedFace } from '@/services/faceDetection/types';
import type { EditState, Geometry, Retouch } from '@/types/editing';

import { buildFaceWarp, faceWarpUniforms, NO_FACE_WARP, prepareFaceInputs, type FaceWarpPlan, type FaceWarpUniforms } from './FaceWarpEngine';
import { buildFaceRegions, NO_REGIONS, prepareRegionInputs, regionUniforms, type Region, type RegionUniforms } from './regions';

/**
 * Everything face-related one render needs — the warp and the skin regions —
 * from the same detected landmarks and the same edit, for any render size.
 * The editor preview and the export both call this, so they agree.
 */

/** Global skin smoothing protects eyes, brows, lips and nostrils when faces are known. */
export function usesSkinProtection(retouch: Partial<Retouch>): boolean {
  return (retouch.skin ?? 0) > 0 || (retouch.smooth ?? 0) > 0 || (retouch.texture ?? 0) !== 0;
}

/** Whether rendering `edit` needs face landmarks at all. */
export function needsFaces(edit: Pick<EditState, 'faces' | 'retouch'>): boolean {
  return hasFaceEdits(edit.faces) || usesSkinProtection(edit.retouch);
}

export interface FaceRender {
  plan: FaceWarpPlan | null;
  warp: FaceWarpUniforms;
  regions: RegionUniforms;
  /** The regions themselves (dev overlay). */
  regionList: readonly Region[];
  /** Anything for the shader to do. */
  active: boolean;
}

export const NO_FACE_RENDER: FaceRender = { plan: null, warp: NO_FACE_WARP, regions: NO_REGIONS, regionList: [], active: false };

export function faceRender(
  faces: readonly DetectedFace[],
  edit: Pick<EditState, 'faces' | 'retouch'>,
  geometry: Geometry,
  width: number,
  height: number,
): FaceRender {
  if (faces.length === 0 || !needsFaces(edit)) return NO_FACE_RENDER;
  const plan = buildFaceWarp(prepareFaceInputs(faces, edit.faces, geometry), width, height);
  const regions = buildFaceRegions(prepareRegionInputs(faces, edit.faces, geometry), width, height, usesSkinProtection(edit.retouch));
  return {
    plan,
    warp: faceWarpUniforms(plan),
    regions: regionUniforms(regions),
    regionList: regions,
    active: plan !== null || regions.length > 0,
  };
}
