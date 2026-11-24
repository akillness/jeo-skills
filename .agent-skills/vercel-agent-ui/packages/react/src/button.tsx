import {
  button as buttonPrimitive,
  type ButtonActionDetails,
  type ButtonOptions,
  type ButtonState,
} from "@ui-sdk/core/button"
import type * as React from "react"
import {
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

type ButtonProps = Omit<PartProps<"button", ButtonState>, "type" | "onClick"> &
  ButtonOptions & {
    /**
     * Runs when the button is pressed. Return a Promise to make the button
     * pending until it settles: it gets `aria-busy`, `aria-disabled` and
     * `data-pending`, keeps focus, ignores presses meanwhile, so a form can't
     * submit twice, and says `pendingAnnouncement` after a second.
     * The event's element is whatever `render` renders, like a link.
     * `details.source` says how it was pressed, for changes made after an `await`.
     */
    onClick?: (
      event: React.MouseEvent<HTMLElement>,
      details: ButtonActionDetails
    ) => unknown
  }

/**
 * A button, or a link or any element that acts as one through `render`.
 * @stable
 */
function Button({
  disabled,
  focusableWhenDisabled,
  type,
  pendingAnnouncement,
  debug,
  onClick,
  render,
  ...props
}: ButtonProps) {
  const button = usePrimitive(buttonPrimitive, {
    disabled,
    focusableWhenDisabled,
    type,
    pendingAnnouncement,
    debug,
  })
  // React hands the handler its own event, so the part runs the press itself.
  const press = (event: React.MouseEvent<HTMLElement>) => {
    button.api.internal.press(event.nativeEvent, (details) =>
      onClick?.(event, details)
    )
    // A router link's own onClick, like Next.js's, reads React's event.
    if (event.nativeEvent.defaultPrevented && !event.isDefaultPrevented()) {
      event.preventDefault()
    }
  }
  return usePart(
    button,
    "root",
    {},
    {
      ...props,
      render: (root: Record<string, any>, state: ButtonState) =>
        renderElement("button", { ...root, onClick: press }, render, state),
    },
    "button"
  )
}

export { Button }
export type {
  ButtonActionDetails,
  ButtonApi,
  ButtonOptions,
  ButtonPrimitive,
  ButtonState,
} from "@ui-sdk/core/button"
