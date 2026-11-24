import "@ui-sdk/web/button"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function mount(root: HTMLElement) {
  root.innerHTML = `<ui-button pending-announcement="Saving"><button>Save</button></ui-button>`
  root
    .querySelector("ui-button")!
    .addEventListener("action", (event) => event.detail.waitUntil(wait(1500)))
}

export { mount }
