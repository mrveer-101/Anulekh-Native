/**
 * inAppAlert.ts — Centralized In-App Alert System for Anulekh.
 *
 * Eliminates browser-native window.alert() prompts ("domain says...") across web & mobile,
 * replacing them with a polished, accessible in-app alert dialog block.
 */
import { Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export type AlertVariant = 'warning' | 'error' | 'info' | 'success' | 'lock';

export interface InAppAlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  icon?: string;
  variant?: AlertVariant;
  accentColor?: string;
}

type AlertListener = (state: InAppAlertState) => void;

let currentAlertState: InAppAlertState = {
  visible: false,
  title: '',
};

const listeners = new Set<AlertListener>();

export function subscribeInAppAlert(listener: AlertListener): () => void {
  listeners.add(listener);
  listener(currentAlertState);
  return () => {
    listeners.delete(listener);
  };
}

export function closeInAppAlert(): void {
  currentAlertState = {
    ...currentAlertState,
    visible: false,
  };
  listeners.forEach((listener) => listener(currentAlertState));
}

/**
 * Dispatches an in-app alert block.
 * Supports both object options or standard Alert.alert(title, message, buttons) signatures.
 */
export function showInAppAlert(
  optionsOrTitle:
    | string
    | {
        title: string;
        message?: string;
        buttons?: AlertButton[];
        icon?: string;
        variant?: AlertVariant;
        accentColor?: string;
      },
  message?: string,
  buttons?: AlertButton[],
  variant?: AlertVariant
): void {
  if (typeof optionsOrTitle === 'object') {
    currentAlertState = {
      visible: true,
      title: optionsOrTitle.title || 'Alert',
      message: optionsOrTitle.message,
      buttons: optionsOrTitle.buttons && optionsOrTitle.buttons.length > 0
        ? optionsOrTitle.buttons
        : [{ text: 'OK', onPress: closeInAppAlert }],
      icon: optionsOrTitle.icon || detectIcon(optionsOrTitle.title, optionsOrTitle.variant),
      variant: optionsOrTitle.variant || detectVariant(optionsOrTitle.title),
      accentColor: optionsOrTitle.accentColor,
    };
  } else {
    currentAlertState = {
      visible: true,
      title: optionsOrTitle || 'Alert',
      message,
      buttons: buttons && buttons.length > 0
        ? buttons
        : [{ text: 'OK', onPress: closeInAppAlert }],
      icon: detectIcon(optionsOrTitle, variant),
      variant: variant || detectVariant(optionsOrTitle),
    };
  }

  listeners.forEach((listener) => listener(currentAlertState));
}

function detectVariant(title: string = ''): AlertVariant {
  const lower = title.toLowerCase();
  if (lower.includes('lock') || lower.includes('restrict')) return 'lock';
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  if (lower.includes('success') || lower.includes('sent') || lower.includes('approved')) return 'success';
  if (lower.includes('warn') || lower.includes('attention')) return 'warning';
  return 'info';
}

function detectIcon(title: string = '', variant?: AlertVariant): string {
  const lower = title.toLowerCase();
  if (lower.includes('call') && (lower.includes('lock') || lower.includes('restrict') || lower.includes('disable'))) {
    return 'phone-off';
  }
  if (lower.includes('lock')) return 'lock';
  if (lower.includes('phone')) return 'phone';
  if (lower.includes('mic')) return 'mic-off';
  if (lower.includes('download')) return 'download';
  if (variant === 'error' || lower.includes('error') || lower.includes('fail')) return 'alert-circle';
  if (variant === 'success' || lower.includes('success')) return 'check-circle';
  if (variant === 'warning') return 'alert-triangle';
  return 'info';
}
