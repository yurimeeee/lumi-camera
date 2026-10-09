import { Ionicons } from '@expo/vector-icons';
import { useTypeface } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/common/Header';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { DATE_STAMP_FONT } from '@/render/DateStampLayer';
import { summarize, type BatchItem } from '@/services/batch/queue';
import { useBatchStore } from '@/stores/batchStore';

const STATUS: Record<BatchItem['status'], { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  pending: { label: '대기', icon: 'ellipse-outline', color: colors.textTertiary },
  running: { label: '보정 중', icon: 'sync-outline', color: colors.accent },
  done: { label: '저장됨', icon: 'checkmark-circle', color: colors.success },
  failed: { label: '실패', icon: 'alert-circle', color: colors.danger },
  cancelled: { label: '취소됨', icon: 'remove-circle-outline', color: colors.textTertiary },
};

/**
 * 일괄 보정 progress: one photo at a time, saved as new photos (originals are
 * kept). Cancel stops after the photo in progress; failed photos can be
 * retried; a job interrupted by closing the app continues from here.
 */
export default function BatchScreen() {
  const insets = useSafeAreaInsets();
  const job = useBatchStore((s) => s.job);
  const running = useBatchStore((s) => s.running);
  const stopping = useBatchStore((s) => s.stopping);
  const typeface = useTypeface(DATE_STAMP_FONT);

  useEffect(() => {
    void useBatchStore.getState().load();
  }, []);

  if (!job) {
    return (
      <View style={styles.root}>
        <Header title="일괄 보정" />
        <View style={styles.center}>
          <Text style={styles.empty}>진행 중인 일괄 보정이 없어요</Text>
        </View>
      </View>
    );
  }

  const sum = summarize(job);
  const progress = sum.total ? sum.finished / sum.total : 0;
  const paused = !running && sum.pending > 0;
  const finished = !running && sum.pending === 0;

  return (
    <View style={styles.root}>
      <Header title="일괄 보정" />
      <View style={styles.summary}>
        <Text style={styles.lookName} numberOfLines={1}>
          {job.lookName}
        </Text>
        <Text style={styles.counts} accessibilityLiveRegion="polite">
          {sum.done}장 저장 · {sum.failed ? `${sum.failed}장 실패 · ` : ''}
          {sum.cancelled ? `${sum.cancelled}장 취소 · ` : ''}
          {sum.total}장 중 {sum.finished}장 처리
        </Text>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: sum.total, now: sum.finished }}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        {paused && job.state !== 'cancelled' ? <Text style={styles.note}>앱이 닫혀 중단됐어요. 남은 사진을 이어서 보정할 수 있어요.</Text> : null}
        {finished ? <Text style={styles.note}>원본 사진은 그대로예요. 보정된 사진은 ‘Lumi’ 앨범에 새로 저장했어요.</Text> : null}
      </View>

      <FlatList
        data={job.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const st = STATUS[item.status];
          const preview = item.outputUri ?? (item.source.kind === 'asset' ? item.source.previewUri : item.source.uri);
          return (
            <View style={styles.row}>
              <Image source={{ uri: preview }} style={styles.thumb} contentFit="cover" />
              <View style={styles.info}>
                <View style={styles.statusRow}>
                  {item.status === 'running' ? (
                    <ActivityIndicator size="small" color={st.color} />
                  ) : (
                    <Ionicons name={st.icon} size={16} color={st.color} />
                  )}
                  <Text style={[styles.status, { color: st.color }]}>{st.label}</Text>
                  {item.width ? <Text style={styles.size}>{`${item.width}×${item.height}`}</Text> : null}
                </View>
                {item.error ? (
                  <Text style={styles.error} numberOfLines={2}>
                    {item.error}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
        {running ? (
          <PressableScale
            style={[styles.button, styles.secondary]}
            disabled={stopping}
            onPress={() => useBatchStore.getState().cancel()}
            accessibilityRole="button"
            accessibilityLabel="일괄 보정 취소"
          >
            <Text style={styles.secondaryText}>{stopping ? '지금 사진까지만 저장하고 멈춰요…' : '취소'}</Text>
          </PressableScale>
        ) : null}
        {paused ? (
          <PressableScale style={styles.button} onPress={() => useBatchStore.getState().resume(typeface)} accessibilityRole="button" accessibilityLabel="이어서 보정">
            <Text style={styles.buttonText}>남은 {sum.pending}장 이어서 보정</Text>
          </PressableScale>
        ) : null}
        {!running && (sum.failed > 0 || sum.cancelled > 0) ? (
          <PressableScale
            style={[styles.button, styles.secondary]}
            onPress={() => useBatchStore.getState().retry(typeface)}
            accessibilityRole="button"
            accessibilityLabel="실패한 사진 다시 시도"
          >
            <Text style={styles.secondaryText}>{sum.failed + sum.cancelled}장 다시 시도</Text>
          </PressableScale>
        ) : null}
        {finished ? (
          <PressableScale
            style={styles.button}
            onPress={() => {
              useBatchStore.getState().clear();
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel="완료"
          >
            <Text style={styles.buttonText}>완료</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  summary: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  lookName: {
    ...typography.title,
  },
  counts: {
    ...typography.caption,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  note: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  info: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  status: {
    ...typography.callout,
    fontSize: 14,
  },
  size: {
    ...typography.caption,
    fontSize: 11,
    marginLeft: 'auto',
  },
  error: {
    ...typography.caption,
    fontSize: 11,
    color: colors.danger,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  button: {
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.headline,
    fontSize: 15,
    color: colors.white,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
  },
  secondaryText: {
    ...typography.headline,
    fontSize: 15,
    color: colors.text,
  },
});
