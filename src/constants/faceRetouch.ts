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
  { id: 'skin', label: '피부' },
  { id: 'face', label: '얼굴형' },
  { id: 'eyes', label: '눈' },
  { id: 'nose', label: '코' },
  { id: 'lips', label: '입' },
  { id: 'proportion', label: '비율' },
];

export const SKIN_TOOLS: readonly ControlSpec<RetouchKey>[] = [
  { key: 'skin', label: '피부결', icon: 'happy-outline', min: 0, max: 100 },
  { key: 'smooth', label: '잡티 완화', icon: 'sparkles-outline', min: 0, max: 100 },
  { key: 'tone', label: '톤 보정', icon: 'color-wand-outline', min: -100, max: 100 },
  { key: 'glow', label: '광채', icon: 'sunny-outline', min: 0, max: 100 },
  { key: 'detail', label: '디테일', icon: 'eye-outline', min: 0, max: 100 },
];

export const FACE_TOOLS: Record<FaceCategory, readonly ControlSpec<FaceRetouchKey>[]> = {
  face: [
    { key: 'slim', label: '갸름하게', icon: 'contract-outline', min: 0, max: 100 },
    { key: 'faceWidth', label: '얼굴 너비', icon: 'swap-horizontal-outline', min: -100, max: 100 },
    { key: 'jaw', label: '턱', icon: 'chevron-down-outline', min: 0, max: 100 },
    { key: 'chin', label: '턱끝', icon: 'triangle-outline', min: -100, max: 100 },
    { key: 'vLine', label: 'V라인', icon: 'chevron-collapse-outline', min: 0, max: 100 },
    { key: 'cheek', label: '광대', icon: 'ellipse-outline', min: 0, max: 100 },
    { key: 'forehead', label: '이마', icon: 'radio-button-off-outline', min: -100, max: 100 },
  ],
  eyes: [
    { key: 'eyeSize', label: '눈 크기', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'eyeWidth', label: '눈 길이', icon: 'code-outline', min: -100, max: 100 },
    { key: 'eyeHeight', label: '눈 높이', icon: 'chevron-expand-outline', min: -100, max: 100 },
    { key: 'eyeDistance', label: '눈 사이', icon: 'code-working-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: '눈 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'outerCorner', label: '눈꼬리', icon: 'trending-up-outline', min: -100, max: 100 },
  ],
  nose: [
    { key: 'noseSlim', label: '콧대', icon: 'contract-outline', min: 0, max: 100 },
    { key: 'noseWidth', label: '코 너비', icon: 'swap-horizontal-outline', min: -100, max: 100 },
    { key: 'noseTip', label: '코끝', icon: 'ellipse-outline', min: -100, max: 100 },
    { key: 'noseSize', label: '코 크기', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'noseLength', label: '코 길이', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'noseWing', label: '콧볼', icon: 'chevron-collapse-outline', min: 0, max: 100 },
  ],
  lips: [
    { key: 'lipSize', label: '입술 크기', icon: 'heart-outline', min: -100, max: 100 },
    { key: 'lipWidth', label: '입 너비', icon: 'code-outline', min: -100, max: 100 },
    { key: 'upperLip', label: '윗입술', icon: 'arrow-up-outline', min: -100, max: 100 },
    { key: 'lowerLip', label: '아랫입술', icon: 'arrow-down-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: '입 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'smile', label: '미소', icon: 'happy-outline', min: 0, max: 100 },
  ],
  proportion: [
    { key: 'midface', label: '중안부', icon: 'reorder-three-outline', min: -100, max: 100 },
    { key: 'faceLength', label: '얼굴 길이', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'upperFace', label: '상안부', icon: 'arrow-up-circle-outline', min: -100, max: 100 },
    { key: 'lowerFace', label: '하안부', icon: 'podium-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: '눈 위치', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'nosePosition', label: '코 위치', icon: 'locate-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: '입 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
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
