import { useFonts } from 'expo-font';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/common/Header';
import { SliderControl } from '@/components/common/SliderControl';
import { OptionSheet } from '@/components/settings/OptionSheet';
import { SettingRow, SettingSection, SettingToggle } from '@/components/settings/SettingRow';
import { labelOf, RATIO_OPTIONS, TIMER_OPTIONS } from '@/constants/camera';
import { FILTERS, getFilter } from '@/constants/filters';
import { colors, spacing, typography } from '@/constants/theme';
import { DATE_STAMP_FONT } from '@/render/DateStampLayer';
import { requestLocationAccess } from '@/services/location';
import { useCameraStore } from '@/stores/cameraStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { DATE_FORMATS, formatDateStamp } from '@/utils/dateStamp';
import { permissionDenied } from '@/utils/dialogs';

type Sheet = 'timer' | 'dateFormat' | 'filter' | 'ratio' | 'intensity' | null;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const s = useSettingsStore();
  const grid = useCameraStore((c) => c.grid);
  const timer = useCameraStore((c) => c.timer);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [fontsLoaded] = useFonts({ DSEG7: DATE_STAMP_FONT });
  const close = () => setSheet(null);

  const toggleLocation = async (next: boolean) => {
    if (!next) return s.set('saveLocation', false);
    const access = await requestLocationAccess();
    if (access === 'granted') return s.set('saveLocation', true);
    permissionDenied('위치 권한이 필요해요', '사진에 촬영 위치를 기록하려면 설정에서 위치 접근을 허용해 주세요.');
  };

  const [now] = useState(() => Date.now());

  return (
    <View style={styles.root}>
      <Header title="설정" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}>
        <SettingSection title="촬영 설정">
          <SettingToggle
            icon="volume-mute-outline"
            label="무음 모드"
            caption="Lumi 효과음을 꺼요. 시스템 셔터음은 기기·지역 정책을 따라요."
            enabled={s.silentMode}
            onChange={(v) => s.set('silentMode', v)}
          />
          <SettingToggle
            icon="grid-outline"
            label="격자 표시"
            enabled={grid}
            onChange={(v) => useCameraStore.getState().setGrid(v)}
          />
          <SettingRow
            icon="timer-outline"
            label="타이머"
            value={labelOf(TIMER_OPTIONS, timer) === 'Off' ? '끔' : labelOf(TIMER_OPTIONS, timer)}
            onPress={() => setSheet('timer')}
          />
          <SettingToggle
            icon="person-outline"
            label="거울 모드 (전면 카메라)"
            caption="셀피를 보이는 그대로 저장해요"
            enabled={s.mirrorFront}
            onChange={(v) => s.set('mirrorFront', v)}
          />
          <SettingToggle
            icon="location-outline"
            label="위치 정보 저장"
            enabled={s.saveLocation}
            onChange={(v) => void toggleLocation(v)}
          />
          <SettingToggle
            icon="calendar-outline"
            label="촬영 날짜 표시"
            enabled={s.dateStamp}
            onChange={(v) => s.set('dateStamp', v)}
          />
          {s.dateStamp ? (
            <SettingRow
              icon="text-outline"
              label="날짜 표기 형식"
              value={formatDateStamp(now, s.dateFormat)}
              onPress={() => setSheet('dateFormat')}
            />
          ) : null}
          <SettingToggle
            icon="copy-outline"
            label="원본 사진 함께 저장"
            caption="촬영한 사진의 필터 적용 전 원본을 ‘Lumi Originals’에 저장해요"
            enabled={s.saveOriginal}
            onChange={(v) => s.set('saveOriginal', v)}
          />
          <SettingToggle
            icon="diamond-outline"
            label="고화질 저장"
            caption={s.highQuality ? '최대 4096px · JPEG 95%' : '최대 2048px · JPEG 85%'}
            enabled={s.highQuality}
            onChange={(v) => s.set('highQuality', v)}
            last
          />
        </SettingSection>

        <SettingSection title="사진 편집 설정">
          <SettingRow
            icon="color-filter-outline"
            label="기본 필터"
            value={getFilter(s.defaultFilterId).name}
            onPress={() => setSheet('filter')}
          />
          <SettingRow
            icon="contrast-outline"
            label="기본 필터 강도"
            value={`${s.defaultIntensity}`}
            onPress={() => setSheet('intensity')}
          />
          <SettingRow
            icon="crop-outline"
            label="촬영 비율 기본값"
            value={labelOf(RATIO_OPTIONS, s.defaultRatio)}
            onPress={() => setSheet('ratio')}
            last
          />
        </SettingSection>

        <SettingSection title="필터">
          <SettingRow icon="apps-outline" label="필터 둘러보기" onPress={() => router.push('/filters')} />
          <SettingRow icon="heart-outline" label="즐겨찾기 필터" onPress={() => router.push('/favorites')} last />
        </SettingSection>

        <Text style={styles.footer}>Lumi · Capture · Edit · Keep</Text>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'timer'}
        title="타이머"
        options={TIMER_OPTIONS.map((o) => ({ value: o.value, label: o.value ? `${o.value}초` : '끔' }))}
        value={timer}
        onSelect={(v) => useCameraStore.getState().setTimer(v)}
        onClose={close}
      />
      <OptionSheet
        visible={sheet === 'dateFormat'}
        title="날짜 표기 형식"
        options={DATE_FORMATS.map((f) => ({
          value: f.id,
          label: f.label,
          render: (
            <View style={styles.stampPreview}>
              <Text style={[styles.stampText, fontsLoaded && styles.stampFont]}>{formatDateStamp(now, f.id)}</Text>
              <Text style={styles.stampLabel}>{f.label}</Text>
            </View>
          ),
        }))}
        value={s.dateFormat}
        onSelect={(v) => s.set('dateFormat', v)}
        onClose={close}
      />
      <OptionSheet
        visible={sheet === 'filter'}
        title="기본 필터"
        options={FILTERS.map((f) => ({ value: f.id, label: f.name, caption: f.description }))}
        value={s.defaultFilterId}
        onSelect={(v) => {
          s.set('defaultFilterId', v);
          // Apply right away in the camera too.
          useCameraStore.getState().setFilter(v);
        }}
        onClose={close}
      />
      <OptionSheet
        visible={sheet === 'ratio'}
        title="촬영 비율 기본값"
        options={RATIO_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'original' ? 'Full (센서 원본)' : o.label }))}
        value={s.defaultRatio}
        onSelect={(v) => {
          s.set('defaultRatio', v);
          useCameraStore.getState().setRatio(v);
        }}
        onClose={close}
      />
      <OptionSheet
        visible={sheet === 'intensity'}
        title="기본 필터 강도"
        options={[]}
        value={0}
        onSelect={() => undefined}
        onClose={close}
        footer={
          <View style={styles.intensity}>
            <Text style={styles.intensityHint}>새 사진에 필터를 적용할 때의 시작 강도예요</Text>
            <SliderControl
              value={s.defaultIntensity}
              onChange={(v) => s.set('defaultIntensity', v)}
              resetValue={80}
              accessibilityLabel="기본 필터 강도"
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  footer: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  stampPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stampText: {
    fontSize: 16,
    color: colors.dateStamp,
    minWidth: 120,
  },
  stampFont: {
    fontFamily: 'DSEG7',
  },
  stampLabel: {
    ...typography.caption,
  },
  intensity: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  intensityHint: {
    ...typography.caption,
    textAlign: 'center',
  },
});
