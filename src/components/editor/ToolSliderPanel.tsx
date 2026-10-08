import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import type { ControlSpec } from '@/constants/adjustments';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

interface Props<K extends string> {
  tools: readonly ControlSpec<K>[];
  values: Record<K, number>;
  onChange: (key: K, value: number) => void;
  onCommit: () => void;
  onReset: (key: K) => void;
  /** Optional row rendered under the tools (e.g. a toggle). */
  footer?: ReactNode;
  /** Hint under the tools; may depend on the selected tool. */
  note?: string | ((key: K) => string | undefined);
  /** Greys out the slider and tool values (e.g. face tools without a face). */
  disabled?: boolean;
  /** Greys out single tools (e.g. tools that need a face, in a mixed list). */
  isDisabled?: (key: K) => boolean;
  /** Selected tool, when the parent wants to know it (uncontrolled otherwise). */
  active?: K;
  onActiveChange?: (key: K) => void;
}

/** Icon strip of tools + one slider for the selected tool, with per-tool reset. */
export function ToolSliderPanel<K extends string>({
  tools,
  values,
  onChange,
  onCommit,
  onReset,
  footer,
  note,
  disabled: allDisabled = false,
  isDisabled,
  active: activeProp,
  onActiveChange,
}: Props<K>) {
  const [activeState, setActiveState] = useState<K>(tools[0]!.key);
  const active = activeProp ?? activeState;
  const setActive = (key: K) => {
    setActiveState(key);
    onActiveChange?.(key);
  };
  const spec = tools.find((t) => t.key === active) ?? tools[0]!;
  const value = values[spec.key];
  const hint = typeof note === 'function' ? note(spec.key) : note;
  const disabled = allDisabled || (isDisabled?.(spec.key) ?? false);

  return (
    <View>
      <View style={styles.sliderRow}>
        <Text style={styles.toolName}>{spec.label}</Text>
        <View style={[styles.slider, disabled && styles.disabled]}>
          <SliderControl
            value={value}
            min={spec.min}
            max={spec.max}
            onChange={(v) => onChange(spec.key, v)}
            onComplete={onCommit}
            resetValue={0}
            accessibilityLabel={spec.label}
          />
        </View>
        <PressableScale
          onPress={() => onReset(spec.key)}
          disabled={disabled || value === 0}
          style={[styles.reset, (disabled || value === 0) && styles.resetDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`${spec.label} 초기화`}
        >
          <Ionicons name="refresh" size={16} color={colors.textSecondary} />
        </PressableScale>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tools}>
        {tools.map((t) => {
          const selected = t.key === spec.key;
          const changed = values[t.key] !== 0;
          const off = allDisabled || (isDisabled?.(t.key) ?? false);
          return (
            <PressableScale
              key={t.key}
              style={styles.tool}
              onPress={() => {
                feedback.selection();
                setActive(t.key);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${t.label} ${values[t.key]}`}
              accessibilityState={{ selected }}
            >
              <View style={[styles.toolIcon, selected && styles.toolIconSelected, off && styles.disabled]}>
                <Ionicons name={t.icon} size={20} color={selected ? colors.text : colors.textSecondary} />
              </View>
              <Text style={[styles.toolLabel, selected && styles.toolLabelSelected]} numberOfLines={1}>
                {t.label}
              </Text>
              <Text style={[styles.toolValue, changed && styles.toolValueChanged]}>
                {changed ? (values[t.key] > 0 && t.min < 0 ? `+${values[t.key]}` : values[t.key]) : ' '}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      {/* A per-tool hint keeps a fixed two-line box, so switching tools never resizes the photo. */}
      {typeof note === 'function' ? (
        <Text style={[styles.note, styles.noteFixed]} numberOfLines={2}>
          {hint ?? ''}
        </Text>
      ) : hint ? (
        <Text style={styles.note}>{hint}</Text>
      ) : null}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  toolName: {
    ...typography.caption,
    color: colors.text,
    width: 64,
  },
  slider: {
    flex: 1,
  },
  disabled: {
    opacity: 0.35,
    pointerEvents: 'none',
  },
  reset: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetDisabled: {
    opacity: 0.3,
  },
  tools: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  tool: {
    width: 64,
    alignItems: 'center',
  },
  toolIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconSelected: {
    backgroundColor: colors.accentMuted,
  },
  toolLabel: {
    ...typography.micro,
    marginTop: 2,
  },
  toolLabelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  toolValue: {
    ...typography.micro,
    fontSize: 9,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  toolValueChanged: {
    color: colors.accent,
  },
  note: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  noteFixed: {
    lineHeight: 15,
    height: 30,
  },
});
