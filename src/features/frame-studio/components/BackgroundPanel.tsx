import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { ColorSwatches } from '@/components/common/OptionChips';
import { colors } from '@/constants/theme';
import { texturePresets } from '@/image-engine/frame/registry';

import { DEFAULT_BG_ADJUST } from '../model/document';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS, BACKGROUND_PATTERNS } from '../presets/palette';
import { useStudioStore } from '../stores/studioStore';
import type { BackgroundAdjust, BackgroundFill } from '../types/document';
import { ActionPill, Hint, PanelScroll, StudioSlider, Tile, TileRow } from './controls';

type Tab = 'color' | 'gradient' | 'paper' | 'texture' | 'pattern' | 'album' | 'adjust';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'paper', label: 'Paper' },
  { id: 'texture', label: 'Texture' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'album', label: 'Album' },
  { id: 'adjust', label: '조정' },
];

function setFill(fill: BackgroundFill) {
  useStudioStore.getState().apply((d) => ({ ...d, background: { ...d.background, fill } }));
}

function setAdjust(patch: Partial<BackgroundAdjust>) {
  useStudioStore.getState().live((d) => ({ ...d, background: { ...d.background, adjust: { ...d.background.adjust, ...patch } } }));
}

/** Background studio: colour, gradient, the kit's papers and textures, patterns, an album photo, plus adjustments. */
export function BackgroundPanel({ onPickImage }: { onPickImage: () => void }) {
  const [tab, setTab] = useState<Tab>('color');
  const bg = useStudioStore((s) => s.doc?.background);
  if (!bg) return null;
  const { fill, adjust } = bg;
  const textures = texturePresets();
  return (
    <View style={{ gap: 10 }}>
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'color' ? (
        <ColorSwatches colors={BACKGROUND_COLORS} value={fill.kind === 'color' ? fill.color : ''} onChange={(color) => setFill({ kind: 'color', color })} accessibilityLabel="배경색" />
      ) : null}
      {tab === 'gradient' ? (
        <TileRow>
          {BACKGROUND_GRADIENTS.map((g, i) => (
            <Tile
              key={i}
              label={`G${i + 1}`}
              width={52}
              height={52}
              selected={fill.kind === 'gradient' && fill.from === g.from && fill.to === g.to}
              onPress={() => setFill({ kind: 'gradient', ...g })}
              accessibilityLabel={`그라데이션 ${i + 1}`}
            >
              <View style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden' }}>
                <View style={{ flex: 1, backgroundColor: g.from }} />
                <View style={{ flex: 1, backgroundColor: g.to }} />
              </View>
            </Tile>
          ))}
        </TileRow>
      ) : null}
      {tab === 'paper' || tab === 'texture' ? (
        <TileRow>
          {textures
            .filter((t) => t.group === tab)
            .map((t) => (
              <Tile
                key={t.id}
                label={t.name}
                source={t.source}
                width={56}
                height={56}
                contentFit="cover"
                selected={fill.kind === 'texture' && fill.textureId === t.id}
                onPress={() => setFill({ kind: 'texture', textureId: t.id })}
                accessibilityLabel={`배경 ${t.name}`}
              />
            ))}
        </TileRow>
      ) : null}
      {tab === 'pattern' ? (
        <TileRow>
          {BACKGROUND_PATTERNS.map((p) => (
            <Tile
              key={p.pattern}
              label={p.name}
              width={52}
              height={52}
              selected={fill.kind === 'pattern' && fill.pattern === p.pattern}
              onPress={() => setFill({ kind: 'pattern', pattern: p.pattern, color: p.color, ink: p.ink })}
              accessibilityLabel={`패턴 ${p.name}`}
            >
              <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: p.color, borderWidth: 6, borderColor: p.ink, borderStyle: p.pattern === 'dots' ? 'dotted' : 'solid' }} />
            </Tile>
          ))}
        </TileRow>
      ) : null}
      {tab === 'album' ? (
        <View style={{ gap: 8 }}>
          <TileRow>
            <ActionPill label={fill.kind === 'image' ? '다른 사진 고르기' : '앨범에서 배경 고르기'} icon={<Ionicons name="images-outline" size={15} color={colors.text} />} onPress={onPickImage} />
          </TileRow>
          <Hint>사진은 원본 비율 그대로 캔버스를 채워요(Fill). 조정 탭에서 확대·위치·흐림을 바꿀 수 있어요.</Hint>
        </View>
      ) : null}
      {tab === 'adjust' ? (
        <PanelScroll>
          <StudioSlider label="크기" value={adjust.scale} min={100} max={300} reset={DEFAULT_BG_ADJUST.scale} onChange={(scale) => setAdjust({ scale })} />
          <StudioSlider label="가로 위치" value={adjust.x} min={-100} max={100} onChange={(x) => setAdjust({ x })} />
          <StudioSlider label="세로 위치" value={adjust.y} min={-100} max={100} onChange={(y) => setAdjust({ y })} />
          <StudioSlider label="흐림" value={adjust.blur} onChange={(blur) => setAdjust({ blur })} />
          <StudioSlider label="불투명도" value={adjust.opacity} reset={100} onChange={(opacity) => setAdjust({ opacity })} />
          <StudioSlider label="밝기" value={adjust.brightness} min={-100} max={100} onChange={(brightness) => setAdjust({ brightness })} />
          <StudioSlider label="채도" value={adjust.saturation} min={-100} max={100} onChange={(saturation) => setAdjust({ saturation })} />
        </PanelScroll>
      ) : null}
    </View>
  );
}
