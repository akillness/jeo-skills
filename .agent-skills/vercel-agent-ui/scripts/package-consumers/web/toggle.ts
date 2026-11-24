import "@ui-sdk/web/toggle"

// Only the entry is imported: `pressed` and the event's `detail` type only if
// it brings <ui-toggle>'s place in HTMLElementTagNameMap, as a page that
// imports just that entry needs. Each `@ts-expect-error` proves a type isn't `any`.
const toggle = document.querySelector("ui-toggle")!
const pressed: boolean = toggle.pressed
// @ts-expect-error `pressed` is a boolean.
const pressedText: string = toggle.pressed

toggle.addEventListener("pressedchange", (event) => {
  const next: boolean = event.detail.value
  // @ts-expect-error The value is a boolean.
  const nextText: string = event.detail.value
  const reason: string = event.detail.reason
})
