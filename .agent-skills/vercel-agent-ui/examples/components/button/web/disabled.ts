import "@ui-sdk/web/button"

function mount(root: HTMLElement) {
  root.innerHTML = `<ui-button disabled><button>Disabled</button></ui-button>`
}

export { mount }
