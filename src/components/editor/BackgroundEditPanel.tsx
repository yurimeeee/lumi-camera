import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { importImage } from '@/features/frame-studio/services/studioImages';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS } from '@/features/frame-studio/presets/palette';
import type { BackgroundFill } from '@/features/frame-studio/types/document';
import { useAiJob } from '@/hooks/useAiJob';
import { texturePresets } from '@/image-engine/frame/registry';
import { ensureModelConsent } from '@/services/aiConsent';
import { feedback } from '@/services/feedback';
import { pickImageFromSystem } from '@/services/mediaLibrary';
import { aiTargetSupport, segment } from '@/services/segmentation/Segmenter';
import { useEditorStore } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';
import type { BackgroundMode } from '@/types/phase4';

import { AiJobRow } from './AiJobRow';
import { ParamSlider } from './SelectivePanel';

const MODES: readonly { value: BackgroundMode; label: string }[] = [
  { value: 'none', label: '그대로' },
  { value: 'blur', label: '흐림' },
  { value: 'replace', label: '교체' },
];

const UNSUPPORTED =
  Platform.OS === 'ios'
    ? '피사체 분리는 Development Build에서 쓸 수 있어요 (Expo Go 미지원)'
    : '이 기기에서는 피사체 분리를 아직 지원하지 않아요';

/**
 * 효과 › 배경: separates the subject (on-device AI) and edits what is behind
 * it — blur, a replacement (colour, gradient, paper, album photo, with the
 * same adjustments as Frame Studio's canvas background), brightness and
 * saturation. Separate from Frame Studio's canvas background, which sits
 * behind the whole print.
 */
export function BackgroundEditPanel() {
  const source = useEditorStore((s) => s.source);
  const bg = useEditorStore((s) => s.present.background);
  const { setBackground, editBackground, commit } = useEditorStore.getState();
  const job = useAiJob();
  const supported = aiTargetSupport().subject;

  const find = () => {
    if (!source) return;
    if (!ensureModelConsent('segmentation', '피사체 분리', '19MB')) return;
    void job.start(
      () => segment(source, 'subject'),
      (subject) => {
        feedback.success();
        editBackground((b) => ({ ...b, subject, mode: b.mode === 'none' ? 'blur' : b.mode }));
      },
      '피사체를 찾지 못했어요',
    );
  };

  if (!bg.subject) {
    return (
      <View>
        <View style={styles.card}>
          <Ionicons name="person-circle-outline" size={22} color={colors.text} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>배경 편집</Text>
            <Text style={styles.cardText}>{supported ? '인물·피사체를 기기 안에서 분리해 배경만 흐리게 하거나 바꿔요.' : UNSUPPORTED}</Text>
          </View>
        </View>
        {job.status === 'idle' ? (
          <PressableScale style={[styles.primary, !supported && styles.disabled]} onPress={find} disabled={!supported} accessibilityRole="button" accessibilityLabel="피사체 찾기">
            <Ionicons name="sparkles-outline" size={15} color={colors.white} />
            <Text style={styles.primaryText}>피사체 찾기</Text>
          </PressableScale>
        ) : null}
        <AiJobRow status={job.status} error={job.error} runningText="피사체를 찾는 중이에요…" onCancel={job.cancel} onRetry={find} />
      </View>
    );
  }

  const fill = bg.replace.fill;
  const setFill = (f: BackgroundFill) => editBackground((b) => ({ ...b, replace: { ...b.replace, fill: f } }));
  const pickAlbum = async () => {
    try {
      const picked = await pickImageFromSystem();
      if (!picked) return;
      const { ref } = await importImage(picked, 'photo');
      setFill({ kind: 'image', image: ref });
    } catch {
      showToast('사진을 불러오지 못했어요');
    }
  };

  const common = [
    { key: 'edge', label: '경계', reset: 30 },
    { key: 'brightness', label: '배경 밝기', min: -100, max: 100, reset: 0 },
    { key: 'saturation', label: '배경 채도', min: -100, max: 100, reset: 0 },
  ] as const;

  return (
    <View>
      <View style={styles.modeRow}>
        <View style={styles.flex}>
          <SegmentedControl options={MODES} value={bg.mode} onChange={(mode) => editBackground((b) => ({ ...b, mode }))} accessibilityLabel="배경 편집 방식" />
        </View>
        <PressableScale style={styles.again} onPress={find} accessibilityRole="button" accessibilityLabel="피사체 다시 찾기">
          <Ionicons name="refresh" size={15} color={colors.textSecondary} />
        </PressableScale>
      </View>
      <AiJobRow status={job.status} error={job.error} runningText="피사체를 다시 찾는 중이에요…" onCancel={job.cancel} onRetry={find} />

      {bg.mode === 'blur' ? (
        <ParamSlider
          key="blur"
          params={[{ key: 'strength', label: '강도', reset: 100 }, { key: 'radius', label: '크기', reset: 45 }, ...common]}
          values={{ strength: bg.blur.strength, radius: bg.blur.radius, edge: bg.edge, brightness: bg.brightness, saturation: bg.saturation }}
          onChange={(key, v) =>
            setBackground((b) => (key === 'strength' || key === 'radius' ? { ...b, blur: { ...b.blur, [key]: v } } : { ...b, [key]: v }))
          }
          onComplete={commit}
        />
      ) : null}

      {bg.mode === 'replace' ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fills}>
            {BACKGROUND_COLORS.map((c) => (
              <PressableScale
                key={c}
                style={[styles.fill, fill.kind === 'color' && fill.color === c && styles.fillOn]}
                onPress={() => setFill({ kind: 'color', color: c })}
                accessibilityRole="button"
                accessibilityLabel={`배경색 ${c}`}
              >
                <View style={[styles.fillInner, { backgroundColor: c }]} />
              </PressableScale>
            ))}
            {BACKGROUND_GRADIENTS.map((g, i) => (
              <PressableScale
                key={`g${i}`}
                style={[styles.fill, fill.kind === 'gradient' && fill.from === g.from && fill.to === g.to && styles.fillOn]}
                onPress={() => setFill({ kind: 'gradient', ...g })}
                accessibilityRole="button"
                accessibilityLabel={`그라데이션 ${i + 1}`}
              >
                <View style={[styles.fillInner, styles.split]}>
                  <View style={[styles.flex, { backgroundColor: g.from }]} />
                  <View style={[styles.flex, { backgroundColor: g.to }]} />
                </View>
              </PressableScale>
            ))}
            {texturePresets()
              .filter((t) => t.group === 'paper')
              .map((t) => (
                <PressableScale
                  key={t.id}
                  style={[styles.chip, fill.kind === 'texture' && fill.textureId === t.id && styles.chipOn]}
                  onPress={() => setFill({ kind: 'texture', textureId: t.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`종이 ${t.name}`}
                >
                  <Text style={[styles.chipText, fill.kind === 'texture' && fill.textureId === t.id && styles.chipTextOn]}>{t.name}</Text>
                </PressableScale>
              ))}
            <PressableScale style={[styles.chip, fill.kind === 'image' && styles.chipOn]} onPress={pickAlbum} accessibilityRole="button" accessibilityLabel="앨범 사진을 배경으로">
              <Ionicons name="images-outline" size={14} color={fill.kind === 'image' ? colors.white : colors.text} />
              <Text style={[styles.chipText, fill.kind === 'image' && styles.chipTextOn]}>앨범</Text>
            </PressableScale>
          </ScrollView>
          <ParamSlider
            key="replace"
            params={[
              { key: 'scale', label: '확대', min: 100, max: 300, reset: 100 },
              { key: 'x', label: '가로', min: -100, max: 100, reset: 0 },
              { key: 'y', label: '세로', min: -100, max: 100, reset: 0 },
              { key: 'blur', label: '흐림', reset: 0 },
              { key: 'brightnessFill', label: '밝기', min: -100, max: 100, reset: 0 },
              { key: 'saturationFill', label: '채도', min: -100, max: 100, reset: 0 },
              { key: 'edge', label: '경계', reset: 30 },
            ]}
            values={{
              scale: bg.replace.adjust.scale,
              x: bg.replace.adjust.x,
              y: bg.replace.adjust.y,
              blur: bg.replace.adjust.blur,
              brightnessFill: bg.replace.adjust.brightness,
              saturationFill: bg.replace.adjust.saturation,
              edge: bg.edge,
            }}
            onChange={(key, v) =>
              setBackground((b) => {
                if (key === 'edge') return { ...b, edge: v };
                const k = key === 'brightnessFill' ? 'brightness' : key === 'saturationFill' ? 'saturation' : key;
                return { ...b, replace: { ...b.replace, adjust: { ...b.replace.adjust, [k]: v } } };
              })
            }
            onComplete={commit}
          />
        </View>
      ) : null}

      {bg.mode === 'none' ? (
        <ParamSlider key="none" params={common} values={{ edge: bg.edge, brightness: bg.brightness, saturation: bg.saturation }} onChange={(key, v) => setBackground((b) => ({ ...b, [key]: v }))} onComplete={commit} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...typography.callout,
  },
  cardText: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
  },
  primary: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
    minHeight: 40,
    minWidth: 160,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    ...typography.headline,
    fontSize: 14,
    color: colors.white,
  },
  disabled: {
    opacity: 0.35,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    gap: spacing.xs,
  },
  again: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fills: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  fill: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    padding: 2,
  },
  fillOn: {
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  split: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fillInner: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipOn: {
    backgroundColor: colors.text,
  },
  chipText: {
    ...typography.filterName,
    color: colors.text,
  },
  chipTextOn: {
    color: colors.white,
  },
});
