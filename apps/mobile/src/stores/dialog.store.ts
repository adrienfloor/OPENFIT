import { create } from 'zustand';

export interface DialogButton {
  text: string;
  /** Visual emphasis — danger renders in red, default in accent. */
  style?: 'default' | 'cancel' | 'destructive';
  /** Optional handler. The dialog auto-dismisses after this runs. */
  onPress?: () => void | Promise<void>;
}

interface DialogState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: DialogButton[];
  open: (input: { title: string; message?: string; buttons?: DialogButton[] }) => void;
  dismiss: () => void;
}

const DEFAULT_BUTTONS: DialogButton[] = [{ text: 'OK' }];

/**
 * Themed alternative to React Native's Alert.alert. The native dialog is
 * locked to the system light theme on Android, so we render our own modal
 * via DialogHost mounted at the app root and drive it through this store.
 *
 * Use the `dialog` helper exported from `services/dialog.ts` rather than
 * touching the store directly — that keeps call sites short and matches
 * Alert.alert's signature.
 */
export const useDialogStore = create<DialogState>((set) => ({
  visible: false,
  title: '',
  message: undefined,
  buttons: DEFAULT_BUTTONS,
  open: ({ title, message, buttons }) =>
    set({
      visible: true,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : DEFAULT_BUTTONS,
    }),
  dismiss: () => set({ visible: false }),
}));
