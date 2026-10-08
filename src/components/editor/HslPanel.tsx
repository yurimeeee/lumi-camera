import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { HSL_COLORS, HSL_LABEL, HSL_SWATCH, isNeutralAdjust, isNeutralHsl } from '@/services/color/hsl';
import { useEditorStore } from '@/stores/editorStore';
import type { HslAdjust, HslColor } from '@/types/editing';

const ROWS: readonly { key: keyof HslAdjust; label: string }[] = [
  { key: 'hue', label: '색상' },
  { key: 'saturation', label: '채도' },
  { key: 'luminance', label: '밝기' },
];

/** HSL: pick a colour band, then shift its hue / saturation / luminance. */
export function HslPanel() {
  const hsl = useEditorStore((s) => s.present.hsl);
  const { setHsl, commit, resetHslColor, resetHsl } = useEditorStore.getState();
  const [color, setColor] = useState<HslColor>('orange');
  const values = hsl[color];
  const anyChanged = !isNeutralHsl(hsl);

  return (
    <View>
      <View style={styles.swatchRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
          {HSL_COLORS.map((c) => {
            const selected = c === color;
            const changed = !isNeutralAdjust(hsl[c]);
            return (
              <PressableScale
                key={c}
                onPress={() => {
                  feedback.selection();
                  setColor(c);
                }}
                style={[styles.swatchRing, selected && styles.swatchRingSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${HSL_LABEL[c]}${changed ? ', 보정됨' : ''}`}
              >
                <View style={[styles.swatch, { backgroundColor: HSL_SWATCH[c] }]} />
                {changed ? <View style={styles.changedDot} /> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
        <PressableScale
          onPress={() => resetHsl()}
          disabled={!anyChanged}
          style={[styles.resetAll, !anyChanged && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel="HSL 전체 초기화"
        >
          <Text style={styles.resetAllText}>전체</Text>
        </PressableScale>
      </View>

      {ROWS.map((row) => (
        <View key={row.key} style={styles.sliderRow}>
          <Text style={styles.label}>{row.label}</Text>
          <View style={styles.flex}>
            <SliderControl
              value={values[row.key]}
              min={-100}
              max={100}
              onChange={(v) => setHsl(color, row.key, v)}
              onComplete={commit}
              resetValue={0}
              accessibilityLabel={`${HSL_LABEL[color]} ${row.label}`}
            />
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.colorName}>{HSL_LABEL[color]}</Text>
        <PressableScale
          onPress={() => resetHslColor(color)}
          disabled={isNeutralAdjust(values)}
          style={[styles.resetColor, isNeutralAdjust(values) && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`${HSL_LABEL[color]} 초기화`}
        >
          <Ionicons name="refresh" size={14} color={colors.textSecondary} />
          <Text style={styles.resetColorText}>초기화</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const SWATCH = 26;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  swatches: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  swatchRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRingSelected: {
    borderColor: colors.text,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
  },
  changedDot: {
    position: 'absolute',
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  resetAll: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  resetAllText: {
    ...typography.caption,
    color: colors.text,
  },
  dim: {
    opacity: 0.35,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    gap: spacing.sm,
    marginTop: -2,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    width: 36,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  colorName: {
    ...typography.filterName,
    color: colors.text,
  },
  resetColor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  resetColorText: {
    ...typography.caption,
  },
});
