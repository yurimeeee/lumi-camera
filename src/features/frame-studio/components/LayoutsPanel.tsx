import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { colors } from '@/constants/theme';

import { applyLayout } from '../model/document';
import { FRAME_LAYOUT_ID, FREE_LAYOUT_ID, studioLayouts, type StudioLayout } from '../presets/layouts';
import { useStudioStore } from '../stores/studioStore';
import { ActionPill, Hint, Tile, TileRow } from './controls';

const BOX = 56;

/** Slot diagram of a layout (the kit's normalised slots, drawn at its default aspect). */
function LayoutDiagram({ layout }: { layout: StudioLayout }) {
  const ratio = layout.ratio ?? 4 / 5;
  const w = ratio >= 1 ? BOX : BOX * ratio;
  const h = ratio >= 1 ? BOX / ratio : BOX;
  const slots = layout.id === FREE_LAYOUT_ID ? [{ x: 0.12, y: 0.14, width: 0.5, height: 0.42 }, { x: 0.4, y: 0.45, width: 0.48, height: 0.4 }] : layout.slots;
  return (
    <View style={{ width: w, height: h, backgroundColor: colors.surface, borderRadius: 3, borderWidth: 1, borderColor: colors.border }}>
      {slots.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: s.x * w,
            top: s.y * h,
            width: s.width * w,
            height: s.height * h,
            backgroundColor: layout.id === FRAME_LAYOUT_ID ? '#D9CFC2' : '#CFC4B6',
            transform: [{ rotate: `${layout.rotations?.[i] ?? (layout.id === FREE_LAYOUT_ID ? (i ? 6 : -5) : 0)}deg` }],
          }}
        />
      ))}
    </View>
  );
}

/** Layouts from the kit's layout JSON (+ one-print frame and free placement). */
export function LayoutsPanel({ onAddPhotos, onTemplates }: { onAddPhotos: () => void; onTemplates: () => void }) {
  const layoutId = useStudioStore((s) => s.doc?.layoutId);
  const photoCount = useStudioStore((s) => s.doc?.pool.length ?? 0);
  return (
    <View style={{ gap: 10 }}>
      <TileRow>
        {studioLayouts().map((l) => (
          <Tile
            key={l.id}
            label={l.name}
            selected={l.id === layoutId}
            width={64}
            height={68}
            accessibilityLabel={`레이아웃 ${l.name}`}
            onPress={() => useStudioStore.getState().apply((d) => applyLayout(d, l.id))}
          >
            <LayoutDiagram layout={l} />
          </Tile>
        ))}
      </TileRow>
      <TileRow>
        <ActionPill label="사진 추가" icon={<Ionicons name="add" size={16} color={colors.text} />} onPress={onAddPhotos} />
        <ActionPill label="템플릿" icon={<Ionicons name="bookmarks-outline" size={15} color={colors.text} />} onPress={onTemplates} />
      </TileRow>
      <Hint>{`사진 ${photoCount}장 · 레이아웃을 바꿔도 사진은 순서대로 유지돼요.`}</Hint>
    </View>
  );
}
