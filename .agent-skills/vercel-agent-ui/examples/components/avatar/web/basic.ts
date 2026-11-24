import "@ui-sdk/web/avatar"

const person = {
  name: "shadcn",
  src: "https://github.com/shadcn.png",
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-avatar>
        <img src="${person.src}" alt="${person.name}" />
        <ui-avatar-fallback><span aria-hidden="true">CN</span><span data-slot="visually-hidden">shadcn</span></ui-avatar-fallback>
      </ui-avatar>
    </div>
  `
}

export { mount }
