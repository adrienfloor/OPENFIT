import { useDialogStore, type DialogButton } from '../stores/dialog.store';

/**
 * Drop-in themed replacement for `Alert.alert`. Mirrors the native API
 * (title + optional message + optional buttons) so call sites barely
 * change. Renders through DialogHost mounted at the app root.
 *
 *   dialog.alert('Saved', 'Your profile has been updated.');
 *   dialog.alert('Discard run?', 'This cannot be undone.', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Discard', style: 'destructive', onPress: handleDiscard },
 *   ]);
 */
export const dialog = {
  alert(title: string, message?: string, buttons?: DialogButton[]): void {
    useDialogStore.getState().open({ title, message, buttons });
  },
};
