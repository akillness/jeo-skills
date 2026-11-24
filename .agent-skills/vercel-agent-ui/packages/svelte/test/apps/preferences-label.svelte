<script lang="ts">
  import type { PreferenceLike } from "@ui-sdk/core"
  import { usePreference } from "../../src/preferences"

  let { preference }: { preference: PreferenceLike } = $props()
  // svelte-ignore state_referenced_locally
  const state = usePreference(preference)
</script>

<p>{`Tone: ${state.current.value}`}</p>
