// @vitest-environment jsdom
// The recipe on the Popups page for composing a public component inside
// your own primitive: an emoji picker that owns `open` and renders a Popover.
import {
  createChange,
  definePrimitive,
  type ChangeDetails,
  type ChangeSource,
} from "@ui-sdk/core"
import type { PopoverOpenChangeReason } from "@ui-sdk/core/popover"
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, expect, test } from "vitest"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"
import { createParts, usePart, usePrimitive } from "../src/primitive"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeAll(() => {
  HTMLElement.prototype.showPopover ??= function () {}
  HTMLElement.prototype.hidePopover ??= function () {}
  Element.prototype.getAnimations ??= () => []
  document.head.append(
    Object.assign(document.createElement("style"), {
      textContent: "[popover] { display: block !important }",
    })
  )
})

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

type OpenReason = PopoverOpenChangeReason | "item-press"

const emojiPicker = definePrimitive({
  name: "emoji-picker",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onPick: "callback",
  },
  state: (options: {
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean, details: ChangeDetails<OpenReason>) => void
    onPick?: (emoji: string) => void
  }) => ({ open: options.open ?? options.defaultOpen ?? false }),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => {
    const change = createChange(context)
    return {
      setOpen: (
        open: boolean,
        details: { reason: OpenReason; event?: Event; source?: ChangeSource }
      ) => change("open", open, details),
      pick(emoji: string, event?: Event) {
        context.options().onPick?.(emoji)
        change("open", false, { reason: "item-press", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { open: boolean }>({
      state: (state) => ({ open: state.open }),
    }),
    emoji: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, props }, event) => api.pick(props.value, event),
    }),
  }),
})

const { Emoji: EmojiPickerItem } = createParts(emojiPicker, { emoji: "button" })

// The root renders our Popover, controlled by the picker's state, instead of an element.
function EmojiPicker({
  children,
  ...options
}: Parameters<typeof emojiPicker>[0] & { children: React.ReactNode }) {
  const picker = usePrimitive(emojiPicker, options)
  return usePart(
    picker,
    "root",
    {},
    {
      render: (_props, state) => (
        <Popover
          open={state.open}
          onOpenChange={(open, details) =>
            picker.api.setOpen(open, {
              reason: details.reason,
              event: details.event,
              source: details.source,
            })
          }
        >
          {children}
        </Popover>
      ),
    }
  )
}

test("the picker owns open: the trigger opens it, and picking closes it with the picker's reason", async () => {
  const picked: string[] = []
  const reasons: string[] = []
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <EmojiPicker
        onPick={(emoji) => picked.push(emoji)}
        onOpenChange={(_open, { reason }) => reasons.push(reason)}
      >
        <PopoverTrigger>React</PopoverTrigger>
        <PopoverContent>
          <EmojiPickerItem value="🎉">🎉</EmojiPickerItem>
        </PopoverContent>
      </EmojiPicker>
    )
  )
  const trigger = container.querySelector("button")!
  await React.act(async () => trigger.click())
  expect(trigger.getAttribute("aria-expanded")).toBe("true")

  const emoji = document.querySelector<HTMLElement>(
    '[data-slot="emoji-picker-emoji"]'
  )!
  await React.act(async () => emoji.click())
  expect(picked).toEqual(["🎉"])
  expect(reasons).toEqual(["trigger-press", "item-press"])
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
})

test("a picker that refuses to open keeps the popover closed", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await React.act(async () =>
    root!.render(
      <EmojiPicker onOpenChange={(_open, details) => details.cancel()}>
        <PopoverTrigger>React</PopoverTrigger>
        <PopoverContent>
          <EmojiPickerItem value="🎉">🎉</EmojiPickerItem>
        </PopoverContent>
      </EmojiPicker>
    )
  )
  const trigger = container.querySelector("button")!
  await React.act(async () => trigger.click())
  expect(trigger.getAttribute("aria-expanded")).toBe("false")
})
