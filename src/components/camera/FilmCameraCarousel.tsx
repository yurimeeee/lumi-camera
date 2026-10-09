import type { SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { LookThumbnail } from '@/components/filters/FilterThumbnail';
import { DEFAULT_STAMP_STYLE } from '@/constants/film';
import { FILM_CAMERAS, type FilmCamera } from '@/constants/filmCameras';
import { spacing } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { filmCameraLook } from '@/services/film/looks';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  /** Tap on the selected camera (intensity). */
  onReselect: () => void;
  image: SkImage | null;
  thumbWidth?: number;
  thumbHeight?: number;
}

const thumbLook = (c: FilmCamera) =>
  filmCameraLook(c, { intensity: 100, grainScale: 100, frame: 'none', dateStamp: false, stamp: DEFAULT_STAMP_STYLE, seed: 7 });

/** Film cameras, each previewed on the latest photo with its own colour and effects. */
export const FilmCameraCarousel = memo(function FilmCameraCarousel({
  selectedId,
  onSelect,
  onReselect,
  image,
  thumbWidth = 52,
  thumbHeight = 64,
}: Props) {
  const looks = useMemo(() => new Map(FILM_CAMERAS.map((c) => [c.id, thumbLook(c)])), []);
  const press = useCallback(
    (key: string) => {
      const id = key.slice(5);
      feedback.selection();
      if (id === selectedId) onReselect();
      else onSelect(id);
    },
    [onReselect, onSelect, selectedId],
  );
  return (
    <FlatList
      horizontal
      data={FILM_CAMERAS}
      keyExtractor={(c) => c.id}
      extraData={selectedId}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => (
        <LookThumbnail
          id={`film:${item.id}`}
          name={item.name}
          kindLabel="필름 카메라"
          look={looks.get(item.id) ?? null}
          image={image}
          selected={item.id === selectedId}
          onPress={press}
          width={thumbWidth}
          height={thumbHeight}
        />
      )}
    />
  );
});

function Separator() {
  return <View style={{ width: spacing.sm }} />;
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
