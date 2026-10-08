import { Ionicons } from '@expo/vector-icons';
import { Canvas } from '@shopify/react-native-skia';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { CATEGORY_LABEL, getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAppDimensions } from '@/hooks/useAppDimensions';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { LumiLayer } from '@/render/LumiLayer';
import { feedback } from '@/services/feedback';
import { lookRender } from '@/services/imageProcessing';
import { useCameraStore } from '@/stores/cameraStore';
import { useFilterStore, useIsFavorite } from '@/stores/filterStore';
import type { LookTab } from '@/types/filters';

export default function FilterDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const [id, setId] = useState(params.id ?? 'original');
  const [tab, setTab] = useState<LookTab>('all');
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useAppDimensions();
  const filter = getFilter(id);
  const favorite = useIsFavorite(filter.id);
  const lastPhotoUri = useCameraStore((s) => s.lastPhotoUri);
  const big = usePreviewImage(lastPhotoUri, 1200);
  const thumbs = usePreviewImage(lastPhotoUri);

  const width = screenW;
  const height = Math.min(Math.round(width * 1.25), screenH - 300 - insets.bottom);
  const look = useMemo(() => lookRender({ filterId: filter.id, intensity: 100 }, width, height), [filter.id, width, height]);

  const applyToCamera = () => {
    useCameraStore.getState().setFilter(filter.id);
    feedback.light();
    router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { height }]}>
        {big ? (
          <Canvas style={{ width, height }}>
            <LumiLayer image={big} width={width} height={height} fit="cover" uniforms={look.uniforms} curves={look.curves} />
          </Canvas>
        ) : null}
        <View style={[styles.top, { paddingTop: insets.top + spacing.xs }]}>
          <IconButton icon="chevron-back" color={colors.white} accessibilityLabel="뒤로" onPress={() => router.back()} />
          <IconButton icon="close" color={colors.white} accessibilityLabel="닫기" onPress={() => router.dismissTo('/')} />
        </View>
        <Animated.View key={filter.id} entering={FadeIn.duration(220)} style={styles.caption}>
          <Text style={styles.category}>{CATEGORY_LABEL[filter.category]}</Text>
          <Text style={styles.name}>{filter.name}</Text>
          <Text style={styles.desc}>{filter.description}</Text>
        </Animated.View>
        {filter.id !== 'original' ? (
          <View style={styles.heart}>
            <IconButton
              icon={favorite ? 'heart' : 'heart-outline'}
              color={colors.white}
              accessibilityLabel={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
              onPress={() => {
                feedback.light();
                useFilterStore.getState().toggleFavorite(filter.id);
              }}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <FilterCarousel
          selectedId={filter.id}
          onSelect={setId}
          image={thumbs}
          tab={tab}
          onTabChange={setTab}
          showRecipes={false}
        />
        <View style={styles.actions}>
          <PressableScale style={[styles.action, styles.secondary]} onPress={() => router.push('/library')} accessibilityRole="button">
            <Ionicons name="images-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryText}>앨범 사진에 적용</Text>
          </PressableScale>
          <PressableScale style={[styles.action, styles.primary]} onPress={applyToCamera} accessibilityRole="button">
            <Ionicons name="camera-outline" size={18} color={colors.white} />
            <Text style={styles.primaryText}>이 필터로 촬영</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    width: '100%',
    backgroundColor: colors.ink,
    overflow: 'hidden',
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  caption: {
    position: 'absolute',
    left: spacing.xl,
    // Clear the sheet that overlaps the hero by radius.xl.
    bottom: radius.xl + spacing.lg,
    right: 80,
  },
  category: {
    ...typography.micro,
    color: colors.whiteMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 30,
    fontWeight: '300',
    letterSpacing: 0.2,
    color: colors.white,
    marginTop: 2,
  },
  desc: {
    ...typography.caption,
    color: colors.whiteSoft,
    marginTop: 4,
  },
  heart: {
    position: 'absolute',
    right: spacing.md,
    bottom: radius.xl + spacing.md,
  },
  sheet: {
    flex: 1,
    marginTop: -radius.xl,
    paddingTop: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  action: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.text,
  },
  primaryText: {
    ...typography.headline,
    color: colors.white,
  },
  secondary: {
    backgroundColor: colors.background,
  },
  secondaryText: {
    ...typography.headline,
  },
});
