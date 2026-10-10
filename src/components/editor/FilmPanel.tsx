import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DatePickerSheet } from '@/components/common/DatePickerSheet';
import { ColorSwatches, OptionChips } from '@/components/common/OptionChips';
import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { FramePicker } from '@/components/editor/FramePicker';
import {
  BURN_STYLES,
  DATE_STAMP_COLORS,
  DATE_STAMP_POSITIONS,
  DEFAULT_FILM,
  FRAME_COLORS,
  frameDefaults,
  LEAK_STYLES,
  newFilmSeed,
} from '@/constants/film';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useEditorStore } from '@/stores/editorStore';
import type { AdjustmentKey } from '@/types/editing';
import type { FilmEffects } from '@/types/film';
import { DATE_FORMATS, formatDateStamp, stampDateOf } from '@/utils/dateStamp';

import { BackgroundEditPanel } from './BackgroundEditPanel';
import { EFFECTS_VIEWS, type EffectsView } from './editorNav';
import { SubTabs } from './SubTabs';

interface RowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  reset?: number;
  onChange: (v: number) => void;
}

/** One labelled slider; commits one undo step when released. */
export function Row({ label, value, min = 0, max = 100, reset = 0, onChange }: RowProps) {
  const commit = useEditorStore.getState().commit;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.flex}>
        <SliderControl value={value} min={min} max={max} onChange={onChange} onComplete={commit} resetValue={reset} accessibilityLabel={label} />
      </View>
    </View>
  );
}

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      {children}
    </ScrollView>
  );
}

/** Small heading inside a long effect list. */
function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

/**
 * 효과: 필름 (halation, film burn, texture: dust, scratches, fringing,
 * flash, drift, vignette, fade), 그레인, 빛샘 and Bloom (with soft focus).
 * Every value is a parameter of the edit — nothing is baked — and random
 * patterns come from the edit's seed.
 */
export function EffectsPanel({ view, onViewChange }: { view: EffectsView; onViewChange: (view: EffectsView) => void }) {
  const film = useEditorStore((s) => s.present.film);
  const adjustments = useEditorStore((s) => s.present.adjustments);
  const { setFilm, setAdjustment } = useEditorStore.getState();
  const patch = (fn: (f: FilmEffects) => FilmEffects) => setFilm(fn);
  const adj = (key: AdjustmentKey) => (v: number) => setAdjustment(key, v);

  let body: ReactNode = null;
  switch (view) {
    case 'background':
      body = <BackgroundEditPanel />;
      break;
    case 'film':
      body = (
        <Scroll>
          <Section title="할레이션" />
          <Row label="강도" value={film.halation.intensity} onChange={(v) => patch((f) => ({ ...f, halation: { ...f.halation, intensity: v } }))} />
          <Row label="반경" value={film.halation.radius} reset={DEFAULT_FILM.halation.radius} onChange={(v) => patch((f) => ({ ...f, halation: { ...f.halation, radius: v } }))} />
          <Row label="붉은 정도" value={film.halation.warmth} reset={DEFAULT_FILM.halation.warmth} onChange={(v) => patch((f) => ({ ...f, halation: { ...f.halation, warmth: v } }))} />
          <Section title="필름 번" />
          <OptionChips
            options={BURN_STYLES.map((s) => ({ value: s.id, label: s.label, swatch: s.swatch }))}
            // While the burn is off no style is selected, so tapping any style turns it on.
            value={film.burn.intensity > 0 ? film.burn.style : null}
            onChange={(style) => {
              patch((f) => ({ ...f, burn: { ...f.burn, style, intensity: f.burn.intensity || 50 } }));
              useEditorStore.getState().commit();
            }}
            accessibilityLabel="필름 번 스타일"
          />
          <Row label="강도" value={film.burn.intensity} onChange={(v) => patch((f) => ({ ...f, burn: { ...f.burn, intensity: v } }))} />
          <Row label="퍼짐" value={film.burn.spread} reset={DEFAULT_FILM.burn.spread} onChange={(v) => patch((f) => ({ ...f, burn: { ...f.burn, spread: v } }))} />
          <Row label="위치" value={film.burn.position} reset={DEFAULT_FILM.burn.position} onChange={(v) => patch((f) => ({ ...f, burn: { ...f.burn, position: v } }))} />
          <Section title="질감" />
          <Row label="먼지" value={film.dust} onChange={(v) => patch((f) => ({ ...f, dust: v }))} />
          <Row label="스크래치" value={film.scratch} onChange={(v) => patch((f) => ({ ...f, scratch: v }))} />
          <Row label="색수차" value={film.fringing} onChange={(v) => patch((f) => ({ ...f, fringing: v }))} />
          <Row label="플래시" value={film.flash} onChange={(v) => patch((f) => ({ ...f, flash: v }))} />
          <Row label="색 편차" value={film.drift} onChange={(v) => patch((f) => ({ ...f, drift: v }))} />
          <Row label="비네팅" value={adjustments.vignette} min={-100} onChange={adj('vignette')} />
          <Row label="페이드" value={adjustments.fade} onChange={adj('fade')} />
          <SeedButton />
        </Scroll>
      );
      break;
    case 'grain':
      body = (
        <Scroll>
          <Row label="양" value={adjustments.grain} onChange={adj('grain')} />
          <Row label="크기" value={film.grain.size} reset={DEFAULT_FILM.grain.size} onChange={(v) => patch((f) => ({ ...f, grain: { ...f.grain, size: v } }))} />
          <Row label="거칠기" value={film.grain.roughness} reset={DEFAULT_FILM.grain.roughness} onChange={(v) => patch((f) => ({ ...f, grain: { ...f.grain, roughness: v } }))} />
          <Row label="색 노이즈" value={film.grain.color} onChange={(v) => patch((f) => ({ ...f, grain: { ...f.grain, color: v } }))} />
          <SeedButton />
        </Scroll>
      );
      break;
    case 'leak':
      body = (
        <Scroll>
          <OptionChips
            options={LEAK_STYLES.map((s) => ({ value: s.id, label: s.label, swatch: s.swatch }))}
            // While the leak is off no style is selected, so tapping any style turns it on.
            value={film.leak.intensity > 0 ? film.leak.style : null}
            onChange={(style) => {
              patch((f) => ({ ...f, leak: { ...f.leak, style, intensity: f.leak.intensity || 50 } }));
              useEditorStore.getState().commit();
            }}
            accessibilityLabel="빛샘 스타일"
          />
          <Row label="강도" value={film.leak.intensity} onChange={(v) => patch((f) => ({ ...f, leak: { ...f.leak, intensity: v } }))} />
          <Row label="위치" value={film.leak.position} reset={DEFAULT_FILM.leak.position} onChange={(v) => patch((f) => ({ ...f, leak: { ...f.leak, position: v } }))} />
          <Row label="회전" value={film.leak.rotation} min={-90} max={90} onChange={(v) => patch((f) => ({ ...f, leak: { ...f.leak, rotation: v } }))} />
          <Row label="크기" value={film.leak.scale} reset={DEFAULT_FILM.leak.scale} onChange={(v) => patch((f) => ({ ...f, leak: { ...f.leak, scale: v } }))} />
        </Scroll>
      );
      break;
    case 'bloom':
      body = (
        <Scroll>
          <Row label="강도" value={film.bloom.intensity} onChange={(v) => patch((f) => ({ ...f, bloom: { ...f.bloom, intensity: v } }))} />
          <Row label="기준 밝기" value={film.bloom.threshold} reset={DEFAULT_FILM.bloom.threshold} onChange={(v) => patch((f) => ({ ...f, bloom: { ...f.bloom, threshold: v } }))} />
          <Row label="반경" value={film.bloom.radius} reset={DEFAULT_FILM.bloom.radius} onChange={(v) => patch((f) => ({ ...f, bloom: { ...f.bloom, radius: v } }))} />
          <Row label="소프트 포커스" value={film.softFocus} onChange={(v) => patch((f) => ({ ...f, softFocus: v }))} />
        </Scroll>
      );
      break;
  }

  return (
    <View>
      <SubTabs options={EFFECTS_VIEWS} value={view} onChange={onViewChange} accessibilityLabel="효과 메뉴" />
      {body}
    </View>
  );
}

/** New random pattern for grain, dust, scratches and burn edges. */
function SeedButton() {
  return (
    <PressableScale
      style={styles.seed}
      onPress={() => {
        feedback.light();
        useEditorStore.getState().setFilm((f) => ({ ...f, seed: newFilmSeed() }));
        useEditorStore.getState().commit();
      }}
      accessibilityRole="button"
      accessibilityLabel="입자·먼지 패턴 바꾸기"
    >
      <Ionicons name="shuffle-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.seedText}>패턴 바꾸기</Text>
    </PressableScale>
  );
}

export function FrameSection() {
  const frame = useEditorStore((s) => s.present.frame);
  const { setFrame, commit } = useEditorStore.getState();
  const has = frame.id !== 'none';
  const defaults = frameDefaults(frame.id);
  const swatches = [defaults.color, ...FRAME_COLORS.filter((c) => c.toLowerCase() !== defaults.color.toLowerCase())];
  return (
    <Scroll>
      <FramePicker
        value={frame.id}
        onChange={(id) => {
          setFrame(() => frameDefaults(id));
          commit();
        }}
      />
      {has ? (
        <>
          <Row label="두께" value={frame.thickness} min={20} max={200} reset={100} onChange={(v) => setFrame((f) => ({ ...f, thickness: v }))} />
          <Row label="모서리" value={frame.cornerRadius} reset={defaults.cornerRadius} onChange={(v) => setFrame((f) => ({ ...f, cornerRadius: v }))} />
          <Row label="종이 질감" value={frame.texture} reset={defaults.texture} onChange={(v) => setFrame((f) => ({ ...f, texture: v }))} />
          <Row label="빈티지" value={frame.aging} reset={defaults.aging} onChange={(v) => setFrame((f) => ({ ...f, aging: v }))} />
          <Row label="모서리 마모" value={frame.edgeWear} reset={defaults.edgeWear} onChange={(v) => setFrame((f) => ({ ...f, edgeWear: v }))} />
          <ColorSwatches
            colors={swatches}
            value={frame.color}
            onChange={(color) => {
              setFrame((f) => ({ ...f, color }));
              commit();
            }}
            accessibilityLabel="프레임 색"
          />
        </>
      ) : (
        <Text style={styles.hint}>프레임은 사진을 자르지 않고 둘레에 더해져요. 저장한 사진에도 들어가요.</Text>
      )}
    </Scroll>
  );
}

export function DateSection() {
  const on = useEditorStore((s) => s.present.dateStamp);
  const style = useEditorStore((s) => s.present.stamp);
  const date = useEditorStore((s) => stampDateOf(s.source, s.present));
  const known = useEditorStore((s) => s.source?.dateKnown !== false);
  const picked = useEditorStore((s) => s.present.stampDate !== null);
  const { setDateStamp, setStamp, setStampDate, commit } = useEditorStore.getState();
  const [picking, setPicking] = useState(false);

  return (
    <Scroll>
      <View style={styles.switchRow}>
        <Ionicons name="calendar-outline" size={18} color={colors.text} />
        <View style={styles.flex}>
          <Text style={styles.switchLabel}>날짜 스탬프</Text>
          <Text style={styles.dateText}>
            {date !== null ? `${formatDateStamp(date, 'dotted-full')}${known && !picked ? ' · 촬영 날짜' : ' · 직접 선택'}` : '촬영 날짜를 알 수 없어요'}
          </Text>
        </View>
        <PressableScale style={styles.dateButton} onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel="스탬프 날짜 선택">
          <Text style={styles.dateButtonText}>{date === null ? '날짜 선택' : '변경'}</Text>
        </PressableScale>
        <Switch
          value={on}
          onValueChange={(v) => {
            setDateStamp(v);
            if (v && date === null) setPicking(true);
          }}
          trackColor={{ true: '#8FAE7F', false: colors.border }}
          thumbColor={colors.white}
          {...WEB_SWITCH}
          ios_backgroundColor={colors.border}
          accessibilityLabel="날짜 스탬프"
        />
      </View>
      <OptionChips
        options={DATE_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
        value={style.format}
        onChange={(format) => {
          setStamp((s) => ({ ...s, format }));
          commit();
        }}
        accessibilityLabel="날짜 형식"
      />
      <OptionChips
        options={DATE_STAMP_POSITIONS.map((p) => ({ value: p.id, label: p.label }))}
        value={style.position}
        onChange={(position) => {
          setStamp((s) => ({ ...s, position }));
          commit();
        }}
        accessibilityLabel="날짜 위치"
      />
      <ColorSwatches
        colors={DATE_STAMP_COLORS.map((c) => c.color)}
        value={style.color}
        onChange={(color) => {
          setStamp((s) => ({ ...s, color }));
          commit();
        }}
        accessibilityLabel="날짜 색"
      />
      <View style={styles.row}>
        <Text style={styles.rowLabel}>크기</Text>
        <View style={styles.flex}>
          <SliderControl
            value={style.size}
            min={50}
            max={200}
            onChange={(size) => setStamp((s) => ({ ...s, size }))}
            onComplete={commit}
            resetValue={100}
            accessibilityLabel="날짜 크기"
          />
        </View>
      </View>
      <DatePickerSheet
        visible={picking}
        title="스탬프 날짜"
        // Unknown capture date: start from the import day, but only use what the user confirms.
        initial={date ?? useEditorStore.getState().source?.takenAt ?? 0}
        onConfirm={(ms) => {
          setStampDate(ms);
          if (!useEditorStore.getState().present.dateStamp) setDateStamp(true);
        }}
        onClose={() => setPicking(false)}
      />
    </Scroll>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  section: {
    ...typography.micro,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  scroll: {
    maxHeight: 196,
  },
  scrollContent: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.text,
    width: 76,
  },
  seed: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.lg,
  },
  seedText: {
    ...typography.filterName,
    fontSize: 11,
  },
  hint: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  switchLabel: {
    ...typography.callout,
  },
  dateText: {
    ...typography.caption,
    fontSize: 11,
  },
  dateButton: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  dateButtonText: {
    ...typography.filterName,
    color: colors.accent,
  },
});
