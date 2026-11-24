export function mount(
  module: { mount: (root: HTMLElement) => (() => void) | void },
  host: HTMLElement
) {
  const unmount = module.mount(host)
  return () => {
    unmount?.()
    host.replaceChildren()
  }
}
