import { StyleSheet, Text, View } from 'react-native';

import { IconButton, type IconName } from '@/components/common/IconButton';
import { colors, spacing, typography } from '@/constants/theme';
import { getDecoration } from '@/image-engine/frame/registry';

import { deleteLayer, duplicateLayer, reorderLayer, updateLayer } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import { StudioSlider } from './controls';

interface Props {
  onReplacePhoto: (layerId: string) => void;
  onFilter: (layerId: string) => void;
  onEditText: (layerId: string) => void;
}

function Action({ icon, label, onPress, active, disabled }: { icon: IconName; label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <IconButton
      icon={icon}
      size={18}
      label={label}
      labelColor={active ? colors.accent : colors.textSecondary}
      color={active ? colors.accent : colors.text}
      active={active}
      disabled={disabled}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.action}
    />
  );
}

/**
 * Actions for the selected layer: photo (replace, crop mode, filter), text
 * (edit), and for every layer order, duplicate, delete, lock and opacity.
 * Photo editing (inside the window) and print editing stay separate: crop
 * mode moves the picture, layer mode moves the print.
 */
export function SelectionBar({ onReplacePhoto, onFilter, onEditText }: Props) {
  const selection = useStudioStore((s) => s.selection);
  const layer = useStudioStore((s) => (s.selection ? s.doc?.layers.find((l) => l.id === s.selection!.id) : undefined));
  const z = useStudioStore((s) => (s.selection ? (s.doc?.layers.findIndex((l) => l.id === s.selection!.id) ?? -1) : -1));
  const count = useStudioStore((s) => s.doc?.layers.length ?? 0);
  if (!selection || !layer) return null;
  const { apply, live, select } = useStudioStore.getState();
  const cropping = selection.mode === 'content';
  const title =
    layer.kind === 'photo' ? (cropping ? '사진 위치 · 자르기' : '사진') : layer.kind === 'text' ? '텍스트' : (getDecoration(layer.assetId)?.name ?? '장식');
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{cropping ? '끌어서 이동 · 두 손가락으로 확대/회전 · 두 번 탭해 끝내기' : `레이어 ${z + 1}/${count}`}</Text>
        <IconButton icon="close" size={16} color={colors.textSecondary} accessibilityLabel="선택 해제" onPress={() => select(null)} />
      </View>
      <View style={styles.actions}>
        {layer.kind === 'photo' ? (
          <>
            <Action icon="images-outline" label="교체" onPress={() => onReplacePhoto(layer.id)} />
            <Action icon="crop-outline" label="자르기" active={cropping} disabled={!layer.photo} onPress={() => select({ id: layer.id, mode: cropping ? 'layer' : 'content' })} />
            <Action icon="color-filter-outline" label="필터" disabled={!layer.photo} onPress={() => onFilter(layer.id)} />
          </>
        ) : null}
        {layer.kind === 'text' ? <Action icon="create-outline" label="편집" onPress={() => onEditText(layer.id)} /> : null}
        <Action icon="arrow-up-outline" label="앞으로" disabled={z >= count - 1} onPress={() => apply((d) => reorderLayer(d, layer.id, 'forward'))} />
        <Action icon="arrow-down-outline" label="뒤로" disabled={z <= 0} onPress={() => apply((d) => reorderLayer(d, layer.id, 'backward'))} />
        <Action
          icon="copy-outline"
          label="복제"
          onPress={() => {
            let newId: string | null = null;
            apply((d) => {
              const r = duplicateLayer(d, layer.id);
              newId = r.id;
              return r.doc;
            });
            if (newId) select({ id: newId, mode: 'layer' });
          }}
        />
        <Action icon={layer.locked ? 'lock-closed' : 'lock-open-outline'} label={layer.locked ? '잠김' : '잠금'} active={layer.locked} onPress={() => apply((d) => updateLayer(d, layer.id, { locked: !layer.locked }))} />
        <Action
          icon="trash-outline"
          label="삭제"
          onPress={() => {
            select(null);
            apply((d) => deleteLayer(d, layer.id));
          }}
        />
      </View>
      {cropping && layer.kind === 'photo' ? (
        <StudioSlider
          label="확대"
          value={Math.round(layer.content.scale * 100)}
          min={100}
          max={400}
          reset={100}
          onChange={(v) => live((d) => updateLayer(d, layer.id, { content: { ...layer.content, scale: v / 100 } }))}
        />
      ) : (
        <StudioSlider label="불투명도" value={Math.round(layer.opacity * 100)} reset={100} onChange={(v) => live((d) => updateLayer(d, layer.id, { opacity: v / 100 }))} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 2, paddingBottom: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, gap: spacing.sm },
  title: { ...typography.headline, fontSize: 13 },
  sub: { ...typography.caption, fontSize: 11, flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.xs },
  action: { minWidth: 40 },
});
