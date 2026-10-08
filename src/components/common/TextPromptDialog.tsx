import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import { colors, radius, spacing, typography } from "@/constants/theme";

import { PressableScale } from "./PressableScale";

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmText: string;
  maxLength?: number;
  /** Return false to keep the dialog open. */
  onSubmit: (value: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}

/** Small centred dialog with one text field (Alert.prompt is iOS-only and absent on web). */
export function TextPromptDialog(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="none"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      {/* Mounted per opening, so the field starts from `initialValue` each time. */}
      {props.visible ? <DialogBody {...props} /> : null}
    </Modal>
  );
}

function DialogBody({
  title,
  message,
  initialValue = "",
  placeholder,
  confirmText,
  maxLength = 24,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  const trimmed = value.trim();
  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const keep = (await onSubmit(trimmed)) === false;
      if (!keep) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(120)}
        style={styles.backdrop}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="닫기"
        />
      </Animated.View>
      <Animated.View
        entering={ZoomIn.duration(180)}
        style={styles.card}
        accessibilityViewIsModal
      >
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          maxLength={maxLength}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          style={styles.input}
          accessibilityLabel={title}
        />
        <Text style={styles.count}>
          {value.length}/{maxLength}
        </Text>
        <View style={styles.actions}>
          <PressableScale
            style={styles.button}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.cancel}>취소</Text>
          </PressableScale>
          <PressableScale
            style={[
              styles.button,
              styles.primary,
              (!trimmed || busy) && styles.disabled,
            ]}
            onPress={() => void submit()}
            disabled={!trimmed || busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{confirmText}</Text>
          </PressableScale>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(28, 26, 24, 0.32)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    textAlign: "center",
  },
  message: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  input: {
    ...typography.body,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  count: {
    ...typography.micro,
    alignSelf: "flex-end",
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  primary: {
    backgroundColor: colors.text,
  },
  disabled: {
    opacity: 0.4,
  },
  cancel: {
    ...typography.headline,
    color: colors.textSecondary,
  },
  primaryText: {
    ...typography.headline,
    color: colors.white,
  },
});
