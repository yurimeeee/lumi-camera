import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, typography } from '@/constants/theme';
import { useLookThumbnail } from '@/hooks/useFilterThumbnail';
import type { ShaderLook as Look } from '@/services/imageProcessing';
import type { FilterDefinition } from '@/types/filters';

interface BaseProps {
  image: SkImage | null;
  selected: boolean;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  width?: number;
  height?: number;
  tone?: 'light' | 'dark';
}

interface Props extends BaseProps {
  filter: FilterDefinition;
}

/** A real, shader-rendered preview of `filter` applied to `image`. */
export const FilterThumbnail = memo(function FilterThumbnail({ filter, ...rest }: Props) {
  return <LookThumbnail id={filter.id} name={filter.name} kindLabel="필터" look={null} {...rest} />;
});

interface LookProps extends BaseProps {
  /** Carousel id (filter id, or recipe:<id>). Also the thumbnail cache key. */
  id: string;
  name: string;
  /** Spoken after the name ("필터", "레시피"). */
  kindLabel: string;
  /** Look to render; null = the filter `id` at 100. */
  look: Look | null;
  /** Small marker for My Recipes. */
  badge?: 'recipe';
}

/** Shader-rendered thumbnail of any look (filter or My Recipe). */
export const LookThumbnail = memo(function LookThumbnail({
  id,
  name,
  kindLabel,
  look,
  badge,
  image,
  selected,
  onPress,
  onLongPress,
  width = 60,
  height = 76,
  tone = 'light',
}: LookProps) {
  const uri = useLookThumbnail(image, id, look, width, height);
  const dark = tone === 'dark';

  return (
    <PressableScale
      onPress={() => onPress(id)}
      onLongPress={onLongPress ? () => onLongPress(id) : undefined}
      delayLongPress={350}
      activeScale={0.95}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${kindLabel}`}
      accessibilityHint={onLongPress ? '길게 누르면 이름 변경·삭제' : undefined}
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
          {badge === 'recipe' ? <View style={styles.badge} /> : null}
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
        {name}
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
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.white,
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
