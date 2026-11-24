<script lang="ts">
  import type { PreferenceLike } from "@ui-sdk/core"
  import { Preferences } from "../../src/preferences"
  import PreferencesLabel from "./preferences-label.svelte"

  let {
    preferences,
    label,
    nonce,
  }: {
    preferences: readonly PreferenceLike[]
    label: PreferenceLike
    nonce?: string
  } = $props()
</script>

<Preferences {preferences} {nonce}>
  <PreferencesLabel preference={label} />
</Preferences>
