import type { SkImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FilterThumbnail } from '@/components/filters/FilterThumbnail';
import { getFilter } from '@/constants/filters';
import { colors, spacing, typography } from '@/constants/theme';
import type { FaceStatus } from '@/hooks/useFaces';
import { readSmallPixels } from '@/render/readPixels';
import { measureImage } from '@/services/autoEnhance';
import { feedback } from '@/services/feedback';
import { MOOD_LABEL, recommendFilters } from '@/services/recommend';
import { useEditorStore } from '@/stores/editorStore';

/**
 * 필터 › 추천: filters picked for this photo from its measured brightness,
 * colour temperature, colour spread, contrast, saturation, highlights and
 * whether faces were found (rule-based, services/recommend.ts). Thumbnails
 * are the real filters rendered on the photo.
 */
export function RecommendPanel({ image, faceStatus, faceCount }: { image: SkImage | null; faceStatus: FaceStatus; faceCount: number }) {
  const filterId = useEditorStore((s) => s.present.filterId);
  const waitingForFaces = faceStatus === 'idle' || faceStatus === 'detecting';
  const result = useMemo(() => {
    if (!image || waitingForFaces) return null;
    const px = readSmallPixels(image, 160);
    return px ? recommendFilters(measureImage(px), faceCount > 0) : null;
  }, [image, waitingForFaces, faceCount]);

  if (!result) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.textSecondary} />
        <Text style={styles.reason}>사진을 살펴보는 중이에요…</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.reason} numberOfLines={1}>
        {MOOD_LABEL[result.profile.mood]}에 어울리는 필터예요
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        {result.items.map(({ filterId: id }) => (
          <FilterThumbnail
            key={id}
            filter={getFilter(id)}
            image={image}
            selected={id === filterId}
            onPress={(picked) => {
              feedback.selection();
              useEditorStore.getState().setFilter(picked);
            }}
            width={56}
            height={70}
          />
        ))}
      </ScrollView>
      <Text style={styles.note}>밝기 · 색온도 · 채도 · 대비 · 인물 유무를 보고 골랐어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  reason: { ...typography.caption, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingTop: spacing.xs },
  note: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs },
});
