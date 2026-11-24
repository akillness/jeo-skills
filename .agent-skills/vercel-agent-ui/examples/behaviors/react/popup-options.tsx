import * as React from "react"
import {
  createPopup,
  definePrimitive,
  popupClose,
  popupContent,
  popupState,
  popupTrigger,
  type ChangeDetails,
  type Modal,
} from "@ui-sdk/core"
import { popoverPreset } from "@ui-sdk/core/popover"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type CartOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<string>) => void
  modal?: Modal
  openOnHover?: boolean
  delay?: number
  dismissible?: boolean
  onDismissAttempt?: (details: { reason: string }) => void
}

const cart = definePrimitive({
  name: "cart",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    modal: "value",
    openOnHover: "boolean",
    delay: "number",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: (options: CartOptions) => popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: (context) => createPopup(context, { preset: popoverPreset }),
  slots: (slot) => ({
    trigger: popupTrigger(slot),
    content: popupContent(slot),
    close: popupClose(slot),
  }),
})

const parts = createParts(cart, {
  trigger: "button",
  content: "div",
  close: "button",
})

const Cart = parts.Root

const CartTrigger = parts.Trigger

const CartContent = parts.Content

const CartClose = parts.Close

function Example() {
  const [open, setOpen] = React.useState(false)
  const [modal, setModal] = React.useState(false)
  const [openOnHover, setOpenOnHover] = React.useState(false)
  const [dismissible, setDismissible] = React.useState(true)
  const log = useLog()
  const [count, setCount] = React.useState(0)
  return (
    <div data-slot="stack">
      <div data-slot="row">
        <Cart
          open={open}
          onOpenChange={(next: boolean, details: ChangeDetails<string>) => {
            setOpen(next)
            log(`${next ? "Opened" : "Closed"} by ${details.reason}`)
          }}
          modal={modal}
          openOnHover={openOnHover}
          delay={200}
          dismissible={dismissible}
          onDismissAttempt={(details: { reason: string }) =>
            log(`Kept open: ${details.reason}`)
          }
        >
          <CartTrigger>Cart</CartTrigger>
          <CartContent sideOffset={6}>
            <p>2 items, $48</p>
            <CartClose data-variant="solid" data-size="sm">
              Check Out
            </CartClose>
          </CartContent>
        </Cart>
        <button type="button" onClick={() => setCount(count + 1)}>
          Likes {count}
        </button>
      </div>
      <div data-slot="row">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={modal}
            onChange={(event) => setModal(event.target.checked)}
          />
          Modal
        </label>
        <label data-slot="label">
          <input
            type="checkbox"
            checked={openOnHover}
            onChange={(event) => setOpenOnHover(event.target.checked)}
          />
          Open on hover
        </label>
        <label data-slot="label">
          <input
            type="checkbox"
            checked={dismissible}
            onChange={(event) => setDismissible(event.target.checked)}
          />
          Dismissible
        </label>
      </div>
    </div>
  )
}

export {
  Cart,
  cart,
  CartClose,
  CartContent,
  type CartOptions,
  CartTrigger,
  Example,
}
