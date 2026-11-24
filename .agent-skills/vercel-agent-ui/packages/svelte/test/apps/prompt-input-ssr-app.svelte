<script lang="ts">
  import { TokenInput, TokenInputEditor } from "../../src/token-input"
  import { TriggerMenu, TriggerMenuInput } from "../../src/trigger-menu"

  let { input = false }: { input?: boolean } = $props()

  const value = ["Explain ", { type: "file", value: "src/a.ts", label: "a.ts" }]
  const triggers = [{ char: "@", items: [] }]
</script>

{#if input}
  <TokenInput defaultValue={value} name="prompt">
    <TokenInputEditor aria-label="Prompt" placeholder="Ask anything" />
    <TriggerMenu {triggers} />
  </TokenInput>
{:else}
  <TriggerMenu {triggers}>
    <TriggerMenuInput aria-label="Message" />
  </TriggerMenu>
{/if}
