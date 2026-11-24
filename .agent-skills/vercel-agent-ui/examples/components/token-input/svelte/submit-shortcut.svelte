<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    toLabel,
    TokenInput,
    TokenInputEditor,
  } from "@ui-sdk/svelte/token-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Field>
  <FieldLabel>Message</FieldLabel>
  <TokenInput
    submitShortcut="mod+enter"
    onSubmit={(value) => log(`Sent ${toLabel(value)}`)}
  >
    <TokenInputEditor placeholder="Write a message…" />
  </TokenInput>
</Field>
