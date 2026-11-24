import * as React from "react"
import {
  createChange,
  definePrimitive,
  type ChangeDetails,
  type ChangeSource,
} from "@ui-sdk/core"
import type { PopoverOpenChangeReason } from "@ui-sdk/core/popover"
import { Popover, PopoverContent, PopoverTrigger } from "@ui-sdk/react/popover"
import { createParts, usePart, usePrimitive } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type EmojiPickerOpenReason = PopoverOpenChangeReason | "item-press"

type EmojiPickerOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<EmojiPickerOpenReason>
  ) => void
  onPick?: (emoji: string) => void
}

const emojiPicker = definePrimitive({
  name: "emoji-picker",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onPick: "callback",
  },
  state: (options: EmojiPickerOptions) => ({
    open: options.open ?? options.defaultOpen ?? false,
  }),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => {
    const change = createChange(context)
    return {
      setOpen: (
        open: boolean,
        details: {
          reason: EmojiPickerOpenReason
          event?: Event
          source?: ChangeSource
        }
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
      attrs: (_state, { key }) => ({ type: "button", "aria-label": key }),
      press: ({ api, key }, event) => api.pick(key, event),
    }),
  }),
})

const parts = createParts(emojiPicker, { emoji: "button" })

function EmojiPicker({
  children,
  ...options
}: EmojiPickerOptions & { children: React.ReactNode }) {
  const handle = usePrimitive(emojiPicker, options)
  return usePart(
    handle,
    "root",
    {},
    {
      render: (_props, state) => (
        <Popover
          open={state.open}
          onOpenChange={(open, details) =>
            handle.api.setOpen(open, {
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

const EmojiPickerItem = parts.Emoji

const emojis = ["🎉", "👍", "❤️", "😂", "👀", "🚀"]

function Example() {
  const log = useLog()
  return (
    <EmojiPicker onPick={(emoji) => log(`Reacted with ${emoji}`)}>
      <PopoverTrigger>React</PopoverTrigger>
      <PopoverContent>
        {emojis.map((emoji) => (
          <EmojiPickerItem key={emoji} value={emoji}>
            {emoji}
          </EmojiPickerItem>
        ))}
      </PopoverContent>
    </EmojiPicker>
  )
}

export {
  emojiPicker,
  EmojiPicker,
  EmojiPickerItem,
  Example,
  type EmojiPickerOpenReason,
  type EmojiPickerOptions,
}
