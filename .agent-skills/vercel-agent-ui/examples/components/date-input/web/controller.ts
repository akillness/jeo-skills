import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="christmas">Christmas</button>
        <button type="button" data-action="year">Edit Year</button>
        <button type="button" data-action="clear">Clear</button>
      </div>
      <ui-field>
        <ui-field-label>Publish on</ui-field-label>
        <ui-date-input></ui-date-input>
      </ui-field>
    </div>
  `
  const publish = root.querySelector("ui-date-input")!.api
  const actions: Record<string, () => void> = {
    christmas: () => publish.setValue("2026-12-25"),
    year: () => publish.focus("year"),
    clear: () => publish.clear(),
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
}

export { mount }
