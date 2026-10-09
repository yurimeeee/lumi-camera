import { View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { OptionChips } from '@/components/common/OptionChips';
import { FILTERS } from '@/constants/filters';

import { updateLayer } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import { StudioSlider } from './controls';

/** Filter for one photo slot (the editor's filters, rendered by the same shader). */
export function FilterSheet({ layerId, onClose }: { layerId: string | null; onClose: () => void }) {
  const layer = useStudioStore((s) => s.doc?.layers.find((l) => l.id === layerId));
  const look = layer?.kind === 'photo' ? layer.look : null;
  return (
    <BottomSheet visible={!!layerId && !!look} onClose={onClose} title="사진 필터">
      {look && layerId ? (
        <View style={{ gap: 12, marginHorizontal: -20 }}>
          <OptionChips
            options={FILTERS.map((f) => ({ value: f.id, label: f.name }))}
            value={look.filterId}
            onChange={(filterId) => useStudioStore.getState().apply((d) => updateLayer(d, layerId, { look: { ...look, filterId } }))}
            accessibilityLabel="필터"
          />
          <StudioSlider
            label="강도"
            value={look.intensity}
            reset={100}
            onChange={(intensity) => useStudioStore.getState().live((d) => updateLayer(d, layerId, { look: { ...look, intensity } }))}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}
