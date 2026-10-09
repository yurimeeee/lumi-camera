import { Ionicons } from '@expo/vector-icons';
import type { SkCanvas, SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useState } from 'react';
import { View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { colors } from '@/constants/theme';
import type { AssetBank } from '@/image-engine/frame/bank';
import { containBox } from '@/image-engine/frame/frameGeometry';
import { drawPrint } from '@/image-engine/frame/FrameRenderer';
import { FRAME_CATEGORIES, framePresets, getFramePreset, type FrameCategory } from '@/image-engine/frame/registry';

import { useThumbnail } from '../hooks/useStudioAssets';
import { applyFrame, NO_FRAME_STYLE, newPhotoLayer, presetFrameStyle } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import { ActionPill, Hint, Tile, TileRow, useTargetPrints } from './controls';

const TILE_W = 64;
const TILE_H = 80;

/**
 * A real render of a frame preset (same renderer as the canvas and export)
 * with the project's first photo — what you tap is what you get.
 */
const FrameThumb = memo(function FrameThumb({
  presetId,
  label,
  selected,
  photo,
  photoKey,
  kit,
  onPress,
}: {
  presetId: string;
  label: string;
  selected: boolean;
  photo: SkImage | null;
  photoKey: string;
  kit: AssetBank | null;
  onPress: (id: string) => void;
}) {
  const draw = useCallback(
    (canvas: SkCanvas, scale: number) => {
      if (!kit || !photo) return;
      const preset = getFramePreset(presetId);
      const aspect = preset ? preset.canvasRatio : photo.width() / photo.height();
      const inner = containBox(aspect, { x: 4, y: 4, width: TILE_W - 8, height: TILE_H - 8 });
      const ref = { uri: `thumb:${photoKey}`, width: photo.width(), height: photo.height() };
      const style = presetId === 'none' ? NO_FRAME_STYLE : { ...presetFrameStyle(presetId), shadow: 0 };
      const layer = newPhotoLayer({ x: 0, y: 0, width: inner.width, height: inner.height }, ref, style);
      canvas.scale(scale, scale);
      canvas.translate(inner.x, inner.y);
      drawPrint(canvas, layer, { ...kit, images: new Map([[ref.uri, photo]]) }, { pixel: 1 / scale });
    },
    [kit, photo, photoKey, presetId],
  );
  const uri = useThumbnail(kit && photo ? `frame:${presetId}:${photoKey}` : null, TILE_W, TILE_H, draw);
  return <Tile label={label} selected={selected} uri={uri} onPress={() => onPress(presetId)} width={TILE_W} height={TILE_H} accessibilityLabel={`프레임 ${label}`} />;
});

interface Props {
  kit: AssetBank | null;
  photo: SkImage | null;
  photoKey: string;
  onImportFrame: () => void;
  onEditCustom: () => void;
}

/** Frames: category tabs and a strip of rendered frame thumbnails. */
export function FramesPanel({ kit, photo, photoKey, onImportFrame, onEditCustom }: Props) {
  const [category, setCategory] = useState<FrameCategory>('instant');
  const { prints, ids, all } = useTargetPrints();
  const current = prints[0]?.frame.presetId ?? 'none';
  const idsKey = ids.join(',');
  const apply = useCallback(
    (id: string) => useStudioStore.getState().apply((d) => applyFrame(d, presetFrameStyle(id), idsKey ? idsKey.split(',') : [])),
    [idsKey],
  );
  const presets = framePresets().filter((p) => p.category === category);
  return (
    <View style={{ gap: 10 }}>
      <ChipTabs tabs={FRAME_CATEGORIES} value={category} onChange={setCategory} />
      {category === 'custom' ? (
        <View style={{ gap: 8 }}>
          <TileRow>
            <ActionPill label="앨범에서 프레임 가져오기" icon={<Ionicons name="images-outline" size={15} color={colors.text} />} onPress={onImportFrame} />
            {prints[0]?.frame.presetId === 'custom' ? (
              <ActionPill label="사진 영역 · 위치 편집" icon={<Ionicons name="crop-outline" size={15} color={colors.text} />} onPress={onEditCustom} />
            ) : null}
          </TileRow>
          <Hint>투명 PNG는 투명한 부분에 사진이 들어가요. JPG는 사진이 들어갈 영역을 직접 지정해요.</Hint>
        </View>
      ) : (
        <TileRow>
          <FrameThumb presetId="none" label="None" selected={current === 'none'} photo={photo} photoKey={photoKey} kit={kit} onPress={apply} />
          {presets.map((p) => (
            <FrameThumb key={p.id} presetId={p.id} label={p.name} selected={current === p.id} photo={photo} photoKey={photoKey} kit={kit} onPress={apply} />
          ))}
        </TileRow>
      )}
      <Hint>{all ? '모든 사진에 적용돼요. 사진을 탭해 하나만 바꿀 수 있어요.' : '선택한 사진에 적용돼요.'}</Hint>
    </View>
  );
}
