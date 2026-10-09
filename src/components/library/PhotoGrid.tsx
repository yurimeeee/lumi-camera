import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { useAppDimensions } from '@/hooks/useAppDimensions';
import type { LibraryPhoto } from '@/services/mediaLibrary';

const COLUMNS = 3;
const GAP = 2;

interface Props {
  photos: LibraryPhoto[];
  onPress: (photo: LibraryPhoto) => void;
  onEndReached?: () => void;
  loadingId: string | null;
  header?: React.ReactElement | null;
  /** Selection mode (일괄 보정): ids picked, in order. */
  selected?: readonly string[] | null;
}

const Cell = memo(function Cell({
  photo,
  size,
  onPress,
  loading,
  order,
}: {
  photo: LibraryPhoto;
  size: number;
  onPress: (p: LibraryPhoto) => void;
  loading: boolean;
  /** Selection mode: 1-based position when selected, 0 when not; undefined outside selection. */
  order?: number;
}) {
  const selecting = order !== undefined;
  return (
    <Pressable
      onPress={() => onPress(photo)}
      style={({ pressed }) => [{ width: size, height: size }, pressed && styles.pressed]}
      accessibilityRole={selecting ? 'checkbox' : 'imagebutton'}
      accessibilityState={selecting ? { checked: order > 0 } : undefined}
      aria-checked={selecting ? order > 0 : undefined}
      accessibilityLabel={selecting ? '사진 선택' : '사진 편집하기'}
    >
      <Image
        source={{ uri: photo.previewUri }}
        style={styles.image}
        contentFit="cover"
        recyclingKey={photo.id}
        cachePolicy="memory-disk"
        transition={120}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
      {selecting ? (
        <View style={[styles.check, order > 0 && styles.checkOn]}>
          {order > 0 ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
        </View>
      ) : null}
      {selecting && order > 0 ? <View pointerEvents="none" style={styles.dim} /> : null}
    </Pressable>
  );
});

export function PhotoGrid({ photos, onPress, onEndReached, loadingId, header, selected }: Props) {
  const { width } = useAppDimensions();
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const renderItem: ListRenderItem<LibraryPhoto> = useCallback(
    ({ item }) => (
      <Cell
        photo={item}
        size={size}
        onPress={onPress}
        loading={item.id === loadingId}
        order={selected ? selected.indexOf(item.id) + 1 : undefined}
      />
    ),
    [size, onPress, loadingId, selected],
  );

  return (
    <FlatList
      data={photos}
      keyExtractor={(p) => p.id}
      renderItem={renderItem}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      extraData={[loadingId, selected]}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      initialNumToRender={24}
      maxToRenderPerBatch={24}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  image: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.8,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
