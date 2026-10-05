import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import type { LibraryPhoto } from '@/services/mediaLibrary';

const COLUMNS = 3;
const GAP = 2;

interface Props {
  photos: LibraryPhoto[];
  onPress: (photo: LibraryPhoto) => void;
  onEndReached?: () => void;
  loadingId: string | null;
  header?: React.ReactElement | null;
}

const Cell = memo(function Cell({
  photo,
  size,
  onPress,
  loading,
}: {
  photo: LibraryPhoto;
  size: number;
  onPress: (p: LibraryPhoto) => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(photo)}
      style={({ pressed }) => [{ width: size, height: size }, pressed && styles.pressed]}
      accessibilityRole="imagebutton"
      accessibilityLabel="사진 편집하기"
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
    </Pressable>
  );
});

export function PhotoGrid({ photos, onPress, onEndReached, loadingId, header }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);

  const renderItem: ListRenderItem<LibraryPhoto> = useCallback(
    ({ item }) => <Cell photo={item} size={size} onPress={onPress} loading={item.id === loadingId} />,
    [size, onPress, loadingId],
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
      extraData={loadingId}
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
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
