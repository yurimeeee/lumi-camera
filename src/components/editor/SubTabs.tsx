import { StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/common/SegmentedControl';
import { spacing } from '@/constants/theme';

/** Second-level tabs of an editor menu (e.g. 기본 / HSL / 커브), above the menu's tools. */
export function SubTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.root}>
      <SegmentedControl options={options} value={value} onChange={onChange} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
});
