import { Picture, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';

import type { AssetBank } from '@/image-engine/frame/bank';
import { loadKit } from '@/image-engine/frame/FrameAssetLoader';
import { drawKitFrame } from '@/image-engine/frame/FrameRenderer';
import { seedOf } from '@/image-engine/frame/skiaKit';
import type { FrameSettings } from '@/types/film';

import { framePaper, type FrameLayout } from './frameLayout';

interface Props {
  frame: FrameSettings;
  layout: FrameLayout;
  /** Kit textures + caption font; null while loading (flat paper, no captions). */
  bank: AssetBank | null;
}

/** Kit textures + caption font, loaded the first time a frame is shown (`active`). */
export function useFrameBank(active: boolean): AssetBank | null {
  const [bank, setBank] = useState<AssetBank | null>(null);
  useEffect(() => {
    if (!active || bank) return;
    let alive = true;
    loadKit()
      .then((k) => alive && setBank({ ...k, images: new Map() }))
      .catch((e) => __DEV__ && console.warn('[frame] kit', e));
    return () => {
      alive = false;
    };
  }, [active, bank]);
  return bank;
}

/** Same, for one-off renders (export). */
export async function loadFrameBank(): Promise<AssetBank> {
  return { ...(await loadKit()), images: new Map() };
}

const EMPTY_BANK: AssetBank = { textures: new Map(), decorations: new Map(), images: new Map(), typeface: null };

/**
 * The kit frame around the photo — paper (colour × texture × ageing × wear)
 * and the frame's own perforations, ruling and captions — drawn by the same
 * renderer as Frame Studio, at the layout's coordinates (0, 0 = outer
 * top-left). Its window is the photo, so it can sit over or under it.
 */
export const FrameLayer = memo(function FrameLayer({ frame, layout, bank }: Props) {
  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, layout.width, layout.height));
    drawKitFrame(canvas, layout.preset, framePaper(frame), seedOf(frame.id), layout.geometry, bank ?? EMPTY_BANK);
    return recorder.finishRecordingAsPicture();
  }, [frame, layout, bank]);
  return <Picture picture={picture} />;
});
