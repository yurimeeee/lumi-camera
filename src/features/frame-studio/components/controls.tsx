import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

import { photoLayers } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import type { PhotoLayer, StudioDocument } from '../types/document';

/** Small building blocks shared by the studio panels. */

/** Prints a frame / paper edit applies to: the selected print, or every print. */
export function targetPrints(doc: StudioDocument, selectedId: string | null | undefined): PhotoLayer[] {
  const prints = photoLayers(doc);
  const sel = prints.find((p) => p.id === selectedId);
  return sel ? [sel] : prints;
}

export function useTargetPrints(): { prints: PhotoLayer[]; ids: string[]; all: boolean } {
  const doc = useStudioStore((s) => s.doc);
  const selectedId = useStudioStore((s) => s.selection?.id);
  if (!doc) return { prints: [], ids: [], all: true };
  const prints = targetPrints(doc, selectedId);
  const all = !prints.some((p) => p.id === selectedId);
  return { prints, ids: prints.map((p) => p.id), all };
}

/** Labelled slider: live while dragging, one undo step on release. */
export function StudioSlider({
  label,
  value,
  min = 0,
  max = 100,
  reset,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  reset?: number;
  onChange: (v: number) => void;
}) {
  const commit = useStudioStore.getState().commit;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.flex}>
        <SliderControl value={Math.round(value)} min={min} max={max} onChange={onChange} onComplete={commit} resetValue={reset ?? (min < 0 ? 0 : min)} accessibilityLabel={label} />
      </View>
    </View>
  );
}

export function PanelScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
      {children}
    </ScrollView>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/** A thumbnail tile with a caption (frames, textures, decorations, layouts). */
export function Tile({
  label,
  selected,
  onPress,
  uri,
  source,
  width = 64,
  height = 80,
  children,
  accessibilityLabel,
  contentFit = 'contain',
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  uri?: string | null;
  source?: number;
  width?: number;
  height?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
  contentFit?: 'contain' | 'cover';
}) {
  return (
    <PressableScale
      onPress={() => {
        feedback.selection();
        onPress();
      }}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-checked={!!selected}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={[styles.tileBox, { width, height }, selected && styles.tileSelected]}>
        {uri || source !== undefined ? (
          <Image source={uri ? { uri } : source} style={{ width: width - 8, height: height - 8 }} contentFit={contentFit} transition={0} />
        ) : (
          children
        )}
      </View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected, { maxWidth: width + 8 }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
      {children}
    </ScrollView>
  );
}

/** Pill button used for panel actions. */
export function ActionPill({ label, onPress, icon, accessibilityLabel }: { label: string; onPress: () => void; icon?: ReactNode; accessibilityLabel?: string }) {
  return (
    <PressableScale style={styles.pill} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      {icon}
      <Text style={styles.pillText}>{label}</Text>
    </PressableScale>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { maxHeight: 200 },
  scrollContent: { gap: spacing.xs, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  rowLabel: { ...typography.caption, color: colors.text, width: 76 },
  hint: { ...typography.caption, fontSize: 11, color: colors.textTertiary, paddingHorizontal: spacing.xl },
  tiles: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  tile: { alignItems: 'center', gap: 4 },
  tileBox: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  tileSelected: { borderColor: colors.accent },
  tileLabel: { ...typography.filterName, fontSize: 10 },
  tileLabelSelected: { color: colors.text, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pillText: { ...typography.filterName, fontSize: 12, color: colors.text },
});
