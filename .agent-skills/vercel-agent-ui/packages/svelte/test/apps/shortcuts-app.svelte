<script lang="ts">
  import { useShortcut, useShortcutHint } from "../../src/shortcuts"

  let {
    keys = "mod+k",
    onPress,
  }: { keys?: string | null; onPress: () => void } = $props()

  useShortcut(
    () => keys,
    () => onPress()
  )
  const hint = useShortcutHint("mod+k")
</script>

<span aria-label="hint">{hint.text}</span>
<span aria-label="aria">{hint.ariaKeyshortcuts}</span>
