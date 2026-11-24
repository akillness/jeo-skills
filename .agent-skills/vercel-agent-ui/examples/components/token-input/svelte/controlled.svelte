<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    toText,
    TokenInput,
    TokenInputEditor,
    type TokenInputValue,
  } from "@ui-sdk/svelte/token-input"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuItem,
    TriggerMenuList,
  } from "@ui-sdk/svelte/trigger-menu"
  import { useLog } from "../../../shared/svelte/log"

  const files = [
    { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
    { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
    { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
    { value: "README.md", label: "README.md" },
    { value: "package.json", label: "package.json" },
  ]

  const draft: TokenInputValue = [
    "Explain ",
    { type: "file", value: "src/routes.ts", label: "routes.ts" },
    " in two sentences.",
  ]

  const log = useLog()
  let value = $state<TokenInputValue>(draft)
</script>

<Field>
  <FieldLabel>Prompt</FieldLabel>
  <TokenInput
    bind:value
    onValueChange={(next, details) => {
      const removed = details.removed.map((token) => token.label).join(", ")
      log(
        `${toText(next)} (${details.reason}${removed ? `, removed ${removed}` : ""})`
      )
    }}
    history={{ limit: 50, groupDelay: 1000 }}
    getTokenDescription={(token) =>
      token.type === "file" ? "attached file" : token.type}
  >
    <TokenInputEditor />
    <TriggerMenu triggers={[{ char: "@", type: "file", items: files }]}>
      <TriggerMenuContent>
        <TriggerMenuList>
          {#snippet children(state)}
            {#each state.items as TriggerMenuDataItem[] as item (item.value)}
              <TriggerMenuItem value={item.value} label={item.label}>
                {item.label}
              </TriggerMenuItem>
            {/each}
          {/snippet}
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  </TokenInput>
</Field>
