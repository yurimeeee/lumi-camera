import type { SkTypeface } from '@shopify/react-native-skia';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { ExportMetadata } from '@/services/exportImage';
import { feedback } from '@/services/feedback';
import { frameSize } from '@/services/frameCoords';
import {
  CUSTOM_MIN,
  DEFAULT_PRO_EXPORT,
  deliver,
  exportCapabilities,
  outputLongSide,
  proExport,
  type ProDestination,
  type ProExportOptions,
  type ProFormat,
  type ProQuality,
  type ProResolution,
} from '@/services/proExport';
import { lookOf, useEditorStore } from '@/stores/editorStore';
import { useLastLookStore } from '@/stores/lastLookStore';
import { showToast } from '@/stores/toastStore';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

/**
 * 상세 저장: format (JPEG / PNG / HEIC where the device can encode it),
 * quality, resolution, metadata and destination. Renders the full edit at
 * the chosen size with the export renderer — the same one quick save uses.
 */
export function ExportSheet({ visible, onClose, typeface, onSaved }: { visible: boolean; onClose: () => void; typeface: SkTypeface | null; onSaved: () => void }) {
  const source = useEditorStore((s) => s.source);
  const geometry = useEditorStore((s) => s.present.geometry);
  const [o, setO] = useState<ProExportOptions>(DEFAULT_PRO_EXPORT);
  const [busy, setBusy] = useState(false);
  const caps = exportCapabilities();
  const patch = (p: Partial<ProExportOptions>) => setO((x) => ({ ...x, ...p }));
  if (!source) return null;

  const frame = frameSize(source.width, source.height, geometry);
  const original = Math.round(Math.max(frame.width, frame.height));
  const long = outputLongSide(o, { width: frame.width, height: frame.height });
  const s = long / Math.max(frame.width, frame.height);
  const size = `${Math.round(frame.width * s)} × ${Math.round(frame.height * s)}`;

  const formats: { value: ProFormat; label: string }[] = [
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG' },
    ...(caps.heic ? [{ value: 'heic' as const, label: 'HEIC' }] : []),
  ];
  const destinations: { value: ProDestination; label: string }[] = [
    { value: 'photos', label: Platform.OS === 'web' ? '다운로드' : '사진' },
    { value: 'share', label: '공유' },
    ...(Platform.OS === 'web' ? [] : [{ value: 'files' as const, label: '파일' }]),
  ];

  const run = async () => {
    const { present } = useEditorStore.getState();
    setBusy(true);
    try {
      const r = await proExport(source, present, o, typeface);
      const result = await deliver(r, o.destination);
      if (!result.ok) {
        feedback.error();
        showToast(result.reason === 'permission' ? '사진 저장 권한이 필요해요' : (result.message ?? '저장하지 못했어요'));
        return;
      }
      useLastLookStore.getState().set(lookOf(present));
      feedback.success();
      showToast(o.destination === 'photos' ? `${r.width} × ${r.height} ${r.format.toUpperCase()}로 저장했어요` : '내보냈어요');
      onSaved();
      onClose();
    } catch (e) {
      feedback.error();
      showToast(e instanceof Error && /HEIC|인코딩|렌더링/.test(e.message) ? e.message : '저장 중 문제가 생겼어요');
      if (__DEV__) console.warn('[export]', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="상세 저장">
      <Row label="형식">
        <SegmentedControl options={formats} value={o.format} onChange={(format) => patch({ format })} accessibilityLabel="저장 형식" />
      </Row>
      {o.format !== 'png' ? (
        <Row label="품질">
          <SegmentedControl<ProQuality>
            options={[
              { value: 'standard', label: '표준' },
              { value: 'high', label: '높음' },
              { value: 'max', label: '최대' },
            ]}
            value={o.quality}
            onChange={(quality) => patch({ quality })}
            accessibilityLabel="저장 품질"
          />
        </Row>
      ) : null}
      <Row label="해상도">
        <SegmentedControl<ProResolution>
          options={[
            { value: 'original', label: '원본' },
            { value: '2048', label: '2048' },
            { value: '4096', label: '4096' },
            { value: 'custom', label: '직접' },
          ]}
          value={o.resolution}
          onChange={(resolution) => patch({ resolution, customSide: Math.min(o.customSide, original) })}
          accessibilityLabel="해상도"
        />
      </Row>
      {o.resolution === 'custom' ? (
        <Row label="긴 변">
          <SliderControl
            value={Math.min(o.customSide, original)}
            min={CUSTOM_MIN}
            max={Math.max(CUSTOM_MIN + 1, original)}
            onChange={(customSide) => patch({ customSide })}
            resetValue={original}
            accessibilityLabel="긴 변 픽셀"
          />
        </Row>
      ) : null}
      {o.format !== 'png' ? (
      <Row label="메타데이터">
        <SegmentedControl<ExportMetadata>
          options={[
            { value: 'keep', label: '유지' },
            { value: 'noLocation', label: '위치 제거' },
            { value: 'none', label: '모두 제거' },
          ]}
          value={o.metadata}
          onChange={(metadata) => patch({ metadata })}
          accessibilityLabel="메타데이터"
        />
      </Row>
      ) : null}
      <Row label="저장 위치">
        <SegmentedControl options={destinations} value={o.destination} onChange={(destination) => patch({ destination })} accessibilityLabel="저장 위치" />
      </Row>
      <Text style={styles.summary}>
        {size} · {o.format.toUpperCase()}
        {o.format === 'png' ? ' · 메타데이터 없음' : ''}
      </Text>
      {o.resolution !== 'original' && long === original && original < Number(o.resolution === 'custom' ? o.customSide : o.resolution) ? (
        <Text style={styles.note}>가져온 사진({original}px)보다 크게 키우지 않아요</Text>
      ) : null}
      <PressableScale style={[styles.primary, busy && styles.busy]} onPress={run} disabled={busy} accessibilityRole="button" accessibilityLabel="상세 옵션으로 저장">
        {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.primaryText}>저장</Text>}
      </PressableScale>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  label: { ...typography.caption, color: colors.text, width: 64 },
  summary: { ...typography.caption, textAlign: 'center', marginTop: spacing.sm },
  note: { ...typography.caption, fontSize: 11, color: colors.textTertiary, textAlign: 'center' },
  primary: { minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  busy: { opacity: 0.7 },
  primaryText: { ...typography.headline, fontSize: 15, color: colors.white },
});
