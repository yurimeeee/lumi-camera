import { AlphaType, ColorType, ImageFormat, Skia } from '@shopify/react-native-skia';
import type { ImageSegmenter, InteractiveSegmenterLegacy, MPMask } from '@mediapipe/tasks-vision';

import { writeMaskPng } from '../appFiles';
import { loadImageElement, mediapipe, quiet } from '../mediapipe.web';

import { MASK_STORE_SIDE, type SegmentationBackend, type SegmentKind } from './types';

/**
 * Web: MediaPipe segmentation models (Apache-2.0, fetched from Google's
 * model storage on first use):
 * - selfie_multiclass_256x256 (16 MB): person, hair, body / face skin, clothes —
 *   soft confidence masks, used for Person, Skin and people in Subject;
 * - deeplab_v3 (2.8 MB): 20 PASCAL VOC object classes (animals, vehicles,
 *   furniture…), joined with the person matte for Subject;
 * - magic_touch (6 MB): the object under a tap.
 * Run on the CPU delegate (Skia already holds the page's WebGL contexts).
 */
const MODELS = {
  multiclass: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  deeplab: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
  tap: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
};

let multiclass: Promise<ImageSegmenter> | null = null;
let deeplab: Promise<ImageSegmenter> | null = null;
let tapper: Promise<InteractiveSegmenterLegacy> | null = null;

function lazy<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, make: () => Promise<T>): Promise<T> {
  let p = get();
  if (!p) {
    p = make();
    set(p);
    p.catch(() => set(null));
  }
  return p;
}

const getMulticlass = () =>
  lazy(
    () => multiclass,
    (p) => (multiclass = p),
    async () => {
      const { vision, fileset } = await mediapipe();
      return quiet(() =>
        vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.multiclass, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      );
    },
  );

const getDeeplab = () =>
  lazy(
    () => deeplab,
    (p) => (deeplab = p),
    async () => {
      const { vision, fileset } = await mediapipe();
      return quiet(() =>
        vision.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.deeplab, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputConfidenceMasks: false,
          outputCategoryMask: true,
        }),
      );
    },
  );

const getTapper = () =>
  lazy(
    () => tapper,
    (p) => (tapper = p),
    async () => {
      const { vision, fileset } = await mediapipe();
      return quiet(() =>
        vision.InteractiveSegmenterLegacy.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.tap, delegate: 'CPU' },
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
      );
    },
  );

interface Plane {
  width: number;
  height: number;
  /** 0…1 */
  data: Float32Array;
}

function floatPlane(m: MPMask): Plane {
  return { width: m.width, height: m.height, data: Float32Array.from(m.getAsFloat32Array()) };
}

/** Category mask → 1 where `pick(category)`. */
function categoryPlane(m: MPMask, pick: (c: number) => boolean): Plane {
  const a = m.getAsUint8Array();
  const data = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) data[i] = pick(a[i]!) ? 1 : 0;
  return { width: m.width, height: m.height, data };
}

/** Per-pixel max of planes (all resampled to the first one's size, nearest). */
function union(planes: Plane[]): Plane {
  const [first, ...rest] = planes;
  const out = Float32Array.from(first!.data);
  for (const p of rest) {
    for (let y = 0; y < first!.height; y++) {
      const sy = Math.min(p.height - 1, Math.floor((y / first!.height) * p.height));
      for (let x = 0; x < first!.width; x++) {
        const sx = Math.min(p.width - 1, Math.floor((x / first!.width) * p.width));
        const v = p.data[sy * p.width + sx]!;
        const i = y * first!.width + x;
        if (v > out[i]!) out[i] = v;
      }
    }
  }
  return { ...first!, data: out };
}

/** Encodes a plane as a greyscale PNG (long side ≤ MASK_STORE_SIDE) and stores it. */
function store(p: Plane, model: string) {
  const bytes = new Uint8Array(p.width * p.height * 4);
  for (let i = 0; i < p.data.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, p.data[i]!)) * 255);
    bytes[i * 4] = v;
    bytes[i * 4 + 1] = v;
    bytes[i * 4 + 2] = v;
    bytes[i * 4 + 3] = 255;
  }
  let image = Skia.Image.MakeImage({ width: p.width, height: p.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, Skia.Data.fromBytes(bytes), p.width * 4);
  if (!image) throw new Error('mask image');
  let { width, height } = p;
  const s = MASK_STORE_SIDE / Math.max(width, height);
  if (s < 1) {
    width = Math.round(width * s);
    height = Math.round(height * s);
    const surface = Skia.Surface.Make(width, height)!;
    surface.getCanvas().drawImageRectCubic(image, Skia.XYWHRect(0, 0, p.width, p.height), Skia.XYWHRect(0, 0, width, height), 1 / 3, 1 / 3);
    surface.flush();
    image = surface.makeImageSnapshot();
  }
  const png = image.encodeToBytes(ImageFormat.PNG, 100);
  if (!png) throw new Error('mask encode');
  return { uri: writeMaskPng(png, 'seg'), width, height, model };
}

async function segmentPlane(uri: string, kind: SegmentKind): Promise<Plane> {
  const img = await loadImageElement(uri);
  if (kind === 'skin' || kind === 'person') {
    const seg = await getMulticlass();
    const r = await quiet(() => seg.segment(img));
    const masks = r.confidenceMasks ?? [];
    // 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 others.
    if (kind === 'person') {
      const bg = floatPlane(masks[0]!);
      for (let i = 0; i < bg.data.length; i++) bg.data[i] = 1 - bg.data[i]!;
      r.close();
      return bg;
    }
    const body = floatPlane(masks[2]!);
    const face = floatPlane(masks[3]!);
    for (let i = 0; i < body.data.length; i++) body.data[i] = Math.min(1, body.data[i]! + face.data[i]!);
    r.close();
    return body;
  }
  // Subject: people (soft matte) ∪ any PASCAL VOC object.
  const [person, objects] = await Promise.all([
    segmentPlane(uri, 'person'),
    (async () => {
      const seg = await getDeeplab();
      const r = await quiet(() => seg.segment(img));
      const p = categoryPlane(r.categoryMask!, (c) => c !== 0);
      r.close();
      return p;
    })(),
  ]);
  return union([person, objects]);
}

export const backend: SegmentationBackend = {
  id: 'mediapipe',
  supports: { subject: true, person: true, skin: true, tap: true },
  async segment(source, kind) {
    const plane = await segmentPlane(source.uri, kind);
    const model = kind === 'subject' ? 'mediapipe-multiclass+deeplab' : 'mediapipe-multiclass';
    return store(plane, model);
  },
  async segmentAt(source, point) {
    const [seg, img] = await Promise.all([getTapper(), loadImageElement(source.uri)]);
    const r = await quiet(() => seg.segment(img, { keypoint: { x: point.x, y: point.y } }));
    // magic_touch labels the selected object 0.
    const p = categoryPlane(r.categoryMask!, (c) => c === 0);
    r.close();
    const on = p.data.reduce((a, b) => a + b, 0) / p.data.length;
    if (on < 0.0005 || on > 0.9) return null;
    return store(p, 'mediapipe-magic-touch');
  },
};
