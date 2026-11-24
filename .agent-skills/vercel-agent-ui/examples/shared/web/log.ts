function log(root: HTMLElement, message: string) {
  root.dispatchEvent(
    new CustomEvent("example-log", { bubbles: true, detail: message })
  )
}

export { log }
