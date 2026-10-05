import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/common/Header';
import { IconButton } from '@/components/common/IconButton';
import { PermissionView } from '@/components/common/PermissionView';
import { PressableScale } from '@/components/common/PressableScale';
import { PhotoGrid } from '@/components/library/PhotoGrid';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import {
  fetchRecentPhotos,
  getLibraryAccess,
  pickImageFromSystem,
  presentLimitedLibraryPicker,
  requestLibraryAccess,
  type LibraryAccess,
  type LibraryPhoto,
} from '@/services/mediaLibrary';

const PAGE = 90;

export default function LibraryScreen() {
  const [access, setAccess] = useState<LibraryAccess | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const done = useRef(false);
  const { openAsset, openUri, loadingId } = useOpenInEditor();

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

  const onPressPhoto = useCallback((p: LibraryPhoto) => void openAsset(p.id), [openAsset]);

  const pickerButton = (
    <IconButton icon="folder-open-outline" accessibilityLabel="시스템 사진 선택기 열기" onPress={() => void pick()} />
  );

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
        header={limitedBanner}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Header
        center={
          <View style={styles.titleWrap}>
            <Text style={styles.title}>최근 항목</Text>
          </View>
        }
        right={pickerButton}
      />
      {body}
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
  },
});
