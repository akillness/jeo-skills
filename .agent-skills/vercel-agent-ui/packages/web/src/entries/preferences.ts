// Importing this defines <ui-preferences>. On the server it does nothing.
import { definePreferencesElements } from "../preferences"

definePreferencesElements()

export {
  createColorScheme,
  createPreference,
  preferencesScript,
} from "@ui-sdk/core"
export type {
  ColorScheme,
  Preference,
  PreferenceLike,
  PreferenceOptions,
} from "@ui-sdk/core"
export type { UiPreferencesElement } from "../events"
