import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, type IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { measureText } from '@/image-engine/frame/FrameCompositor';
import { feedback } from '@/services/feedback';
import { LUMI_ALBUM, pickImageFromSystem, pickImagesFromSystem, saveToLibrary } from '@/services/mediaLibrary';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import { confirmAction, permissionDenied } from '@/utils/dialogs';

import { BackgroundPanel } from '../components/BackgroundPanel';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { CustomFrameSheet } from '../components/CustomFrameSheet';
import { CustomizePanel, TextureSection } from '../components/CustomizePanel';
import { DecoratePanel } from '../components/DecoratePanel';
import { FilterSheet } from '../components/FilterSheet';
import { FramesPanel } from '../components/FramesPanel';
import { LayoutsPanel } from '../components/LayoutsPanel';
import { SelectionBar } from '../components/SelectionBar';
import { StudioCanvas } from '../components/StudioCanvas';
import { TemplateSheet } from '../components/TemplateSheet';
import { targetPrints } from '../components/controls';
import { useKitBank, usePreviewBank, useThumbPhoto } from '../hooks/useStudioAssets';
import {
  addPhotos,
  addText,
  applyFrame,
  createDocument,
  customFrameStyle,
  IDENTITY_TRANSFORM,
  photoLayers,
  replacePhoto,
  updateFrame,
  updateLayer,
} from '../model/document';
import { TEXT_COLORS } from '../presets/palette';
import { exportStudio } from '../services/saveStudio';
import { importImage } from '../services/studioImages';
import { useStudioCanRedo, useStudioCanUndo, useStudioStore } from '../stores/studioStore';
import type { ImageRef } from '../types/document';

type Tab = 'frames' | 'layouts' | 'background' | 'texture' | 'decorate' | 'customize';

const TABS: readonly { id: Tab; label: string; icon: IconName; activeIcon: IconName }[] = [
  { id: 'frames', label: 'Frames', icon: 'albums-outline', activeIcon: 'albums' },
  { id: 'layouts', label: 'Layouts', icon: 'grid-outline', activeIcon: 'grid' },
  { id: 'background', label: 'Background', icon: 'image-outline', activeIcon: 'image' },
  { id: 'texture', label: 'Texture', icon: 'layers-outline', activeIcon: 'layers' },
  { id: 'decorate', label: 'Decorate', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { id: 'customize', label: 'Customize', icon: 'options-outline', activeIcon: 'options' },
];

const PANEL_H = 214;

/** Opens the studio with photos (from the editor, library or home). */
export function openFrameStudio(photos: readonly ImageRef[]) {
  useStudioStore.getState().open(createDocument(photos));
  router.push('/studio');
}

async function pickPhotos(limit: number): Promise<ImageRef[]> {
  const picked = await pickImagesFromSystem(limit);
  const out: ImageRef[] = [];
  for (const p of picked) out.push((await importImage(p, 'photo')).ref);
  return out;
}

/**
 * Frame Studio: frames from the kit (and the album), layouts, background,
 * paper texture, decorations and text on one canvas document, with undo /
 * redo and a high-resolution export drawn from the originals.
 */
export default function FrameStudioScreen() {
  const insets = useSafeAreaInsets();
  const doc = useStudioStore((s) => s.doc);
  const selection = useStudioStore((s) => s.selection);
  const canUndo = useStudioCanUndo();
  const canRedo = useStudioCanRedo();
  const bank = usePreviewBank(doc);
  const kit = useKitBank();
  const thumb = useThumbPhoto(doc?.pool[0] ?? null);

  const [tab, setTab] = useState<Tab>('frames');
  // The selection a tab press put away (a new tap brings the actions back).
  const [hiddenSelection, setHiddenSelection] = useState<typeof selection>(null);
  const showSelection = !!selection && selection !== hiddenSelection;
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [sheet, setSheet] = useState<null | 'templates' | 'color' | 'custom'>(null);
  const [filterFor, setFilterFor] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState<null | { layerId: string | null; initial: string }>(null);
  const pastLength = useStudioStore((s) => s.past.length);

  const run = useCallback(async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    try {
      await job();
    } catch (e) {
      feedback.error();
      showToast('이미지를 불러오지 못했어요');
      if (__DEV__) console.warn('[studio]', e);
    } finally {
      setBusy(null);
    }
  }, []);

  const startWithPhotos = () =>
    run('사진 불러오는 중', async () => {
      const photos = await pickPhotos(9);
      if (photos.length) useStudioStore.getState().open(createDocument(photos));
    });

  const onAddPhotos = () =>
    run('사진 불러오는 중', async () => {
      const photos = await pickPhotos(9);
      if (photos.length) useStudioStore.getState().apply((d) => addPhotos(d, photos));
    });

  const onReplacePhoto = (layerId: string) =>
    run('사진 불러오는 중', async () => {
      const p = await pickImageFromSystem();
      if (!p) return;
      const { ref } = await importImage(p, 'photo');
      useStudioStore.getState().apply((d) => replacePhoto(d, layerId, ref));
    });

  const onImportFrame = () =>
    run('프레임 불러오는 중', async () => {
      const p = await pickImageFromSystem();
      if (!p) return;
      const { ref, hole } = await importImage(p, 'asset');
      const st = useStudioStore.getState();
      const ids = st.doc ? targetPrints(st.doc, st.selection?.id).map((l) => l.id) : [];
      const slot = hole
        ? { ...hole, shape: 'rect' as const, radius: 0 }
        : { x: 0.1, y: 0.1, width: 0.8, height: 0.66, shape: 'rect' as const, radius: 0 };
      st.apply((d) => applyFrame(d, customFrameStyle({ image: ref, slot, transform: { ...IDENTITY_TRANSFORM } }), ids));
      setSheet('custom');
    });

  const onPickBackground = () =>
    run('배경 불러오는 중', async () => {
      const p = await pickImageFromSystem();
      if (!p) return;
      const { ref } = await importImage(p, 'photo');
      useStudioStore.getState().apply((d) => ({ ...d, background: { ...d.background, fill: { kind: 'image', image: ref } } }));
    });

  const onImportTexture = () =>
    run('질감 불러오는 중', async () => {
      const p = await pickImageFromSystem();
      if (!p) return;
      const { ref } = await importImage(p, 'asset');
      const st = useStudioStore.getState();
      const ids = st.doc ? targetPrints(st.doc, st.selection?.id).map((l) => l.id) : [];
      st.apply((d) => {
        const id = `import:${Object.keys(d.imports).length + 1}`;
        return updateFrame({ ...d, imports: { ...d.imports, [id]: ref } }, ids, { texture: id, textureIntensity: 60 });
      });
    });

  const submitText = (value: string) => {
    const text = value.trim();
    if (!text || !textPrompt) return;
    const st = useStudioStore.getState();
    const measure = (size: number) => (bank ? measureText(text, size, bank) : text.length * size * 0.55);
    if (textPrompt.layerId) {
      const layer = st.doc?.layers.find((l) => l.id === textPrompt.layerId);
      if (layer?.kind !== 'text') return;
      const width = Math.max(layer.fontSize * 2, measure(layer.fontSize) + layer.fontSize);
      st.apply((d) => updateLayer(d, layer.id, { text, x: layer.x + (layer.width - width) / 2, width }));
    } else {
      st.apply((d) => addText(d, text, TEXT_COLORS[0]!, measure));
      const added = useStudioStore.getState().doc?.layers.at(-1);
      if (added) st.select({ id: added.id, mode: 'layer' });
    }
  };

  const save = async () => {
    const current = useStudioStore.getState().doc;
    if (!current || saving) return;
    const settings = useSettingsStore.getState();
    setSaving(true);
    try {
      const out = await exportStudio(current, { highQuality: settings.highQuality, format: settings.exportFormat, quality: settings.jpegQuality });
      const result = await saveToLibrary(out.uri, LUMI_ALBUM);
      if (!result.ok) {
        feedback.error();
        if (result.reason === 'permission') permissionDenied('사진 저장 권한이 필요해요', '설정에서 사진 접근을 허용해 주세요.');
        else showToast('저장하지 못했어요');
        return;
      }
      setSavedAt(useStudioStore.getState().past.length);
      feedback.success();
      showToast(`사진에 저장했어요 · ${out.width}×${out.height}`);
    } catch (e) {
      feedback.error();
      showToast('저장 중 문제가 생겼어요');
      if (__DEV__) console.warn('[studio save]', e);
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    const done = () => {
      useStudioStore.getState().close();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    };
    if (pastLength > 0 && savedAt !== pastLength) {
      confirmAction({ title: '프레임 편집을 그만할까요?', message: '저장하지 않은 편집 내용은 사라져요.', cancelText: '계속 편집', confirmText: '나가기', destructive: true, onConfirm: done });
    } else done();
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width: Math.floor(width - spacing.lg * 2), height: Math.floor(height - spacing.md * 2) });
  };

  if (!doc) {
    return (
      <View style={[styles.root, styles.empty, { paddingTop: insets.top }]}>
        <View style={styles.headerAbs}>
          <IconButton icon="chevron-back" accessibilityLabel="뒤로" onPress={leave} />
        </View>
        <Ionicons name="albums-outline" size={40} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>Frame Studio</Text>
        <Text style={styles.emptyText}>폴라로이드, 필름, 종이 프레임과 콜라주를 만들어요</Text>
        <PressableScale style={styles.primary} onPress={startWithPhotos} accessibilityRole="button" accessibilityLabel="사진 고르기">
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>사진 고르기</Text>}
        </PressableScale>
      </View>
    );
  }

  const selectedPrint = selection ? photoLayers(doc).find((l) => l.id === selection.id) : undefined;
  const panel = (() => {
    if (selection && showSelection) {
      return <SelectionBar onReplacePhoto={onReplacePhoto} onFilter={setFilterFor} onEditText={(id) => {
        const l = doc.layers.find((x) => x.id === id);
        if (l?.kind === 'text') setTextPrompt({ layerId: id, initial: l.text });
      }} />;
    }
    switch (tab) {
      case 'frames':
        return <FramesPanel kit={kit} photo={thumb.image} photoKey={thumb.key} onImportFrame={onImportFrame} onEditCustom={() => setSheet('custom')} />;
      case 'layouts':
        return <LayoutsPanel onAddPhotos={onAddPhotos} onTemplates={() => setSheet('templates')} />;
      case 'background':
        return <BackgroundPanel onPickImage={onPickBackground} />;
      case 'texture':
        return <TextureSection onImportTexture={onImportTexture} />;
      case 'decorate':
        return <DecoratePanel onAddText={() => setTextPrompt({ layerId: null, initial: '' })} />;
      case 'customize':
        return <CustomizePanel onOpenColor={() => setSheet('color')} onImportTexture={onImportTexture} />;
    }
  })();
  const colorTarget = (selectedPrint ?? photoLayers(doc)[0])?.frame.color ?? '#FFFFFF';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" accessibilityLabel="뒤로" onPress={leave} />
        <View style={styles.history}>
          <IconButton icon="arrow-undo-outline" size={20} accessibilityLabel="실행 취소" disabled={!canUndo} onPress={useStudioStore.getState().undo} />
          <IconButton icon="arrow-redo-outline" size={20} accessibilityLabel="다시 실행" disabled={!canRedo} onPress={useStudioStore.getState().redo} />
          <IconButton icon="bookmarks-outline" size={19} accessibilityLabel="템플릿" onPress={() => setSheet('templates')} />
        </View>
        <PressableScale style={[styles.save, saving && styles.saveBusy]} onPress={save} disabled={saving} accessibilityRole="button" accessibilityLabel="사진에 저장">
          {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveText}>저장</Text>}
        </PressableScale>
      </View>

      <View style={styles.stage} onLayout={onLayout}>
        {bank && box.width > 0 ? <StudioCanvas doc={doc} bank={bank} boxWidth={box.width} boxHeight={box.height} /> : <ActivityIndicator color={colors.textSecondary} />}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.white} size="small" />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.xs }]}>
        <View style={styles.panelBody}>{panel}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar} contentContainerStyle={styles.toolbarContent} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.id === tab && !(selection && showSelection);
            return (
              <PressableScale
                key={t.id}
                style={styles.tool}
                onPress={() => {
                  feedback.selection();
                  setTab(t.id);
                  setHiddenSelection(selection);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                aria-selected={on}
                accessibilityLabel={t.label}
              >
                <Ionicons name={on ? t.activeIcon : t.icon} size={20} color={on ? colors.text : colors.textSecondary} />
                <Text style={[styles.toolLabel, on && styles.toolLabelOn]}>{t.label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      <TemplateSheet visible={sheet === 'templates'} onClose={() => setSheet(null)} />
      <ColorPickerSheet
        visible={sheet === 'color'}
        initial={colorTarget}
        onClose={() => {
          useStudioStore.getState().commit();
          setSheet(null);
        }}
        onPreview={(color) => {
          const st = useStudioStore.getState();
          const ids = st.doc ? targetPrints(st.doc, st.selection?.id).map((l) => l.id) : [];
          st.live((d) => updateFrame(d, ids, { color }));
        }}
        onConfirm={(color) => {
          const st = useStudioStore.getState();
          const ids = st.doc ? targetPrints(st.doc, st.selection?.id).map((l) => l.id) : [];
          st.live((d) => updateFrame(d, ids, { color }));
        }}
      />
      <CustomFrameSheet visible={sheet === 'custom'} onClose={() => setSheet(null)} bank={bank} />
      <FilterSheet layerId={filterFor} onClose={() => setFilterFor(null)} />
      <TextPromptDialog
        visible={!!textPrompt}
        title={textPrompt?.layerId ? '텍스트 편집' : '텍스트 추가'}
        initialValue={textPrompt?.initial}
        placeholder="예: Summer '26"
        confirmText={textPrompt?.layerId ? '변경' : '추가'}
        maxLength={40}
        onSubmit={submitText}
        onClose={() => setTextPrompt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  headerAbs: { position: 'absolute', top: 48, left: spacing.sm },
  emptyTitle: { ...typography.title },
  emptyText: { ...typography.caption, textAlign: 'center' },
  primary: { marginTop: spacing.md, minHeight: 46, minWidth: 160, paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.headline, color: colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, height: 52 },
  history: { flexDirection: 'row', alignItems: 'center' },
  save: { minWidth: 64, minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  saveBusy: { opacity: 0.7 },
  saveText: { ...typography.headline, fontSize: 14, color: colors.white },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  busy: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(36, 33, 30, 0.72)',
  },
  busyText: { ...typography.caption, color: colors.white },
  panel: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md },
  panelBody: { height: PANEL_H, justifyContent: 'center' },
  toolbar: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toolbarContent: { flexGrow: 1, justifyContent: 'space-around', paddingHorizontal: spacing.xs, paddingTop: spacing.sm },
  tool: { minWidth: 52, minHeight: 48, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', gap: 3 },
  toolLabel: { ...typography.micro },
  toolLabelOn: { color: colors.text, fontWeight: '600' },
});
