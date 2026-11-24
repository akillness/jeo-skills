// @vitest-environment jsdom
import { renderToString } from "@vue/server-renderer"
import { afterEach, expect, test } from "vitest"
import {
  createApp,
  createCommentVNode,
  createSSRApp,
  h,
  nextTick,
  ref,
  type App,
} from "vue"
import { DateInput, DateInputSegment } from "../src/date-input"
import { Field, FieldLabel } from "../src/field"
import { TimeInput } from "../src/time-input"

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

const segment = (root: ParentNode, type: string) =>
  root.querySelector<HTMLInputElement>(`input[data-type="${type}"]`)!

function mount(render: () => ReturnType<typeof h>) {
  const root = document.body.appendChild(document.createElement("div"))
  app = createApp(render)
  app.mount(root)
  return root
}

async function type(text: string) {
  for (const char of text) {
    document.activeElement!.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: char,
        bubbles: true,
        cancelable: true,
      })
    )
    await nextTick()
  }
}

test("the server renders each segment as an input with its value, and the hidden input", async () => {
  const server = document.createElement("div")
  server.innerHTML = await renderToString(
    createSSRApp(() =>
      h(DateInput, {
        defaultValue: "2026-11-02",
        name: "start",
        locale: "en-US",
      })
    )
  )
  expect(
    server.querySelectorAll('[role="group"] [role="spinbutton"]')
  ).toHaveLength(3)
  expect(segment(server, "month").getAttribute("value")).toBe("11")
  const hidden = server.querySelector<HTMLInputElement>('input[type="hidden"]')!
  expect([hidden.name, hidden.getAttribute("value")]).toEqual([
    "start",
    "2026-11-02",
  ])
})

test("v-model follows typing", async () => {
  const value = ref<string | null>(null)
  const root = mount(() =>
    h(TimeInput, {
      modelValue: value.value,
      "onUpdate:modelValue": (next: string | null) => (value.value = next),
      hourCycle: 24,
      locale: "en-US",
    })
  )
  await nextTick()
  segment(root, "hour").focus()
  await type("0945")
  expect(value.value).toBe("09:45")
  expect(segment(root, "minute").value).toBe("45")
})

test("a field's label names the group and focuses its first segment", async () => {
  const root = mount(() =>
    h(Field, null, () => [
      h(FieldLabel, null, () => "Start date"),
      h(DateInput, { locale: "en-US" }),
    ])
  )
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve))
  const group = root.querySelector('[role="group"]')!
  const label = root.querySelector("label")!
  expect(group.getAttribute("aria-labelledby")).toContain(label.id)
  label.click()
  expect(document.activeElement).toBe(segment(root, "month"))
})

test("the default slot can render the segments itself", async () => {
  const root = mount(() =>
    h(
      DateInput,
      { defaultValue: "2026-11-02", locale: "en-US" },
      {
        default: ({
          state,
        }: {
          state: { segments: { key: string; type: string }[] }
        }) =>
          state.segments.map((item) =>
            h(DateInputSegment, {
              key: item.key,
              segment: item,
              class: `segment-${item.type}`,
            })
          ),
      }
    )
  )
  await nextTick()
  expect(root.querySelector(".segment-month")).toBe(segment(root, "month"))
  expect(root.querySelector(".segment-literal")!.textContent).toBe("/")
})

test("slots that render nothing fall back to the segments and their text", async () => {
  const root = mount(() =>
    h(
      DateInput,
      { defaultValue: "2026-11-02", locale: "en-US" },
      { default: () => [createCommentVNode("v-if")] }
    )
  )
  await nextTick()
  expect(root.querySelectorAll('[role="spinbutton"]')).toHaveLength(3)
  const literal = mount(() =>
    h(
      DateInput,
      { defaultValue: "2026-11-02", locale: "en-US" },
      {
        default: ({ state }: { state: { segments: { key: string }[] } }) =>
          state.segments.map((item) =>
            h(DateInputSegment, { key: item.key, segment: item }, () => [
              createCommentVNode("v-if"),
            ])
          ),
      }
    )
  )
  await nextTick()
  expect(literal.querySelector('[data-type="literal"]')!.textContent).toBe("/")
})

test("the native readonly attribute keeps the date as it is", async () => {
  const root = mount(() =>
    h(DateInput, { defaultValue: "2026-11-02", locale: "en-US", readonly: "" })
  )
  await nextTick()
  segment(root, "month").focus()
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
  )
  await nextTick()
  expect(segment(root, "month").value).toBe("11")
})
