import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';

interface Props {
  visible: boolean;
  title: string;
  /** Starting date (ms); the sheet never assumes "today" is the photo's date. */
  initial: number;
  onConfirm: (ms: number) => void;
  onClose: () => void;
}

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Year / month / day steppers (works the same on iOS, Android and web). */
export function DatePickerSheet({ visible, title, initial, onConfirm, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {visible ? <Body key={initial} initial={initial} onConfirm={onConfirm} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function Body({ initial, onConfirm, onClose }: Omit<Props, 'visible' | 'title'>) {
  const d0 = new Date(initial);
  const [y, setY] = useState(d0.getFullYear());
  const [m, setM] = useState(d0.getMonth());
  const [d, setD] = useState(d0.getDate());
  const day = Math.min(d, daysIn(y, m));
  const maxYear = new Date().getFullYear();

  const step = (field: 'y' | 'm' | 'd', delta: number) => {
    feedback.selection();
    if (field === 'y') setY((v) => Math.min(maxYear, Math.max(1950, v + delta)));
    else if (field === 'm') setM((v) => (v + delta + 12) % 12);
    else setD(((day - 1 + delta + daysIn(y, m)) % daysIn(y, m)) + 1);
  };

  const columns: { field: 'y' | 'm' | 'd'; label: string; value: string }[] = [
    { field: 'y', label: '년', value: String(y) },
    { field: 'm', label: '월', value: String(m + 1).padStart(2, '0') },
    { field: 'd', label: '일', value: String(day).padStart(2, '0') },
  ];

  return (
    <View>
      <View style={styles.columns}>
        {columns.map((c) => (
          <View key={c.field} style={styles.column}>
            <PressableScale style={styles.arrow} onPress={() => step(c.field, 1)} accessibilityRole="button" accessibilityLabel={`${c.label} 올리기`}>
              <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
            </PressableScale>
            <Text style={styles.value} accessibilityLabel={`${c.value}${c.label}`}>
              {c.value}
            </Text>
            <Text style={styles.unit}>{c.label}</Text>
            <PressableScale style={styles.arrow} onPress={() => step(c.field, -1)} accessibilityRole="button" accessibilityLabel={`${c.label} 내리기`}>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </PressableScale>
          </View>
        ))}
      </View>
      <PressableScale
        style={styles.confirm}
        onPress={() => {
          feedback.success();
          onConfirm(new Date(y, m, day, 12).getTime());
          onClose();
        }}
        accessibilityRole="button"
        accessibilityLabel="날짜 확인"
      >
        <Text style={styles.confirmText}>확인</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingVertical: spacing.md,
  },
  column: {
    alignItems: 'center',
  },
  arrow: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.title,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    ...typography.caption,
  },
  confirm: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    ...typography.headline,
    fontSize: 15,
    color: colors.white,
  },
});
