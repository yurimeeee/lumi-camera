import { Ionicons } from '@expo/vector-icons';
import type { SkImage } from '@shopify/react-native-skia';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { readSmallPixels } from '@/render/readPixels';
import { samplePixels, suggestAuto } from '@/services/autoEnhance';
import { feedback } from '@/services/feedback';
import { useEditorStore } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';

/**
 * 조정 › 기본 › 자동: analyses the photo (as cropped) and adds the suggested
 * values to the ordinary sliders. Strength scales Auto's share only; hold
 * 비교 to see the photo without it.
 */
export function AutoEnhanceRow({ image }: { image: SkImage | null }) {
  const auto = useEditorStore((s) => s.present.autoEnhance);
  const { runAutoEnhance, setAutoStrength, clearAutoEnhance, commit, revertLive } = useEditorStore.getState();
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState(false);

  const run = () => {
    if (!image || busy) return;
    setBusy(true);
    // Let the spinner paint before the (short) analysis.
    setTimeout(() => {
      try {
        const px = readSmallPixels(image, 256);
        if (!px) throw new Error('no pixels');
        const { values, stats } = suggestAuto(samplePixels(px));
        runAutoEnhance(values, stats);
        feedback.success();
        if (Object.keys(values).length === 0) showToast('이미 균형이 잘 맞는 사진이에요');
      } catch (e) {
        if (__DEV__) console.warn('[auto]', e);
        feedback.error();
        showToast('사진을 분석하지 못했어요. 다시 시도해 주세요');
      } finally {
        setBusy(false);
      }
    }, 16);
  };

  if (!auto) {
    return (
      <View style={styles.row}>
        <PressableScale style={styles.autoButton} onPress={run} disabled={!image || busy} accessibilityRole="button" accessibilityLabel="자동 보정">
          {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="sparkles-outline" size={15} color={colors.text} />}
          <Text style={styles.autoText}>자동</Text>
        </PressableScale>
        <Text style={styles.hint} numberOfLines={1}>
          밝기·색감을 분석해 자연스럽게 맞춰요
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <PressableScale
        style={[styles.autoButton, styles.autoOn]}
        onPress={run}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="자동 보정 다시 분석"
      >
        {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="sparkles" size={15} color={colors.accent} />}
        <Text style={styles.autoText}>자동</Text>
      </PressableScale>
      <View style={styles.flex}>
        <SliderControl
          value={auto.strength}
          onChange={setAutoStrength}
          onComplete={commit}
          resetValue={100}
          accessibilityLabel="자동 보정 강도"
        />
      </View>
      <PressableScale
        style={[styles.compare, comparing && styles.compareOn]}
        onPressIn={() => {
          setComparing(true);
          setAutoStrength(0);
        }}
        onPressOut={() => {
          setComparing(false);
          revertLive();
        }}
        accessibilityRole="button"
        accessibilityLabel="누르는 동안 자동 보정 전 보기"
      >
        <Text style={[styles.compareText, comparing && styles.compareTextOn]}>전후</Text>
      </PressableScale>
      <IconButton icon="close-circle-outline" size={18} color={colors.textSecondary} accessibilityLabel="자동 보정 해제" onPress={clearAutoEnhance} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    gap: spacing.sm,
    minHeight: 44,
    marginBottom: spacing.xxs,
  },
  flex: {
    flex: 1,
  },
  autoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  autoOn: {
    backgroundColor: colors.accentMuted,
  },
  autoText: {
    ...typography.filterName,
    color: colors.text,
    fontSize: 12,
  },
  hint: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    flex: 1,
  },
  compare: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  compareOn: {
    backgroundColor: colors.text,
  },
  compareText: {
    ...typography.micro,
    color: colors.text,
  },
  compareTextOn: {
    color: colors.white,
  },
});
