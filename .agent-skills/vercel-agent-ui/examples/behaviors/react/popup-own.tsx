import * as React from "react"
import {
  createPopup,
  definePrimitive,
  popupClose,
  popupContent,
  popupState,
  popupTrigger,
  type ChangeDetails,
} from "@ui-sdk/core"
import { popoverPreset } from "@ui-sdk/core/popover"
import { createParts } from "@ui-sdk/react/primitive"

type InviteOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<string>) => void
}

const invite = definePrimitive({
  name: "invite",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
  },
  state: (options: InviteOptions) => popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => createPopup(context, { preset: popoverPreset }),
  slots: (slot) => ({
    trigger: popupTrigger(slot),
    content: popupContent(slot),
    close: popupClose(slot),
  }),
})

const parts = createParts(invite, {
  trigger: "button",
  content: "div",
  close: "button",
})

const Invite = parts.Root

const InviteTrigger = parts.Trigger

const InviteContent = parts.Content

const InviteClose = parts.Close

function Example() {
  return (
    <Invite>
      <InviteTrigger>Invite</InviteTrigger>
      <InviteContent sideOffset={6}>
        <p>Anyone with the link can join.</p>
        <input readOnly aria-label="Link" value="https://example.com/s/7f3a" />
        <InviteClose data-variant="solid" data-size="sm">
          Done
        </InviteClose>
      </InviteContent>
    </Invite>
  )
}

export {
  Example,
  invite,
  Invite,
  InviteClose,
  InviteContent,
  type InviteOptions,
  InviteTrigger,
}
