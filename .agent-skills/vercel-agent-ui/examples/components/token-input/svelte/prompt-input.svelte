<script lang="ts">
  import {
    ArrowUpIcon,
    CheckIcon,
    ClockIcon,
    CodeIcon,
    FileIcon,
    XIcon,
  } from "@lucide/svelte"
  import {
    createTokenInputController,
    toText,
    TokenInput,
    TokenInputEditor,
    TokenInputToken,
    TokenInputTokenRemove,
    type TokenInputValue,
  } from "@ui-sdk/svelte/token-input"
  import {
    type TriggerMenuDataItem,
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuEmpty,
    TriggerMenuHint,
    TriggerMenuItem,
    TriggerMenuList,
  } from "@ui-sdk/svelte/trigger-menu"
  import { onDestroy } from "svelte"
  import { useLog } from "../../../shared/svelte/log"

  const files = [
    { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
    { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
    { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
    { value: "README.md", label: "README.md" },
    { value: "package.json", label: "package.json" },
  ]

  const skills = [
    {
      value: "search",
      label: "search",
      arguments: [{ name: "query", hint: "<query>", required: true }],
    },
    { value: "review", label: "review" },
    { value: "summarize", label: "summarize" },
  ]

  const loadFile = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 800))

  const log = useLog()
  const prompt = createTokenInputController()
  let running = $state(false)
  let sendTimer: ReturnType<typeof setTimeout> | undefined

  onDestroy(() => clearTimeout(sendTimer))

  function send(value: TokenInputValue) {
    if (running || !prompt.getLabel().trim()) {
      return
    }
    running = true
    const skillTokens = value.filter(
      (segment) => typeof segment !== "string" && segment.type === "skill"
    )
    for (const skill of skillTokens) {
      if (typeof skill !== "string") {
        prompt.updateToken(skill.id!, {
          data: { ...skill.data, run: "running" },
        })
      }
    }
    sendTimer = setTimeout(() => {
      for (const skill of skillTokens) {
        if (typeof skill !== "string") {
          prompt.updateToken(skill.id!, {
            data: { ...skill.data, run: "done" },
          })
        }
      }
      log(`Sent ${toText(prompt.getValue())}`)
      prompt.clear()
      running = false
    }, 1500)
  }
</script>

<TokenInput controller={prompt} onSubmit={send}>
  {#snippet token(token)}
    <TokenInputToken>
      {#if token.type === "skill"}
        <CodeIcon aria-hidden="true" />
      {:else}
        <FileIcon aria-hidden="true" />
      {/if}
      {token.type === "skill" ? `/${token.label}` : token.label}
      {#if token.data?.run === "running"}
        <ClockIcon aria-hidden="true" />
      {/if}
      {#if token.data?.run === "done"}
        <CheckIcon aria-hidden="true" />
      {/if}
      <TokenInputTokenRemove>
        <XIcon aria-hidden="true" />
      </TokenInputTokenRemove>
    </TokenInputToken>
  {/snippet}
  <div data-slot="card">
    <TokenInputEditor
      aria-label="Prompt"
      placeholder="Ask anything. Type @ or /"
    />
    <div data-slot="row">
      <button
        type="button"
        data-size="sm"
        onmousedown={(event) => event.preventDefault()}
        onclick={() =>
          prompt.insert(
            { type: "file", value: "README.md", label: "README.md" },
            { resolve: loadFile() }
          )}
      >
        Attach README
      </button>
      <button
        type="button"
        data-variant="solid"
        data-size="sm"
        data-shape="round"
        onclick={() => send(prompt.getValue())}
        aria-label={running ? "Running" : "Send"}
        disabled={running}
      >
        {#if running}
          <ClockIcon aria-hidden="true" />
        {:else}
          <ArrowUpIcon aria-hidden="true" />
        {/if}
      </button>
    </div>
  </div>
  <TriggerMenu
    triggers={[
      { char: "@", type: "file", items: files },
      { char: "/", boundary: "start", type: "skill", items: skills },
    ]}
    onSelect={(value, details) =>
      details.trigger === "@" ? loadFile() : undefined}
  >
    <TriggerMenuHint />
    <TriggerMenuContent>
      <TriggerMenuEmpty>No matches</TriggerMenuEmpty>
      <TriggerMenuList>
        {#snippet children(state)}
          {#each state.items as TriggerMenuDataItem[] as item (item.value)}
            <TriggerMenuItem
              value={item.value}
              label={item.label}
              disabled={item.disabled}
            >
              {item.label}
            </TriggerMenuItem>
          {/each}
        {/snippet}
      </TriggerMenuList>
    </TriggerMenuContent>
  </TriggerMenu>
</TokenInput>
