import { Ionicons } from '@expo/vector-icons';
import { useTypeface } from '@shopify/react-native-skia';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/common/Header';
import { IconButton } from '@/components/common/IconButton';
import { PermissionView } from '@/components/common/PermissionView';
import { PressableScale } from '@/components/common/PressableScale';
import { BatchLookSheet } from '@/components/batch/BatchLookSheet';
import { PhotoGrid } from '@/components/library/PhotoGrid';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { DATE_STAMP_FONT } from '@/render/DateStampLayer';
import { BATCH_LIMIT, summarize, type BatchSource } from '@/services/batch/queue';
import { feedback } from '@/services/feedback';
import {
  fetchRecentPhotos,
  getLibraryAccess,
  pickImageFromSystem,
  pickImagesFromSystem,
  presentLimitedLibraryPicker,
  requestLibraryAccess,
  type LibraryAccess,
  type LibraryPhoto,
} from '@/services/mediaLibrary';
import { useBatchStore } from '@/stores/batchStore';
import type { Look } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';

const PAGE = 90;

export default function LibraryScreen() {
  const [access, setAccess] = useState<LibraryAccess | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const done = useRef(false);
  const { openAsset, openUri, loadingId } = useOpenInEditor();
  // 일괄 보정: selection mode (ids in pick order) and the chosen sources.
  const [selected, setSelected] = useState<string[] | null>(null);
  const [batchSources, setBatchSources] = useState<BatchSource[] | null>(null);
  const typeface = useTypeface(DATE_STAMP_FONT);
  const savedJob = useBatchStore((s) => s.job);
  useEffect(() => {
    void useBatchStore.getState().load();
  }, []);
  const unfinished = savedJob && !useBatchStore.getState().running && summarize(savedJob).pending > 0;

  const count = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (reset: boolean) => {
    if (loadingRef.current || (!reset && done.current)) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchRecentPhotos(PAGE, reset ? 0 : count.current);
      done.current = page.length < PAGE;
      setPhotos((prev) => {
        const next = reset ? page : [...prev, ...page.filter((x) => !prev.some((y) => y.id === x.id))];
        count.current = next.length;
        return next;
      });
    } catch {
      done.current = true;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Ask for library access when the user actually opens the album.
  useEffect(() => {
    (async () => {
      let a = await getLibraryAccess();
      if (a === 'undetermined') a = await requestLibraryAccess();
      if (a === 'denied') setCanAsk(false);
      setAccess(a);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (access === 'granted' || access === 'limited') {
        done.current = false;
        void load(true);
      }
    }, [access, load]),
  );

  const pick = useCallback(async () => {
    const picked = await pickImageFromSystem();
    if (picked) await openUri(picked.uri, picked.takenAt);
  }, [openUri]);

  const onPressPhoto = useCallback(
    (p: LibraryPhoto) => {
      if (!selected) return void openAsset(p.id);
      feedback.selection();
      setSelected((ids) => {
        if (!ids) return ids;
        if (ids.includes(p.id)) return ids.filter((i) => i !== p.id);
        if (ids.length >= BATCH_LIMIT) {
          showToast(`한 번에 ${BATCH_LIMIT}장까지 보정할 수 있어요`);
          return ids;
        }
        return [...ids, p.id];
      });
    },
    [openAsset, selected],
  );

  const pickMany = async () => {
    const picked = await pickImagesFromSystem(BATCH_LIMIT);
    if (picked.length) setBatchSources(picked.map((p) => ({ kind: 'uri', uri: p.uri, takenAt: p.takenAt })));
  };

  const startBatch = (look: Look, name: string) => {
    if (!batchSources?.length) return;
    useBatchStore.getState().start(batchSources, look, name, typeface);
    setBatchSources(null);
    setSelected(null);
    router.push('/batch');
  };

  const pickerButton = selected ? (
    <PressableScale style={styles.headerText} onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel="선택 취소">
      <Text style={styles.headerTextLabel}>취소</Text>
    </PressableScale>
  ) : (
    <View style={styles.headerButtons}>
      <IconButton
        icon="albums-outline"
        accessibilityLabel="여러 장 선택해 일괄 보정"
        onPress={() => (access === 'granted' || access === 'limited' ? setSelected([]) : void pickMany())}
      />
      <IconButton icon="folder-open-outline" accessibilityLabel="시스템 사진 선택기 열기" onPress={() => void pick()} />
    </View>
  );

  const batchBanner = unfinished ? (
    <PressableScale style={styles.banner} onPress={() => router.push('/batch')} accessibilityRole="button" accessibilityLabel="진행 중이던 일괄 보정 보기">
      <Ionicons name="layers-outline" size={16} color={colors.textSecondary} />
      <Text style={styles.bannerText}>
        끝나지 않은 일괄 보정이 있어요 ({summarize(savedJob).finished}/{summarize(savedJob).total}) · 이어서 하기
      </Text>
    </PressableScale>
  ) : null;

  const limitedBanner =
    access === 'limited' ? (
      <PressableScale style={styles.banner} onPress={() => void presentLimitedLibraryPicker().then(() => load(true))} accessibilityRole="button">
        <Ionicons name="lock-open-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.bannerText}>선택한 사진만 보이고 있어요 · 사진 더 선택하기</Text>
      </PressableScale>
    ) : null;

  let body: React.ReactNode;
  if (access === null) {
    body = <ActivityIndicator style={styles.center} color={colors.textSecondary} />;
  } else if (access === 'unavailable') {
    body = (
      <PermissionView
        icon="images-outline"
        title="사진을 골라 편집해 보세요"
        message={Platform.OS === 'web' ? '웹에서는 파일 선택으로 사진을 불러와요.' : '사진 보관함을 사용할 수 없어요.'}
        canAskAgain
        actionLabel="사진 선택하기"
        onRequest={() => void pick()}
      />
    );
  } else if (access === 'denied' || access === 'undetermined') {
    body = (
      <PermissionView
        icon="images-outline"
        title="사진 보관함 접근이 필요해요"
        message={'최근 사진을 한눈에 보고 바로 편집하려면\n사진 접근 권한을 허용해 주세요.'}
        canAskAgain={canAsk}
        onRequest={async () => {
          const a = await requestLibraryAccess();
          if (a === 'denied') setCanAsk(false);
          setAccess(a);
        }}
        secondaryLabel="사진 한 장만 선택하기"
        onSecondary={() => void pick()}
      />
    );
  } else if (!photos.length && !loading) {
    body = (
      <View style={styles.center}>
        {limitedBanner}
        <Text style={styles.emptyText}>아직 사진이 없어요</Text>
      </View>
    );
  } else {
    body = (
      <PhotoGrid
        photos={photos}
        onPress={onPressPhoto}
        onEndReached={() => void load(false)}
        loadingId={loadingId}
        header={
          <>
            {batchBanner}
            {limitedBanner}
          </>
        }
        selected={selected}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Header
        center={
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{selected ? `${selected.length}장 선택` : '최근 항목'}</Text>
          </View>
        }
        right={pickerButton}
      />
      {access === 'unavailable' && batchBanner ? <View>{batchBanner}</View> : null}
      {body}
      {selected ? (
        <View style={styles.selectBar}>
          <Text style={styles.selectCount}>{selected.length ? `${selected.length}장 선택됨` : '보정할 사진을 골라 주세요'}</Text>
          <PressableScale
            style={[styles.selectButton, !selected.length && styles.selectButtonOff]}
            disabled={!selected.length}
            onPress={() =>
              setBatchSources(
                selected.map((id) => ({ kind: 'asset', assetId: id, previewUri: photos.find((p) => p.id === id)?.previewUri ?? id })),
              )
            }
            accessibilityRole="button"
            accessibilityLabel="선택한 사진 일괄 보정"
          >
            <Text style={styles.selectButtonText}>일괄 보정</Text>
          </PressableScale>
        </View>
      ) : null}
      <BatchLookSheet visible={!!batchSources} count={batchSources?.length ?? 0} onClose={() => setBatchSources(null)} onChoose={startBatch} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    ...typography.title,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  bannerText: {
    ...typography.caption,
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerText: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  headerTextLabel: {
    ...typography.callout,
    color: colors.accent,
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  selectCount: {
    ...typography.callout,
    flex: 1,
  },
  selectButton: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    justifyContent: 'center',
  },
  selectButtonOff: {
    opacity: 0.35,
  },
  selectButtonText: {
    ...typography.headline,
    fontSize: 14,
    color: colors.white,
  },
});
