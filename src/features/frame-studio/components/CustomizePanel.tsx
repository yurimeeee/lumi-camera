import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { ColorSwatches, OptionChips } from '@/components/common/OptionChips';
import { colors, typography } from '@/constants/theme';
import { texturePresets } from '@/image-engine/frame/registry';

import { photoLayers, presetFrameStyle, setCanvasRatio, setMargin, updateFrame } from '../model/document';
import { CANVAS_RATIOS, FRAME_LAYOUT_ID } from '../presets/layouts';
import { FRAME_PALETTE } from '../presets/palette';
import { useStudioStore } from '../stores/studioStore';
import type { FrameStyle } from '../types/document';
import { ActionPill, Hint, PanelScroll, StudioSlider, Tile, TileRow, useTargetPrints } from './controls';

/** Live frame edit on the target prints (slider; committed on release). */
function liveFrame(ids: string[], patch: Partial<FrameStyle>) {
  useStudioStore.getState().live((d) => updateFrame(d, ids, patch));
}
function applyFrameEdit(ids: string[], patch: Partial<FrameStyle>) {
  useStudioStore.getState().apply((d) => updateFrame(d, ids, patch));
}

/** Paper texture of the target prints: kit textures, imported ones, none — plus strength. */
export function TextureSection({ onImportTexture }: { onImportTexture: () => void }) {
  const { prints, ids } = useTargetPrints();
  const imports = useStudioStore((s) => s.doc?.imports ?? {});
  const frame = prints[0]?.frame;
  if (!frame) return null;
  if (frame.presetId === 'none' || frame.presetId === 'custom') return <Hint>종이 질감은 Lumi 프레임에 적용돼요. 먼저 프레임을 골라 주세요.</Hint>;
  const pick = (texture: string | null) => applyFrameEdit(ids, { texture, textureIntensity: texture ? (frame.textureIntensity || 50) : 0 });
  return (
    <View style={{ gap: 8 }}>
      <TileRow>
        <Tile label="None" width={52} height={52} selected={!frame.texture} onPress={() => pick(null)} accessibilityLabel="질감 없음">
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Tile>
        {texturePresets().map((t) => (
          <Tile key={t.id} label={t.name} source={t.source} width={52} height={52} contentFit="cover" selected={frame.texture === t.id} onPress={() => pick(t.id)} accessibilityLabel={`질감 ${t.name}`} />
        ))}
        {Object.entries(imports).map(([id, ref], i) => (
          <Tile key={id} label={`Album ${i + 1}`} uri={ref.uri} width={52} height={52} contentFit="cover" selected={frame.texture === id} onPress={() => pick(id)} />
        ))}
        <Tile label="앨범" width={52} height={52} onPress={onImportTexture} accessibilityLabel="앨범에서 질감 가져오기">
          <Ionicons name="add" size={20} color={colors.textSecondary} />
        </Tile>
      </TileRow>
      {frame.texture ? <StudioSlider label="질감 강도" value={frame.textureIntensity} onChange={(v) => liveFrame(ids, { textureIntensity: v })} /> : null}
    </View>
  );
}

type Tab = 'color' | 'thickness' | 'texture' | 'vintage' | 'shadow' | 'rotation' | 'canvas';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'color', label: 'Frame Color' },
  { id: 'thickness', label: 'Thickness' },
  { id: 'texture', label: 'Texture' },
  { id: 'vintage', label: 'Aging' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'canvas', label: 'Canvas' },
];

/** Customize: colour, borders, paper, ageing, shadow, rotation and canvas. */
export function CustomizePanel({ onOpenColor, onImportTexture }: { onOpenColor: () => void; onImportTexture: () => void }) {
  const [tab, setTab] = useState<Tab>('color');
  const { prints, ids, all } = useTargetPrints();
  const doc = useStudioStore((s) => s.doc);
  const selectedId = useStudioStore((s) => s.selection?.id);
  const frame = prints[0]?.frame;
  if (!doc || !frame) return <Hint>사진을 먼저 추가해 주세요.</Hint>;
  const kitFrame = frame.presetId !== 'none' && frame.presetId !== 'custom';
  const defaults = kitFrame ? presetFrameStyle(frame.presetId) : null;
  const needFrame = <Hint>이 설정은 프레임이 있는 사진에 적용돼요. Frames에서 프레임을 골라 주세요.</Hint>;

  let body = null;
  switch (tab) {
    case 'color':
      body = kitFrame ? (
        <View style={{ gap: 8 }}>
          <ColorSwatches colors={FRAME_PALETTE.map((c) => c.color)} value={frame.color} onChange={(color) => applyFrameEdit(ids, { color })} accessibilityLabel="프레임 색" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
            <Text style={{ ...typography.caption }}>{FRAME_PALETTE.find((c) => c.color.toLowerCase() === frame.color.toLowerCase())?.name ?? frame.color.toUpperCase()}</Text>
            <ActionPill label="직접 선택 · HEX" icon={<Ionicons name="color-palette-outline" size={15} color={colors.text} />} onPress={onOpenColor} />
            {defaults && defaults.color.toLowerCase() !== frame.color.toLowerCase() ? (
              <ActionPill label="원래 색" onPress={() => applyFrameEdit(ids, { color: defaults.color })} />
            ) : null}
          </View>
        </View>
      ) : (
        needFrame
      );
      break;
    case 'thickness':
      body = kitFrame ? (
        <PanelScroll>
          <StudioSlider label="테두리 두께" value={frame.thickness} max={200} reset={100} onChange={(v) => liveFrame(ids, { thickness: v })} />
          <StudioSlider label="위 여백" value={frame.top} max={250} reset={100} onChange={(v) => liveFrame(ids, { top: v })} />
          <StudioSlider label="좌우 여백" value={frame.side} max={250} reset={100} onChange={(v) => liveFrame(ids, { side: v })} />
          <StudioSlider label="아래 여백" value={frame.bottom} max={250} reset={100} onChange={(v) => liveFrame(ids, { bottom: v })} />
          <StudioSlider label="모서리" value={frame.cornerRadius} reset={defaults?.cornerRadius ?? 0} onChange={(v) => liveFrame(ids, { cornerRadius: v })} />
        </PanelScroll>
      ) : frame.presetId === 'none' ? (
        <StudioSlider label="모서리" value={frame.cornerRadius} onChange={(v) => liveFrame(ids, { cornerRadius: v })} />
      ) : (
        needFrame
      );
      break;
    case 'texture':
      body = <TextureSection onImportTexture={onImportTexture} />;
      break;
    case 'vintage':
      body = kitFrame ? (
        <PanelScroll>
          <StudioSlider label="변색 · 에이징" value={frame.aging} onChange={(v) => liveFrame(ids, { aging: v })} />
          <StudioSlider label="모서리 마모" value={frame.edgeWear} onChange={(v) => liveFrame(ids, { edgeWear: v })} />
          <StudioSlider label="사진 바램" value={frame.photoFade} onChange={(v) => liveFrame(ids, { photoFade: v })} />
          <Hint>모두 0이면 깨끗한 프레임이에요. 종이 효과는 프레임에만, 사진 바램은 사진에만 들어가요.</Hint>
        </PanelScroll>
      ) : (
        <StudioSlider label="사진 바램" value={frame.photoFade} onChange={(v) => liveFrame(ids, { photoFade: v })} />
      );
      break;
    case 'shadow':
      body = <StudioSlider label="그림자" value={frame.shadow} onChange={(v) => liveFrame(ids, { shadow: v })} />;
      break;
    case 'rotation': {
      // The selected layer (print, tape or text); with nothing selected, every print.
      const selected = doc.layers.find((l) => l.id === selectedId);
      const targets = selected ? [selected.id] : ids;
      body = (
        <StudioSlider
          label="회전"
          value={Math.round(selected?.rotation ?? prints[0]!.rotation)}
          min={-45}
          max={45}
          onChange={(v) => useStudioStore.getState().live((d) => ({ ...d, layers: d.layers.map((l) => (targets.includes(l.id) ? { ...l, rotation: v } : l)) }))}
        />
      );
      break;
    }
    case 'canvas': {
      const ratio = doc.width / doc.height;
      body = (
        <PanelScroll>
          <OptionChips
            options={CANVAS_RATIOS.map((r) => ({ value: r.label, label: r.label }))}
            value={doc.layoutId === FRAME_LAYOUT_ID ? null : (CANVAS_RATIOS.find((r) => Math.abs(r.value - ratio) < 0.01)?.label ?? null)}
            onChange={(label) => {
              const r = CANVAS_RATIOS.find((x) => x.label === label)!;
              useStudioStore.getState().apply((d) => setCanvasRatio(d, r.value));
            }}
            accessibilityLabel="캔버스 비율"
          />
          {doc.layoutId === FRAME_LAYOUT_ID ? (
            <StudioSlider label="캔버스 여백" value={doc.margin} max={30} onChange={(v) => useStudioStore.getState().live((d) => setMargin(d, v))} />
          ) : null}
          <Hint>{`${photoLayers(doc).length}장 · ${Math.round(doc.width)}×${Math.round(doc.height)}`}</Hint>
        </PanelScroll>
      );
      break;
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} />
      {body}
      {tab === 'rotation' ? (
        <Hint>{selectedId ? '선택한 레이어를 돌려요.' : '모든 사진을 같은 각도로 돌려요. 하나만 돌리려면 탭해서 고르세요.'}</Hint>
      ) : tab !== 'canvas' ? (
        <Hint>{all ? '모든 사진에 적용돼요.' : '선택한 사진에만 적용돼요.'}</Hint>
      ) : null}
    </View>
  );
}
