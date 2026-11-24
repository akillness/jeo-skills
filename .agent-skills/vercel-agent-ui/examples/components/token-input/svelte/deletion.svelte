<script lang="ts">
  import { CheckIcon, ChevronDownIcon, FileIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import {
    TokenInput,
    TokenInputEditor,
    TokenInputToken,
    type TokenDeletion,
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

  const modes = [
    { value: "whole", label: "Whole" },
    { value: "select", label: "Select" },
    { value: "revert", label: "Revert" },
  ]

  const files = [
    { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
    { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
    { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
    { value: "README.md", label: "README.md" },
    { value: "package.json", label: "package.json" },
  ]

  const draft: TokenInputValue = [
    "Explain ",
    {
      type: "file",
      value: "src/routes.ts",
      label: "routes.ts",
      data: { trigger: "@" },
    },
    " in two sentences.",
  ]

  const log = useLog()
  let deletion = $state<TokenDeletion>("whole")
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select
      items={modes}
      value={deletion}
      onValueChange={(next) => next && (deletion = next as TokenDeletion)}
    >
      <SelectLabel>Backspace</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        {#each modes as mode (mode.value)}
          <SelectItem value={mode.value}>
            {mode.label}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  <Field>
    <FieldLabel>Prompt</FieldLabel>
    <TokenInput
      tokenDeletion={deletion}
      defaultValue={draft}
      onValueChange={(value, details) => {
        for (const token of details.removed) {
          log(`Removed ${token.label} (${deletion})`)
        }
      }}
    >
      {#snippet token(token)}
        <TokenInputToken>
          <FileIcon aria-hidden="true" />
          {token.label}
        </TokenInputToken>
      {/snippet}
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
</div>
