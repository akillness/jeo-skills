// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import type {
  UiAlertDialogElement,
  UiDialogElement,
  UiDrawerElement,
  UiHoverCardElement,
  UiMenuElement,
  UiPopoverElement,
  UiTooltipElement,
} from "../src/events"

type Day = { count: number }

// An element's `Payload` types its `payloadchange` value and its api's payload.
function listen(tooltip: UiTooltipElement<Day>) {
  tooltip.addEventListener("payloadchange", (event) => {
    const count: number | undefined = event.detail.value?.count
    // @ts-expect-error A day has no `name`.
    const name = event.detail.value?.name
    return [count, name]
  })
  tooltip.api.open({ payload: { count: 3 } })
  // @ts-expect-error The api opens with a day.
  tooltip.api.open({ payload: { name: "Mon" } })
}

type Payloads = [
  UiPopoverElement<Day>["api"],
  UiHoverCardElement<Day>["api"],
  UiMenuElement<Day>["api"],
  UiDialogElement<Day>["api"],
  UiAlertDialogElement<Day>["api"],
  UiDrawerElement<Day>["api"],
]

// Without one, the payload is unknown.
function listenUntyped(popover: UiPopoverElement) {
  popover.addEventListener("payloadchange", (event) => {
    // @ts-expect-error An unknown payload has no `count`.
    return event.detail.value.count
  })
}

export { listen, listenUntyped, type Payloads }
