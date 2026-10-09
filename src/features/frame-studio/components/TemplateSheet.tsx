import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { showToast } from '@/stores/toastStore';
import { confirmAction } from '@/utils/dialogs';

import { applyTemplate } from '../model/document';
import { starterTemplates } from '../presets/starterTemplates';
import { useStudioStore } from '../stores/studioStore';
import { TEMPLATE_NAME_MAX, useTemplateStore } from '../stores/templateStore';
import type { StudioTemplate } from '../types/document';

/**
 * Save the current frame setup as a template (frame, colour, paper,
 * background, layout, decorations, canvas, positions — never the photos) and
 * apply saved ones to the photos in this project.
 */
export function TemplateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const templates = useTemplateStore((s) => s.templates);
  const [name, setName] = useState('');

  const save = () => {
    const doc = useStudioStore.getState().doc;
    if (!doc) return;
    const t = useTemplateStore.getState().save(name || 'My Frame', doc);
    setName('');
    showToast(`‘${t.name}’ 템플릿을 저장했어요`);
  };
  const use = (t: StudioTemplate) => {
    const st = useStudioStore.getState();
    st.select(null);
    st.apply((d) => applyTemplate(t, d.pool));
    onClose();
  };

  const row = (t: StudioTemplate, removable: boolean) => (
    <View key={t.id} style={styles.row}>
      <PressableScale style={styles.rowMain} onPress={() => use(t)} accessibilityRole="button" accessibilityLabel={`템플릿 ${t.name} 적용`}>
        <Ionicons name={removable ? 'bookmark-outline' : 'sparkles-outline'} size={16} color={colors.textSecondary} />
        <Text style={styles.rowText}>{t.name}</Text>
        <Text style={styles.rowMeta}>{`${t.doc.layers.filter((l) => l.kind === 'photo').length}장`}</Text>
      </PressableScale>
      {removable ? (
        <IconButton
          icon="trash-outline"
          size={16}
          color={colors.textSecondary}
          accessibilityLabel={`${t.name} 삭제`}
          onPress={() => confirmAction({ title: '템플릿을 삭제할까요?', confirmText: '삭제', destructive: true, onConfirm: () => useTemplateStore.getState().remove(t.id) })}
        />
      ) : null}
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="템플릿">
      <View style={styles.saveRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="템플릿 이름 (예: Cream Polaroid)"
          placeholderTextColor={colors.textTertiary}
          maxLength={TEMPLATE_NAME_MAX}
          style={styles.input}
          accessibilityLabel="템플릿 이름"
        />
        <PressableScale style={styles.saveBtn} onPress={save} accessibilityRole="button" accessibilityLabel="템플릿으로 저장">
          <Text style={styles.saveText}>저장</Text>
        </PressableScale>
      </View>
      <Text style={styles.note}>사진은 저장되지 않아요. 템플릿을 고르면 지금 사진들이 순서대로 들어가요.</Text>
      <ScrollView style={styles.list}>
        {templates.length ? <Text style={styles.section}>내 템플릿</Text> : null}
        {templates.map((t) => row(t, true))}
        <Text style={styles.section}>기본 템플릿</Text>
        {starterTemplates().map((t) => row(t, false))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  saveRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, ...typography.body, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.background },
  saveBtn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.text, justifyContent: 'center' },
  saveText: { ...typography.headline, fontSize: 14, color: colors.white },
  note: { ...typography.caption, fontSize: 11, marginTop: spacing.sm },
  list: { maxHeight: 300, marginTop: spacing.md },
  section: { ...typography.micro, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  rowText: { ...typography.callout, flex: 1 },
  rowMeta: { ...typography.caption },
});
