import type { ControlSpec } from '@/constants/adjustments';
import type { FaceRetouch, FaceRetouchKey, RetouchKey } from '@/types/editing';

/**
 * Retouch tab: Skin (colour/texture, works on any photo) + face shape and
 * feature controls (need face landmarks). UI values only — the warp engine
 * (services/faceWarp) maps them to face-relative deformations.
 */

export type RetouchCategory = 'skin' | 'face' | 'eyes' | 'nose' | 'lips' | 'proportion';
export type FaceCategory = Exclude<RetouchCategory, 'skin'>;

export const RETOUCH_CATEGORIES: readonly { id: RetouchCategory; label: string }[] = [
  { id: 'skin', label: 'Skin' },
  { id: 'face', label: 'Face' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'nose', label: 'Nose' },
  { id: 'lips', label: 'Lips' },
  { id: 'proportion', label: 'Proportion' },
];

export const SKIN_TOOLS: readonly ControlSpec<RetouchKey>[] = [
  { key: 'skin', label: 'Soften', icon: 'happy-outline', min: 0, max: 100 },
  { key: 'smooth', label: 'Smooth', icon: 'sparkles-outline', min: 0, max: 100 },
  { key: 'tone', label: 'Tone', icon: 'color-wand-outline', min: -100, max: 100 },
  { key: 'glow', label: 'Glow', icon: 'sunny-outline', min: 0, max: 100 },
  { key: 'detail', label: 'Detail', icon: 'eye-outline', min: 0, max: 100 },
];

export const FACE_TOOLS: Record<FaceCategory, readonly ControlSpec<FaceRetouchKey>[]> = {
  face: [
    { key: 'slim', label: 'Slim', icon: 'contract-outline', min: 0, max: 100 },
    { key: 'faceWidth', label: 'Width', icon: 'swap-horizontal-outline', min: -100, max: 100 },
    { key: 'jaw', label: 'Jaw', icon: 'chevron-down-outline', min: 0, max: 100 },
    { key: 'chin', label: 'Chin', icon: 'triangle-outline', min: -100, max: 100 },
    { key: 'vLine', label: 'V-Line', icon: 'chevron-collapse-outline', min: 0, max: 100 },
    { key: 'cheek', label: 'Cheek', icon: 'ellipse-outline', min: 0, max: 100 },
    { key: 'forehead', label: 'Forehead', icon: 'radio-button-off-outline', min: -100, max: 100 },
  ],
  eyes: [
    { key: 'eyeSize', label: 'Eye Size', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'eyeWidth', label: 'Eye Width', icon: 'code-outline', min: -100, max: 100 },
    { key: 'eyeHeight', label: 'Eye Height', icon: 'chevron-expand-outline', min: -100, max: 100 },
    { key: 'eyeDistance', label: 'Eye Distance', icon: 'code-working-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: 'Eye Position', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'outerCorner', label: 'Outer Corner', icon: 'trending-up-outline', min: -100, max: 100 },
  ],
  nose: [
    { key: 'noseSlim', label: 'Slim Nose', icon: 'contract-outline', min: 0, max: 100 },
    { key: 'noseWidth', label: 'Nose Width', icon: 'swap-horizontal-outline', min: -100, max: 100 },
    { key: 'noseTip', label: 'Nose Tip', icon: 'ellipse-outline', min: -100, max: 100 },
    { key: 'noseSize', label: 'Nose Size', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'noseLength', label: 'Nose Length', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'noseWing', label: 'Nose Wing', icon: 'chevron-collapse-outline', min: 0, max: 100 },
  ],
  lips: [
    { key: 'lipSize', label: 'Lip Size', icon: 'heart-outline', min: -100, max: 100 },
    { key: 'lipWidth', label: 'Lip Width', icon: 'code-outline', min: -100, max: 100 },
    { key: 'upperLip', label: 'Upper Lip', icon: 'arrow-up-outline', min: -100, max: 100 },
    { key: 'lowerLip', label: 'Lower Lip', icon: 'arrow-down-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: 'Mouth Position', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'smile', label: 'Smile', icon: 'happy-outline', min: 0, max: 100 },
  ],
  proportion: [
    { key: 'midface', label: 'Midface', icon: 'reorder-three-outline', min: -100, max: 100 },
    { key: 'faceLength', label: 'Face Length', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'upperFace', label: 'Upper Face', icon: 'arrow-up-circle-outline', min: -100, max: 100 },
    { key: 'lowerFace', label: 'Lower Face', icon: 'podium-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: 'Eye Position', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'nosePosition', label: 'Nose Position', icon: 'locate-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: 'Mouth Position', icon: 'swap-vertical-outline', min: -100, max: 100 },
  ],
};

/** Keys each face category's "Reset …" clears. Proportion shares eye/mouth position with Eyes/Lips. */
export const FACE_CATEGORY_KEYS: Record<FaceCategory, readonly FaceRetouchKey[]> = {
  face: FACE_TOOLS.face.map((t) => t.key),
  eyes: FACE_TOOLS.eyes.map((t) => t.key),
  nose: FACE_TOOLS.nose.map((t) => t.key),
  lips: FACE_TOOLS.lips.map((t) => t.key),
  proportion: FACE_TOOLS.proportion.map((t) => t.key),
};

export const DEFAULT_FACE_RETOUCH: FaceRetouch = {
  slim: 0,
  faceWidth: 0,
  jaw: 0,
  chin: 0,
  vLine: 0,
  cheek: 0,
  forehead: 0,
  eyeSize: 0,
  eyeWidth: 0,
  eyeHeight: 0,
  eyeDistance: 0,
  eyePosition: 0,
  outerCorner: 0,
  noseSlim: 0,
  noseWidth: 0,
  noseTip: 0,
  noseSize: 0,
  noseLength: 0,
  noseWing: 0,
  lipSize: 0,
  lipWidth: 0,
  upperLip: 0,
  lowerLip: 0,
  mouthPosition: 0,
  smile: 0,
  midface: 0,
  faceLength: 0,
  upperFace: 0,
  lowerFace: 0,
  nosePosition: 0,
};

export const FACE_RETOUCH_KEYS = Object.keys(DEFAULT_FACE_RETOUCH) as FaceRetouchKey[];

export function isNeutralFace(r: FaceRetouch | undefined): boolean {
  return !r || FACE_RETOUCH_KEYS.every((k) => r[k] === 0);
}

export function hasFaceEdits(faces: Readonly<Record<string, FaceRetouch>>): boolean {
  return Object.values(faces).some((r) => !isNeutralFace(r));
}
