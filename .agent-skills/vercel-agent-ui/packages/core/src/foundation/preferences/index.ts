// What the rest of core may import from preferences's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  colorSchemeOf,
  createColorScheme,
  type ColorScheme,
  type ColorSchemeOptions,
  type ColorSchemeState,
  type ColorSchemeStore,
  type ColorSchemeValue,
  type SystemColorScheme,
} from "./color-scheme"
export {
  createPreference,
  preferencesScript,
  type Preference,
  type PreferenceLike,
  type PreferenceOptions,
  type PreferenceStore,
} from "./preference"
