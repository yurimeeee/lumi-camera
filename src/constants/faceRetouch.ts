import type { ControlSpec } from '@/constants/adjustments';
import type { EyeShapeKey, EyeSideKey, FaceRetouch, FaceRetouchKey, RetouchKey } from '@/types/editing';

/**
 * Retouch tab: Skin (texture/tone on any photo, plus region tools that need
 * a face) and the landmark-based face tools (Face, Eyes, Nose, Lips,
 * Proportion). UI values only — the warp engine (services/faceWarp) and the
 * face regions (services/faceWarp/regions) map them to face-relative changes.
 */

export type RetouchCategory = 'skin' | 'face' | 'eyes' | 'nose' | 'lips' | 'proportion';
export type FaceCategory = Exclude<RetouchCategory, 'skin'>;

export const RETOUCH_CATEGORIES: readonly { id: RetouchCategory; label: string }[] = [
  { id: 'skin', label: '피부' },
  { id: 'face', label: '얼굴형' },
  { id: 'eyes', label: '눈' },
  { id: 'nose', label: '코' },
  { id: 'lips', label: '입술' },
  { id: 'proportion', label: '비율' },
];

/** Skin tools that act on one face's regions (under-eye, eyes, mouth, creases); stored per face. */
export type FaceSkinKey = Extract<FaceRetouchKey, 'darkCircle' | 'wrinkle' | 'redness' | 'teeth' | 'eyeBright'>;
export type SkinToolKey = RetouchKey | FaceSkinKey;

export const FACE_SKIN_KEYS: readonly FaceSkinKey[] = ['darkCircle', 'wrinkle', 'redness', 'teeth', 'eyeBright'];

export function isFaceSkinKey(key: SkinToolKey): key is FaceSkinKey {
  return (FACE_SKIN_KEYS as readonly string[]).includes(key);
}

export const SKIN_TOOLS: readonly ControlSpec<SkinToolKey>[] = [
  { key: 'skin', label: '매끈하게', icon: 'happy-outline', min: 0, max: 100 },
  { key: 'texture', label: '피부결', icon: 'finger-print-outline', min: -100, max: 100 },
  { key: 'smooth', label: '잡티 완화', icon: 'sparkles-outline', min: 0, max: 100 },
  { key: 'darkCircle', label: '다크서클', icon: 'moon-outline', min: 0, max: 100 },
  { key: 'wrinkle', label: '주름', icon: 'reorder-two-outline', min: 0, max: 100 },
  { key: 'tone', label: '피부 톤', icon: 'color-wand-outline', min: -100, max: 100 },
  { key: 'redness', label: '홍조', icon: 'flame-outline', min: 0, max: 100 },
  { key: 'glow', label: '광채', icon: 'sunny-outline', min: 0, max: 100 },
  { key: 'teeth', label: '치아 미백', icon: 'ellipsis-horizontal-outline', min: 0, max: 100 },
  { key: 'eyeBright', label: '눈 밝게', icon: 'eye-outline', min: 0, max: 100 },
  { key: 'detail', label: '디테일', icon: 'aperture-outline', min: 0, max: 100 },
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
    { key: 'faceLength', label: '얼굴 길이', icon: 'resize-outline', min: -100, max: 100 },
  ],
  eyes: [
    { key: 'eyeSize', label: '눈 크기', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'eyeWidth', label: '눈 길이', icon: 'code-outline', min: -100, max: 100 },
    { key: 'eyeHeight', label: '눈 높이', icon: 'chevron-expand-outline', min: -100, max: 100 },
    { key: 'eyeDistance', label: '눈 사이', icon: 'code-working-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: '눈 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'eyeAngle', label: '눈 각도', icon: 'sync-outline', min: -100, max: 100 },
    { key: 'outerCorner', label: '눈꼬리', icon: 'trending-up-outline', min: -100, max: 100 },
    { key: 'underEye', label: '애교살', icon: 'remove-outline', min: 0, max: 100 },
  ],
  nose: [
    { key: 'noseWidth', label: '코 너비', icon: 'swap-horizontal-outline', min: -100, max: 100 },
    { key: 'noseWing', label: '콧볼', icon: 'chevron-collapse-outline', min: 0, max: 100 },
    { key: 'noseTip', label: '코끝', icon: 'ellipse-outline', min: -100, max: 100 },
    { key: 'noseLength', label: '코 길이', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'noseSize', label: '코 크기', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'noseSlim', label: '콧대', icon: 'contract-outline', min: 0, max: 100 },
    { key: 'nostril', label: '콧구멍', icon: 'ellipsis-horizontal-outline', min: -100, max: 100 },
  ],
  lips: [
    { key: 'lipWidth', label: '입 너비', icon: 'code-outline', min: -100, max: 100 },
    { key: 'lipSize', label: '입술 크기', icon: 'heart-outline', min: -100, max: 100 },
    { key: 'upperLip', label: '윗입술', icon: 'arrow-up-outline', min: -100, max: 100 },
    { key: 'lowerLip', label: '아랫입술', icon: 'arrow-down-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: '입 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
    { key: 'mouthCorner', label: '입꼬리', icon: 'trending-up-outline', min: -100, max: 100 },
    { key: 'smile', label: '미소', icon: 'happy-outline', min: 0, max: 100 },
    { key: 'philtrum', label: '인중', icon: 'reorder-three-outline', min: -100, max: 100 },
  ],
  proportion: [
    { key: 'midface', label: '중안부', icon: 'reorder-three-outline', min: -100, max: 100 },
    { key: 'upperFace', label: '상안부', icon: 'arrow-up-circle-outline', min: -100, max: 100 },
    { key: 'lowerFace', label: '하안부', icon: 'podium-outline', min: -100, max: 100 },
    { key: 'faceLength', label: '얼굴 길이', icon: 'resize-outline', min: -100, max: 100 },
    { key: 'eyePosition', label: '눈 위치', icon: 'eye-outline', min: -100, max: 100 },
    { key: 'nosePosition', label: '코 위치', icon: 'locate-outline', min: -100, max: 100 },
    { key: 'mouthPosition', label: '입 위치', icon: 'swap-vertical-outline', min: -100, max: 100 },
  ],
};

// ── Per-eye values ──────────────────────────────────────────────

export type EyeSide = 'both' | 'L' | 'R';

export const EYE_SHAPE_KEYS: readonly EyeShapeKey[] = ['eyeSize', 'eyeWidth', 'eyeHeight', 'eyePosition', 'eyeAngle', 'outerCorner'];

export function isEyeShapeKey(key: FaceRetouchKey): key is EyeShapeKey {
  return (EYE_SHAPE_KEYS as readonly string[]).includes(key);
}

export const eyeSideKey = (key: EyeShapeKey, side: 'L' | 'R'): EyeSideKey => `${key}${side}`;

/** The key a slider edits: the per-eye offset when one eye is selected and the control supports it. */
export function sidedKey(key: FaceRetouchKey, side: EyeSide): FaceRetouchKey {
  return side !== 'both' && isEyeShapeKey(key) ? eyeSideKey(key, side) : key;
}

/** Value applied to one eye: both-eyes value + that eye's offset. */
export function eyeValue(r: FaceRetouch, key: EyeShapeKey, side: 'L' | 'R'): number {
  return r[key] + r[eyeSideKey(key, side)];
}

// ── Categories / defaults ───────────────────────────────────────

const SIDE_KEYS: EyeSideKey[] = EYE_SHAPE_KEYS.flatMap((k) => [eyeSideKey(k, 'L'), eyeSideKey(k, 'R')]);

/** Keys each face category's "Reset …" clears. Proportion shares eye/mouth position and face length. */
export const FACE_CATEGORY_KEYS: Record<FaceCategory, readonly FaceRetouchKey[]> = {
  face: FACE_TOOLS.face.map((t) => t.key),
  eyes: [...FACE_TOOLS.eyes.map((t) => t.key), ...SIDE_KEYS],
  nose: FACE_TOOLS.nose.map((t) => t.key),
  lips: FACE_TOOLS.lips.map((t) => t.key),
  proportion: FACE_TOOLS.proportion.map((t) => t.key),
};

const BASE_KEYS = [
  'slim',
  'faceWidth',
  'jaw',
  'chin',
  'vLine',
  'cheek',
  'forehead',
  'eyeSize',
  'eyeWidth',
  'eyeHeight',
  'eyeDistance',
  'eyePosition',
  'eyeAngle',
  'outerCorner',
  'underEye',
  'noseSlim',
  'noseWidth',
  'noseTip',
  'noseSize',
  'noseLength',
  'noseWing',
  'nostril',
  'lipSize',
  'lipWidth',
  'upperLip',
  'lowerLip',
  'mouthPosition',
  'smile',
  'mouthCorner',
  'philtrum',
  'midface',
  'faceLength',
  'upperFace',
  'lowerFace',
  'nosePosition',
  'darkCircle',
  'wrinkle',
  'redness',
  'teeth',
  'eyeBright',
] as const satisfies readonly FaceRetouchKey[];

// Compile-time check that BASE_KEYS lists every control.
type MissingKey = Exclude<FaceRetouchKey, (typeof BASE_KEYS)[number] | EyeSideKey>;
const ALL_LISTED: [MissingKey] extends [never] ? true : MissingKey = true;
void ALL_LISTED;

export const FACE_RETOUCH_KEYS: readonly FaceRetouchKey[] = [...BASE_KEYS, ...SIDE_KEYS];

export const DEFAULT_FACE_RETOUCH: FaceRetouch = Object.fromEntries(FACE_RETOUCH_KEYS.map((k) => [k, 0])) as FaceRetouch;

/** Fills keys added in later versions (restored projects) with 0. */
export function completeFaceRetouch(r: Partial<FaceRetouch> | undefined): FaceRetouch {
  return { ...DEFAULT_FACE_RETOUCH, ...r };
}

export function isNeutralFace(r: Partial<FaceRetouch> | undefined): boolean {
  return !r || FACE_RETOUCH_KEYS.every((k) => !r[k]);
}

export function hasFaceEdits(faces: Readonly<Record<string, Partial<FaceRetouch>>>): boolean {
  return Object.values(faces).some((r) => !isNeutralFace(r));
}

/** Keys that only change tone inside face regions (no geometry). */
export const FACE_TONE_KEYS: readonly FaceRetouchKey[] = [...FACE_SKIN_KEYS, 'underEye'];
