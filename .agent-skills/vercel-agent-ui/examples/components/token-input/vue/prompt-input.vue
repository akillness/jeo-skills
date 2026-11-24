<script setup lang="ts">
import {
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  FileIcon,
  XIcon,
} from "@lucide/vue"
import {
  createTokenInputController,
  toText,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
  type TokenInputValue,
} from "@ui-sdk/vue/token-input"
import {
  type TriggerMenuDataItem,
  type TriggerMenuSelectDetails,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuHint,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/vue/trigger-menu"
import { onBeforeUnmount, ref } from "vue"
import { useLog } from "../../../shared/vue/log"

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

const log = useLog()
const prompt = createTokenInputController()
const running = ref(false)
let sendTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => clearTimeout(sendTimer))

function send(value: TokenInputValue) {
  if (running.value || !prompt.getLabel().trim()) {
    return
  }
  running.value = true
  const skillTokens = value.filter(
    (segment) => typeof segment !== "string" && segment.type === "skill"
  )
  for (const skill of skillTokens) {
    if (typeof skill !== "string") {
      prompt.updateToken(skill.id!, { data: { ...skill.data, run: "running" } })
    }
  }
  sendTimer = setTimeout(() => {
    for (const skill of skillTokens) {
      if (typeof skill !== "string") {
        prompt.updateToken(skill.id!, { data: { ...skill.data, run: "done" } })
      }
    }
    log(`Sent ${toText(prompt.getValue())}`)
    prompt.clear()
    running.value = false
  }, 1500)
}

function onSelect(value: string, details: TriggerMenuSelectDetails<string>) {
  return details.trigger === "@" ? loadFile() : undefined
}

function attachReadme() {
  prompt.insert(
    { type: "file", value: "README.md", label: "README.md" },
    { resolve: loadFile() }
  )
}
</script>

<template>
  <TokenInput :controller="prompt" @submit="send">
    <div data-slot="card">
      <TokenInputEditor
        aria-label="Prompt"
        placeholder="Ask anything. Type @ or /"
      />
      <div data-slot="row">
        <button
          type="button"
          data-size="sm"
          @mousedown.prevent
          @click="attachReadme"
        >
          Attach README
        </button>
        <button
          type="button"
          data-variant="solid"
          data-size="sm"
          data-shape="round"
          :aria-label="running ? 'Running' : 'Send'"
          :disabled="running"
          @click="send(prompt.getValue())"
        >
          <ClockIcon v-if="running" aria-hidden="true" />
          <ArrowUpIcon v-else aria-hidden="true" />
        </button>
      </div>
    </div>
    <TriggerMenu
      :triggers="[
        { char: '@', type: 'file', items: files },
        { char: '/', boundary: 'start', type: 'skill', items: skills },
      ]"
      @select="onSelect"
    >
      <TriggerMenuHint />
      <TriggerMenuContent>
        <TriggerMenuEmpty>No matches</TriggerMenuEmpty>
        <TriggerMenuList v-slot="{ state }">
          <TriggerMenuItem
            v-for="item in state.items as TriggerMenuDataItem[]"
            :key="item.value"
            :value="item.value"
            :label="item.label"
            :disabled="item.disabled"
          >
            {{ item.label }}
          </TriggerMenuItem>
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
    <template #token="{ token }">
      <TokenInputToken>
        <CodeIcon v-if="token.type === 'skill'" aria-hidden="true" />
        <FileIcon v-else aria-hidden="true" />
        {{ token.type === "skill" ? `/${token.label}` : token.label }}
        <ClockIcon v-if="token.data?.run === 'running'" aria-hidden="true" />
        <CheckIcon v-if="token.data?.run === 'done'" aria-hidden="true" />
        <TokenInputTokenRemove>
          <XIcon aria-hidden="true" />
        </TokenInputTokenRemove>
      </TokenInputToken>
    </template>
  </TokenInput>
</template>
