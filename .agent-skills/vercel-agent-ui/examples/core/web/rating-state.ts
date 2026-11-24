import { rating } from "../rating-stages/state"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-size="sm" data-rate="3">Set to 3</button>
        <button type="button" data-size="sm" data-rate="0">Reset</button>
      </div>
      <div data-slot="rating-readout">
        <output data-slot="rating-value" data-value aria-label="Rating">0</output>
        <span data-slot="hint">Rating</span>
      </div>
    </div>
  `
  const output = root.querySelector("output")!
  const instance = rating({
    id: "rating-state",
    onValueChange: (value) => (output.textContent = String(value)),
  })
  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest("[data-rate]")
    if (button instanceof HTMLElement) {
      instance.api.rate(Number(button.dataset.rate), event)
    }
  }
  root.addEventListener("click", onClick)
  return () => {
    root.removeEventListener("click", onClick)
    instance.destroy()
  }
}

export { mount }
