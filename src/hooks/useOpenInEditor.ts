import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { storeOriginal } from '@/services/appFiles';
import { pruneStoredOriginals } from '@/services/editProject';
import { EXPORT_MAX_SIDE_HQ, EXPORT_MAX_SIDE_STD, normalizeImage } from '@/services/imagePipeline';
import { resolvePhotoFile } from '@/services/mediaLibrary';
import { useCameraStore } from '@/stores/cameraStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';

/** Prepares a library photo (upright JPEG at working size) and opens the editor. */
export function useOpenInEditor() {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openFile = useCallback(async (uri: string, takenAt: number) => {
    const settings = useSettingsStore.getState();
    const normalized = await normalizeImage(uri, settings.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD);
    // Edit an app-owned copy so the project survives cache purges and restarts.
    const image = { ...normalized, uri: await storeOriginal(normalized.uri) };
    useCameraStore.getState().setLastPhoto(image.uri);
    useEditorStore.getState().open(
      { ...image, origin: 'library', takenAt },
      { filterId: settings.defaultFilterId, intensity: settings.defaultIntensity, dateStamp: settings.dateStamp },
    );
    router.push('/editor');
    void pruneStoredOriginals([image.uri]);
  }, []);

  const openAsset = useCallback(
    async (id: string) => {
      if (loadingId) return;
      setLoadingId(id);
      try {
        const file = await resolvePhotoFile(id);
        await openFile(file.uri, file.takenAt);
      } catch {
        showToast('사진을 불러오지 못했어요');
      } finally {
        setLoadingId(null);
      }
    },
    [loadingId, openFile],
  );

  const openUri = useCallback(
    async (uri: string, takenAt = Date.now()) => {
      setLoadingId(uri);
      try {
        await openFile(uri, takenAt);
      } catch {
        showToast('사진을 불러오지 못했어요');
      } finally {
        setLoadingId(null);
      }
    },
    [openFile],
  );

  return { openAsset, openUri, loadingId };
}
