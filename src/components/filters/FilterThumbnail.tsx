import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, typography } from '@/constants/theme';
import { useFilterThumbnail } from '@/hooks/useFilterThumbnail';
import type { FilterDefinition } from '@/types/filters';

interface Props {
  filter: FilterDefinition;
  image: SkImage | null;
  selected: boolean;
  onPress: (id: string) => void;
  width?: number;
  height?: number;
  tone?: 'light' | 'dark';
}

/** A real, shader-rendered preview of `filter` applied to `image`. */
export const FilterThumbnail = memo(function FilterThumbnail({
  filter,
  image,
  selected,
  onPress,
  width = 60,
  height = 76,
  tone = 'light',
}: Props) {
  const uri = useFilterThumbnail(image, filter.id, width, height);
  const dark = tone === 'dark';

  return (
    <PressableScale
      onPress={() => onPress(filter.id)}
      activeScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={`${filter.name} 필터`}
      accessibilityState={{ selected }}
      style={styles.root}
    >
      <View
        style={[
          styles.frame,
          { width: width + 6, height: height + 6 },
          selected && (dark ? styles.frameSelectedDark : styles.frameSelected),
        ]}
      >
        <View style={[styles.clip, { width, height }]}>
          {uri ? (
            <Image source={{ uri }} style={{ width, height }} transition={120} />
          ) : (
            <View style={[styles.placeholder, dark && styles.placeholderDark]} />
          )}
        </View>
      </View>
      <Text
        style={[
          styles.name,
          dark && styles.nameDark,
          selected && (dark ? styles.nameSelectedDark : styles.nameSelected),
        ]}
        numberOfLines={1}
      >
        {filter.name}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  frame: {
    borderRadius: radius.md + 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameSelected: {
    borderColor: colors.text,
  },
  frameSelectedDark: {
    borderColor: colors.white,
  },
  clip: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  placeholderDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  name: {
    ...typography.filterName,
    marginTop: 4,
  },
  nameDark: {
    color: colors.whiteMuted,
  },
  nameSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  nameSelectedDark: {
    color: colors.white,
    fontWeight: '600',
  },
});
