import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  subscribeInAppAlert,
  closeInAppAlert,
  InAppAlertState,
  AlertButton,
  AlertVariant,
} from '@/core/inAppAlert';

interface InAppAlertBlockProps {
  visible?: boolean;
  title?: string;
  message?: string;
  buttons?: AlertButton[];
  icon?: string;
  variant?: AlertVariant;
  accentColor?: string;
  onClose?: () => void;
}

export function InAppAlertBlock(props: InAppAlertBlockProps) {
  const [globalState, setGlobalState] = useState<InAppAlertState>({
    visible: false,
    title: '',
  });

  // If no props are passed, listen to the global alert dispatcher
  const isGlobal = props.visible === undefined;

  useEffect(() => {
    if (isGlobal) {
      const unsubscribe = subscribeInAppAlert(setGlobalState);
      return unsubscribe;
    }
  }, [isGlobal]);

  const visible = isGlobal ? globalState.visible : props.visible;
  const title = isGlobal ? globalState.title : props.title;
  const message = isGlobal ? globalState.message : props.message;
  const buttons = isGlobal ? globalState.buttons : props.buttons;
  const icon = isGlobal ? globalState.icon : props.icon;
  const variant = isGlobal ? globalState.variant : props.variant;
  const accentColor = isGlobal ? globalState.accentColor : props.accentColor;

  if (!visible) return null;

  const handleDismiss = () => {
    if (isGlobal) {
      closeInAppAlert();
    } else if (props.onClose) {
      props.onClose();
    }
  };

  const activeVariant: AlertVariant = variant || 'info';

  // Theming based on variant
  const getVariantStyles = () => {
    switch (activeVariant) {
      case 'lock':
      case 'warning':
        return {
          iconBg: '#FFFBEB',
          iconBorder: '#FDE68A',
          iconColor: '#D97706',
          defaultIcon: 'phone-off',
          btnBg: accentColor || '#2563eb',
        };
      case 'error':
        return {
          iconBg: '#FEF2F2',
          iconBorder: '#FECACA',
          iconColor: '#DC2626',
          defaultIcon: 'alert-circle',
          btnBg: accentColor || '#DC2626',
        };
      case 'success':
        return {
          iconBg: '#ECFDF5',
          iconBorder: '#A7F3D0',
          iconColor: '#059669',
          defaultIcon: 'check-circle',
          btnBg: accentColor || '#059669',
        };
      case 'info':
      default:
        return {
          iconBg: '#EFF6FF',
          iconBorder: '#BFDBFE',
          iconColor: '#2563eb',
          defaultIcon: 'info',
          btnBg: accentColor || '#2563eb',
        };
    }
  };

  const vStyles = getVariantStyles();
  const iconName = (icon || vStyles.defaultIcon) as keyof typeof Feather.glyphMap;

  const effectiveButtons: AlertButton[] =
    buttons && buttons.length > 0
      ? buttons
      : [{ text: 'OK', onPress: handleDismiss }];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        {/* Backdrop tap */}
        <Pressable style={styles.backdrop} onPress={handleDismiss} />

        {/* In-App Alert Card Block */}
        <View style={styles.card} testID="in-app-alert-block">
          {/* Top-right subtle close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Close alert"
          >
            <Feather name="x" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: vStyles.iconBg, borderColor: vStyles.iconBorder },
            ]}
          >
            <Feather name={iconName} size={26} color={vStyles.iconColor} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {/* Action Buttons Row */}
          <View style={styles.buttonRow}>
            {effectiveButtons.map((btn, idx) => {
              const isCancel = btn.style === 'cancel' || btn.text?.toLowerCase() === 'cancel';
              const isPrimary = !isCancel && (idx === effectiveButtons.length - 1 || effectiveButtons.length === 1);

              return (
                <TouchableOpacity
                  key={`btn-${idx}`}
                  style={[
                    styles.button,
                    isCancel ? styles.cancelButton : [styles.primaryButton, { backgroundColor: vStyles.btnBg }],
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    handleDismiss();
                    if (btn.onPress) {
                      btn.onPress();
                    }
                  }}
                >
                  <Text
                    style={
                      isCancel ? styles.cancelButtonText : styles.primaryButtonText
                    }
                  >
                    {btn.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 9999999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Roboto',
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: -0.2,
  },
  message: {
    fontFamily: 'Roboto',
    fontSize: 14.5,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: {
    fontFamily: 'Roboto',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelButtonText: {
    fontFamily: 'Roboto',
    color: '#475569',
    fontSize: 15,
    fontWeight: '700',
  },
});
