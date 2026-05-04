/**
 * Apply app-wide default styles for `<Text>` and `<TextInput>`.
 *
 * Without these defaults a Text or TextInput with no explicit `color` shows
 * up as black — invisible against the dark surface palette. We patch
 * `defaultProps.style` so any explicit `style={…}` on a component still
 * wins (RN merges arrays left-to-right; our default sits at index 0 and
 * the component's own style at index 1+).
 *
 * This must run once before the first render; importing it for its side
 * effect at the top of the root layout is sufficient.
 */

import { Text, TextInput } from 'react-native';
import { colors } from './index';

type WithDefaults<T> = T & {
  defaultProps?: {
    style?: unknown;
    placeholderTextColor?: string;
    selectionColor?: string;
    cursorColor?: string;
  };
};

const TextWithDefaults = Text as unknown as WithDefaults<typeof Text>;
const InputWithDefaults = TextInput as unknown as WithDefaults<typeof TextInput>;

TextWithDefaults.defaultProps = {
  ...(TextWithDefaults.defaultProps ?? {}),
  style: [{ color: colors.text }, TextWithDefaults.defaultProps?.style],
};

InputWithDefaults.defaultProps = {
  ...(InputWithDefaults.defaultProps ?? {}),
  // Inputs default to text color matching the page; placeholderTextColor
  // is a separate prop, set globally here too.
  placeholderTextColor: colors.textMuted,
  // Cursor + selection: Android otherwise picks the theme's colorAccent,
  // which on Samsung One UI tints the field background green when text
  // is selected or autofill is suggested. Pin to a muted dim so the
  // selection feels like a polished neutral handle, not a brand color
  // bleed.
  selectionColor: 'rgba(245, 245, 247, 0.25)',
  cursorColor: colors.text,
  style: [{ color: colors.text }, InputWithDefaults.defaultProps?.style],
};
