// The browser build's `web.js`: one script that defines each component the
// first time its tags appear on the page, from the files beside it. A page
// downloads only the components it uses.

/**
 * The entry that defines `tag`: the longest entry named like it, as
 * `tabs` for <ui-tabs-tab> or `overlays` for <ui-overlay-host>.
 */
function entryOf(tag: string, entries: readonly string[]) {
  let match: string | undefined
  for (const entry of entries) {
    const named = [entry, entry.replace(/s$/, "")].some(
      (stem) => tag === `ui-${stem}` || tag.startsWith(`ui-${stem}-`)
    )
    if (named && entry.length > (match?.length ?? 0)) {
      match = entry
    }
  }
  return match
}

/**
 * The folder a loader at `scriptUrl` loads components from: `web@1.2.0/`
 * beside `web@1.2.0.js`. A query or hash on the script, like `?v=2`, isn't
 * part of the folder's name.
 */
function componentsBase(scriptUrl: string) {
  return new URL(new URL(scriptUrl).pathname.replace(/\.js$/, "/"), scriptUrl)
}

/**
 * Imports the entry of every undefined `ui-` element in `root` from `base`,
 * like `web/tabs.js`, then of every one added later, inside open shadow roots
 * too.
 */
function autoload(
  base: URL,
  entries: readonly string[],
  root: Document = document
) {
  const requested = new Set<string>()
  const shadowRoots = new WeakSet<ShadowRoot>()

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        load(node)
      }
    }
  })

  const load = (node: Node) => {
    if (!(node instanceof Element)) {
      return
    }
    for (const element of [node, ...node.querySelectorAll("*")]) {
      // A shadow root that exists now, like one a component renders into, is
      // watched for what it gets later.
      const shadowRoot = element.shadowRoot
      if (shadowRoot && !shadowRoots.has(shadowRoot)) {
        shadowRoots.add(shadowRoot)
        observer.observe(shadowRoot, { childList: true, subtree: true })
        for (const child of shadowRoot.children) {
          load(child)
        }
      }
      const tag = element.localName
      if (!tag.startsWith("ui-") || customElements.get(tag)) {
        continue
      }
      const entry = entryOf(tag, entries)
      if (!entry || requested.has(entry)) {
        continue
      }
      requested.add(entry)
      void import(/* @vite-ignore */ new URL(`${entry}.js`, base).href)
    }
  }

  load(root.documentElement)
  observer.observe(root.documentElement, { childList: true, subtree: true })
  return () => observer.disconnect()
}

export { autoload, componentsBase, entryOf }
