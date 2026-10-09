import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { normalizeHex } from '@/image-engine/frame/skiaKit';

import { hexToHsv, hsvToHex } from '../model/color';

interface Props {
  visible: boolean;
  initial: string;
  onClose: () => void;
  /** Live preview while sliding. */
  onPreview: (hex: string) => void;
  onConfirm: (hex: string) => void;
}

/** Custom colour: hue / saturation / brightness sliders and a HEX field. */
export function ColorPickerSheet(props: Props) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} title="프레임 색 직접 선택">
      {/* Mounted per opening, so it starts from the current colour each time. */}
      {props.visible ? <PickerBody {...props} /> : null}
    </BottomSheet>
  );
}

function PickerBody({ initial, onClose, onPreview, onConfirm }: Props) {
  const [hsv, setHsv] = useState(() => hexToHsv(initial));
  const [hex, setHex] = useState(initial.toUpperCase());

  const fromHsv = (next: typeof hsv) => {
    setHsv(next);
    const h = hsvToHex(next.h, next.s, next.v);
    setHex(h);
    onPreview(h);
  };
  const valid = normalizeHex(hex);

  return (
    <>
      <View style={styles.top}>
        <View style={[styles.swatch, { backgroundColor: valid ?? '#FFFFFF' }]} />
        <TextInput
          value={hex}
          onChangeText={(t) => {
            setHex(t);
            const n = normalizeHex(t);
            if (n) {
              setHsv(hexToHsv(n));
              onPreview(n);
            }
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={[styles.input, !valid && styles.invalid]}
          accessibilityLabel="HEX 색상 코드"
          placeholder="#F1E4C8"
        />
      </View>
      <View style={styles.sliders}>
        <Text style={styles.label}>색상</Text>
        <SliderControl value={hsv.h} max={360} onChange={(h) => fromHsv({ ...hsv, h })} accessibilityLabel="색상" />
        <Text style={styles.label}>채도</Text>
        <SliderControl value={hsv.s} onChange={(s) => fromHsv({ ...hsv, s })} accessibilityLabel="채도" />
        <Text style={styles.label}>밝기</Text>
        <SliderControl value={hsv.v} onChange={(v) => fromHsv({ ...hsv, v })} accessibilityLabel="밝기" />
      </View>
      <PressableScale
        style={[styles.button, !valid && styles.disabled]}
        disabled={!valid}
        onPress={() => {
          if (valid) onConfirm(valid);
          onClose();
        }}
        accessibilityRole="button"
        accessibilityLabel="색 적용"
      >
        <Text style={styles.buttonText}>적용</Text>
      </PressableScale>
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  swatch: { width: 44, height: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' },
  input: {
    flex: 1,
    ...typography.body,
    fontVariant: ['tabular-nums'],
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  invalid: { color: colors.danger },
  sliders: { gap: 2, marginBottom: spacing.lg },
  label: { ...typography.caption },
  button: { minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  buttonText: { ...typography.headline, color: colors.white },
});
