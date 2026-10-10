import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import { copyEdits, NOT_COPIED, PASTE_CATEGORIES, pasteEdits, type PasteCategory } from '@/services/editClipboard';
import { feedback } from '@/services/feedback';
import { historyEntries } from '@/services/history';
import { useClipboardStore } from '@/stores/clipboardStore';
import { HISTORY_LIMIT, useEditorStore } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';
import { confirmAction } from '@/utils/dialogs';

import { MenuItem } from './SelectivePanel';

/**
 * 편집 기록: every kept step by name. Tapping one shows the photo at that
 * step (several undos / redos at once); the steps after it stay until a new
 * edit is made, which replaces them (linear history — save a version first
 * to keep an alternative).
 */
export function HistorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const past = useEditorStore((s) => s.past);
  const present = useEditorStore((s) => s.committed);
  const future = useEditorStore((s) => s.future);
  const restored = useEditorStore((s) => s.restored);
  const entries = useMemo(
    () => (visible ? historyEntries(past, present, future, !restored && past.length < HISTORY_LIMIT) : []),
    [visible, past, present, future, restored],
  );
  return (
    <BottomSheet visible={visible} onClose={onClose} title="편집 기록">
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {[...entries].reverse().map((e) => (
          <PressableScale
            key={e.index}
            style={[styles.step, e.current && styles.stepOn]}
            onPress={() => {
              feedback.selection();
              useEditorStore.getState().jumpTo(e.index);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: e.current }}
            accessibilityLabel={`${e.label}${e.current ? ', 현재' : e.undone ? ', 되돌린 단계' : ''}`}
          >
            <View style={[styles.dot, e.current && styles.dotOn, e.undone && styles.dotUndone]} />
            <Text style={[styles.stepText, e.undone && styles.stepUndone]} numberOfLines={1}>
              {e.label}
            </Text>
            {e.current ? <Text style={styles.now}>현재</Text> : null}
          </PressableScale>
        ))}
      </ScrollView>
      <Text style={styles.note}>단계를 누르면 그때의 사진을 볼 수 있어요. 이전 단계에서 새로 편집하면 그 뒤의 기록은 사라져요 — 남기고 싶다면 먼저 버전으로 저장해 주세요.</Text>
    </BottomSheet>
  );
}

/** 버전: named snapshots of the edit (the photo itself is never copied). */
export function VersionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const versions = useEditorStore((s) => s.versions);
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
  const { saveVersion, restoreVersion, renameVersion, deleteVersion, resetAll } = useEditorStore.getState();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="버전">
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <View style={styles.version}>
          <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.versionName}>Original</Text>
          <PressableScale style={styles.small} onPress={() => { resetAll(); feedback.light(); onClose(); }} accessibilityRole="button" accessibilityLabel="원본으로 복원">
            <Text style={styles.smallText}>복원</Text>
          </PressableScale>
        </View>
        {versions.map((v) => (
          <View key={v.id} style={styles.version}>
            <Ionicons name="bookmark-outline" size={18} color={colors.textSecondary} />
            <View style={styles.flex}>
              <Text style={styles.versionName} numberOfLines={1}>
                {v.name}
              </Text>
              <Text style={styles.versionDate}>{new Date(v.createdAt).toLocaleString()}</Text>
            </View>
            <PressableScale
              style={styles.small}
              onPress={() => {
                restoreVersion(v.id);
                feedback.success();
                showToast(`‘${v.name}’ 버전으로 돌아왔어요`);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={`${v.name} 복원`}
            >
              <Text style={styles.smallText}>복원</Text>
            </PressableScale>
            <IconButton icon="create-outline" size={16} color={colors.textSecondary} accessibilityLabel={`${v.name} 이름 변경`} onPress={() => setNaming({ id: v.id, name: v.name })} />
            <IconButton
              icon="trash-outline"
              size={16}
              color={colors.textSecondary}
              accessibilityLabel={`${v.name} 삭제`}
              onPress={() => confirmAction({ title: `‘${v.name}’ 버전을 삭제할까요?`, confirmText: '삭제', destructive: true, onConfirm: () => deleteVersion(v.id) })}
            />
          </View>
        ))}
      </ScrollView>
      <PressableScale style={styles.primary} onPress={() => setNaming({ id: null, name: `버전 ${versions.length + 1}` })} accessibilityRole="button" accessibilityLabel="지금 편집을 버전으로 저장">
        <Text style={styles.primaryText}>지금 편집을 버전으로 저장</Text>
      </PressableScale>
      <Text style={styles.note}>버전에는 보정 값만 저장돼요. 원본 사진은 복제하지 않아요.</Text>
      <TextPromptDialog
        visible={!!naming}
        title={naming?.id ? '버전 이름' : '버전으로 저장'}
        initialValue={naming?.name}
        placeholder="예: Warm Edit"
        confirmText={naming?.id ? '변경' : '저장'}
        maxLength={24}
        onSubmit={(name) => {
          if (naming?.id) renameVersion(naming.id, name);
          else {
            saveVersion(name);
            feedback.success();
            showToast('버전을 저장했어요');
          }
        }}
        onClose={() => setNaming(null)}
      />
    </BottomSheet>
  );
}

/** 편집 붙여넣기: pick which parts of the copied edit to apply (one undo step). */
export function PasteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const copied = useClipboardStore((s) => s.copied);
  const categories = useClipboardStore((s) => s.categories);
  const chosen = new Set(categories);
  const toggle = (c: PasteCategory) => {
    const next = new Set(chosen);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    useClipboardStore.getState().setCategories([...next]);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="편집 붙여넣기">
      {PASTE_CATEGORIES.map((c) => (
        <View key={c.id} style={styles.toggleRow}>
          <Text style={styles.toggleText}>{c.label}</Text>
          <Switch value={chosen.has(c.id)} onValueChange={() => toggle(c.id)} trackColor={{ true: colors.accent, false: colors.border }} {...WEB_SWITCH} accessibilityLabel={`${c.label} 붙여넣기`} />
        </View>
      ))}
      <Text style={styles.note}>{NOT_COPIED}</Text>
      <PressableScale
        style={[styles.primary, (!copied || chosen.size === 0) && styles.disabled]}
        disabled={!copied || chosen.size === 0}
        onPress={() => {
          if (!copied) return;
          useEditorStore.getState().replaceEdit((s) => pasteEdits(s, copied, chosen));
          feedback.success();
          showToast('편집을 붙여넣었어요');
          onClose();
        }}
        accessibilityRole="button"
        accessibilityLabel="선택한 편집 붙여넣기"
      >
        <Text style={styles.primaryText}>붙여넣기</Text>
      </PressableScale>
    </BottomSheet>
  );
}

/** ⋯: versions, copy / paste, reset. */
export function MoreSheet({
  visible,
  onClose,
  onVersions,
  onPaste,
  onExport,
}: {
  visible: boolean;
  onClose: () => void;
  onVersions: () => void;
  onPaste: () => void;
  onExport: () => void;
}) {
  const copied = useClipboardStore((s) => s.copied);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="편집">
      <MenuItem icon="download-outline" label="상세 저장 (형식 · 해상도 · 메타데이터)" onPress={() => { onClose(); onExport(); }} />
      <MenuItem icon="bookmarks-outline" label="버전" onPress={() => { onClose(); onVersions(); }} />
      <MenuItem
        icon="copy-outline"
        label="편집 복사"
        onPress={() => {
          useClipboardStore.getState().copy(copyEdits(useEditorStore.getState().committed));
          feedback.success();
          showToast('편집을 복사했어요. 다른 사진에서 붙여넣을 수 있어요');
          onClose();
        }}
      />
      <MenuItem icon="clipboard-outline" label={copied ? '편집 붙여넣기' : '편집 붙여넣기 (복사한 편집 없음)'} onPress={() => { onClose(); if (copied) onPaste(); }} />
      <MenuItem
        icon="refresh-circle-outline"
        label="모든 편집 초기화"
        danger
        onPress={() => {
          onClose();
          confirmAction({ title: '모든 편집을 초기화할까요?', confirmText: '초기화', destructive: true, onConfirm: useEditorStore.getState().resetAll });
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { maxHeight: 360 },
  listContent: { gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  stepOn: { backgroundColor: colors.accentMuted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textTertiary },
  dotOn: { backgroundColor: colors.accent },
  dotUndone: { backgroundColor: colors.border },
  stepText: { ...typography.callout, flex: 1 },
  stepUndone: { color: colors.textTertiary },
  now: { ...typography.micro, color: colors.accent },
  note: { ...typography.caption, fontSize: 11, lineHeight: 16, color: colors.textTertiary, marginTop: spacing.sm },
  version: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  versionName: { ...typography.callout },
  versionDate: { ...typography.caption, fontSize: 10, color: colors.textTertiary },
  small: { minHeight: 30, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, justifyContent: 'center' },
  smallText: { ...typography.filterName, color: colors.text },
  primary: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  primaryText: { ...typography.headline, fontSize: 14, color: colors.white },
  disabled: { opacity: 0.35 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  toggleText: { ...typography.body },
});
