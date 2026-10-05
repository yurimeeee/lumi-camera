import { Ionicons } from '@expo/vector-icons';
import type { SkImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, typography } from '@/constants/theme';
import { useFilterThumbnail } from '@/hooks/useFilterThumbnail';
import { feedback } from '@/services/feedback';
import { useFilterStore, useIsFavorite } from '@/stores/filterStore';
import type { FilterDefinition } from '@/types/filters';

interface Props {
  filter: FilterDefinition;
  image: SkImage | null;
  width: number;
  onPress: (id: string) => void;
  /** Show a remove badge instead of the heart (Favorites edit mode). */
  removable?: boolean;
}

export const FilterCard = memo(function FilterCard({ filter, image, width, onPress, removable }: Props) {
  const height = Math.round(width * 1.12);
  const favorite = useIsFavorite(filter.id);
  const uri = useFilterThumbnail(image, filter.id, width, height);
  const toggle = () => {
    feedback.light();
    useFilterStore.getState().toggleFavorite(filter.id);
  };

  return (
    <View style={{ width }}>
      <PressableScale
        activeScale={0.97}
        onPress={() => onPress(filter.id)}
        accessibilityRole="button"
        accessibilityLabel={`${filter.name} 필터 자세히 보기`}
        style={[styles.photo, { width, height }]}
      >
        {uri ? <Image source={{ uri }} style={{ width, height }} transition={150} /> : null}
        {removable ? (
          <Animated.View entering={ZoomIn.duration(180)} style={styles.remove}>
            <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${filter.name} 즐겨찾기 해제`}>
              <Ionicons name="remove" size={14} color={colors.white} />
            </Pressable>
          </Animated.View>
        ) : null}
      </PressableScale>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {filter.name}
        </Text>
        {filter.id !== 'original' && !removable ? (
          <Pressable
            onPress={toggle}
            hitSlop={12}
            style={styles.heart}
            accessibilityRole="button"
            accessibilityState={{ selected: favorite }}
            accessibilityLabel={favorite ? `${filter.name} 즐겨찾기 해제` : `${filter.name} 즐겨찾기`}
          >
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={14} color={favorite ? colors.accent : colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  photo: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 24,
  },
  name: {
    ...typography.filterName,
    color: colors.text,
    flex: 1,
  },
  heart: {
    paddingLeft: 6,
  },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(36,33,30,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
