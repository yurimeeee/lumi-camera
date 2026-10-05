import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import type { IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { FLASH_OPTIONS, labelOf, nextOf, RATIO_OPTIONS, TIMER_OPTIONS } from '@/constants/camera';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useCameraStore, useCaptureRatio } from '@/stores/cameraStore';

function Control({
  icon,
  title,
  value,
  onPress,
  active,
}: {
  icon: IconName;
  title: string;
  value: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <PressableScale
      style={styles.control}
      onPress={() => {
        feedback.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${value}`}
    >
      <Ionicons name={icon} size={22} color={active ? colors.accentSoft : colors.white} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </PressableScale>
  );
}

/** Floating dark panel with the five quick capture options. */
export function QuickControls() {
  const flash = useCameraStore((s) => s.flash);
  const timer = useCameraStore((s) => s.timer);
  const grid = useCameraStore((s) => s.grid);
  const skin = useCameraStore((s) => s.skin);
  const ratio = useCaptureRatio();
  const { setFlash, setTimer, setGrid, setRatio, setSkin } = useCameraStore.getState();
  const [skinOpen, setSkinOpen] = useState(false);

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(160)}
      layout={LinearTransition.duration(200)}
      style={styles.panel}
    >
      <View style={styles.row}>
        <Control
          icon={FLASH_OPTIONS.find((o) => o.value === flash)!.icon}
          title="Flash"
          value={labelOf(FLASH_OPTIONS, flash)}
          onPress={() => setFlash(nextOf(FLASH_OPTIONS, flash))}
        />
        <Control
          icon="timer-outline"
          title="Timer"
          value={labelOf(TIMER_OPTIONS, timer)}
          onPress={() => setTimer(nextOf(TIMER_OPTIONS, timer))}
          active={timer > 0}
        />
        <Control icon="grid-outline" title="Grid" value={grid ? 'On' : 'Off'} onPress={() => setGrid(!grid)} />
        <Control
          icon="crop-outline"
          title="Ratio"
          value={labelOf(RATIO_OPTIONS, ratio)}
          onPress={() => setRatio(nextOf(RATIO_OPTIONS, ratio))}
        />
        <Control
          icon="happy-outline"
          title="Skin"
          value={String(skin)}
          onPress={() => setSkinOpen((v) => !v)}
          active={skinOpen}
        />
      </View>
      {skinOpen ? (
        <Animated.View entering={FadeInUp.duration(180)} style={styles.skin}>
          <Text style={styles.skinLabel}>피부 보정</Text>
          <View style={styles.skinSlider}>
            <SliderControl
              value={skin}
              onChange={setSkin}
              tone="dark"
              resetValue={20}
              accessibilityLabel="피부 보정 강도"
            />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(28, 26, 24, 0.78)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  control: {
    minWidth: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    ...typography.micro,
    color: colors.white,
    marginTop: 4,
  },
  value: {
    ...typography.micro,
    color: colors.whiteMuted,
  },
  skin: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  skinLabel: {
    ...typography.caption,
    color: colors.whiteSoft,
  },
  skinSlider: {
    flex: 1,
  },
});
