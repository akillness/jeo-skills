import {
  createTokenInputController,
  toText,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
  type TokenInputValue,
} from "@ui-sdk/solid/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuHint,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/solid/trigger-menu"
import { createSignal, For, onCleanup, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

const loadFile = () => new Promise<void>((resolve) => setTimeout(resolve, 800))

function Example() {
  const log = useLog()
  const prompt = createTokenInputController()
  const [running, setRunning] = createSignal(false)
  let sendTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => clearTimeout(sendTimer))

  function send(value: TokenInputValue) {
    if (running() || !prompt.getLabel().trim()) {
      return
    }
    setRunning(true)
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
      setRunning(false)
    }, 1500)
  }

  return (
    <TokenInput
      controller={prompt}
      onSubmit={send}
      renderToken={(token) => (
        <TokenInputToken>
          <Show
            when={token.type === "skill"}
            fallback={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
              </svg>
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m16 18 6-6-6-6" />
              <path d="m8 6-6 6 6 6" />
            </svg>
          </Show>
          {token.type === "skill" ? `/${token.label}` : token.label}
          <Show when={token.data?.run === "running"}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </Show>
          <Show when={token.data?.run === "done"}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </Show>
          <TokenInputTokenRemove>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </TokenInputTokenRemove>
        </TokenInputToken>
      )}
    >
      <div data-slot="card">
        <TokenInputEditor
          aria-label="Prompt"
          placeholder="Ask anything. Type @ or /"
        />
        <div data-slot="row">
          <button
            type="button"
            data-size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              prompt.insert(
                { type: "file", value: "README.md", label: "README.md" },
                { resolve: loadFile() }
              )
            }
          >
            Attach README
          </button>
          <button
            type="button"
            data-variant="solid"
            data-size="sm"
            data-shape="round"
            onClick={() => send(prompt.getValue())}
            aria-label={running() ? "Running" : "Send"}
            disabled={running()}
          >
            <Show
              when={running()}
              fallback={
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </Show>
          </button>
        </div>
      </div>
      <TriggerMenu
        triggers={[
          { char: "@", type: "file", items: files },
          { char: "/", boundary: "start", type: "skill", items: skills },
        ]}
        onSelect={(value, details) =>
          details.trigger === "@" ? loadFile() : undefined
        }
      >
        <TriggerMenuHint />
        <TriggerMenuContent>
          <TriggerMenuEmpty>No matches</TriggerMenuEmpty>
          <TriggerMenuList>
            {(state) => (
              <For each={state.items as TriggerMenuDataItem[]}>
                {(item) => (
                  <TriggerMenuItem
                    value={item.value}
                    label={item.label}
                    disabled={item.disabled}
                  >
                    {item.label}
                  </TriggerMenuItem>
                )}
              </For>
            )}
          </TriggerMenuList>
        </TriggerMenuContent>
      </TriggerMenu>
    </TokenInput>
  )
}

export { Example }
