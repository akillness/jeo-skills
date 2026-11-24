/** What one entry of `@ui-sdk/vue` gives a Nuxt app, as the build lists it in `entries.json`. */
interface NuxtEntry {
  /** The entry's specifier, like `@ui-sdk/vue/dialog`. */
  from: string
  /** The components the entry exports, like `DialogTrigger`. */
  components: string[]
  /** The other values the entry exports, like `createDialogController`. */
  imports: string[]
}

function nuxtRegistrations(entries: NuxtEntry[], prefix: string) {
  return {
    components: entries.flatMap(({ from, components }) =>
      components.map((name) => ({
        name: `${prefix}${name}`,
        export: name,
        filePath: from,
      }))
    ),
    // Below the app's own imports and every layer's (0, -1, -2…), so their
    // `utils/` win over a ui-sdk name like `clamp` instead of losing silently.
    imports: entries
      .filter(({ imports }) => imports.length)
      .map(({ from, imports }) => ({
        from,
        imports,
        priority: Number.MIN_SAFE_INTEGER,
      })),
  }
}

export { type NuxtEntry, nuxtRegistrations }
