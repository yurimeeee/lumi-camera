import type { SkCanvas, SkImage } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { frameDefaults } from '@/constants/film';
import { Tile, TileRow } from '@/features/frame-studio/components/controls';
import { useThumbnail, useThumbPhoto } from '@/features/frame-studio/hooks/useStudioAssets';
import type { AssetBank } from '@/image-engine/frame/bank';
import { containBox } from '@/image-engine/frame/frameGeometry';
import { drawKitFrame } from '@/image-engine/frame/FrameRenderer';
import { FRAME_CATEGORIES, framePresets, type FrameCategory } from '@/image-engine/frame/registry';
import { seedOf } from '@/image-engine/frame/skiaKit';
import { framePaper, frameLayout } from '@/render/frameLayout';
import { useFrameBank } from '@/render/FrameLayer';
import { useEditorStore } from '@/stores/editorStore';
import type { FrameId } from '@/types/film';

const TILE_W = 64;
const TILE_H = 80;
const CATEGORIES = FRAME_CATEGORIES.filter((c) => c.id !== 'custom');

/** The photo inside a kit frame, as the editor and export draw it (frame built around the photo). */
function drawFramedThumb(canvas: SkCanvas, scale: number, id: FrameId, photo: SkImage, bank: AssetBank) {
  const pw = photo.width();
  const ph = photo.height();
  const frame = frameDefaults(id);
  const layout = frameLayout(frame, pw, ph, false);
  const outerW = layout?.width ?? pw;
  const outerH = layout?.height ?? ph;
  const box = containBox(outerW / outerH, { x: 4, y: 4, width: TILE_W - 8, height: TILE_H - 8 });
  const k = box.width / outerW;
  canvas.scale(scale, scale);
  canvas.translate(box.x, box.y);
  canvas.scale(k, k);
  const p = layout?.photo ?? { x: 0, y: 0, width: pw, height: ph };
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRectCubic(photo, Skia.XYWHRect(0, 0, pw, ph), Skia.XYWHRect(p.x, p.y, p.width, p.height), 1 / 3, 1 / 3, paint);
  if (layout) drawKitFrame(canvas, layout.preset, framePaper(frame), seedOf(frame.id), layout.geometry, bank);
}

const FrameThumb = memo(function FrameThumb({
  id,
  label,
  selected,
  photo,
  photoKey,
  bank,
  onPress,
}: {
  id: FrameId;
  label: string;
  selected: boolean;
  photo: SkImage | null;
  photoKey: string;
  bank: AssetBank | null;
  onPress: (id: FrameId) => void;
}) {
  const draw = useCallback(
    (canvas: SkCanvas, scale: number) => {
      if (photo && bank) drawFramedThumb(canvas, scale, id, photo, bank);
    },
    [id, photo, bank],
  );
  const uri = useThumbnail(photo && bank ? `editor-frame:${id}:${photoKey}` : null, TILE_W, TILE_H, draw);
  return <Tile label={label} selected={selected} uri={uri} onPress={() => onPress(id)} width={TILE_W} height={TILE_H} accessibilityLabel={`프레임 ${label}`} />;
});

/** The frame kit's frames by category, as rendered thumbnails of the photo being edited. */
export function FramePicker({ value, onChange }: { value: FrameId; onChange: (id: FrameId) => void }) {
  const current = framePresets().find((p) => p.id === value);
  const [category, setCategory] = useState<FrameCategory>(current?.category ?? 'instant');
  const source = useEditorStore((s) => s.source);
  const { image: photo, key: photoKey } = useThumbPhoto(source ? { uri: source.uri, width: source.width, height: source.height } : null);
  const bank = useFrameBank(true);
  return (
    <View style={{ gap: 10 }}>
      <ChipTabs tabs={CATEGORIES} value={category} onChange={setCategory} />
      <TileRow>
        <FrameThumb id="none" label="None" selected={value === 'none'} photo={photo} photoKey={photoKey} bank={bank} onPress={onChange} />
        {framePresets()
          .filter((p) => p.category === category)
          .map((p) => (
            <FrameThumb key={p.id} id={p.id} label={p.name} selected={value === p.id} photo={photo} photoKey={photoKey} bank={bank} onPress={onChange} />
          ))}
      </TileRow>
    </View>
  );
}
