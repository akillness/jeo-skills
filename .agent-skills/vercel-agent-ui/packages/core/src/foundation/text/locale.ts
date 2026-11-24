// The page's and the user's language, in a form Intl accepts. Pages and
// systems hand out tags every Intl constructor rejects with a RangeError:
// `lang="en_US"` is common, and headless Chromium on Linux reports
// `navigator.language` as `en-US@posix`.

/**
 * A language tag Intl accepts, read from a BCP 47 or POSIX one (`en_US`), or undefined.
 * @stable
 */
function toLocale(tag: string | null | undefined) {
  // A POSIX locale's encoding and modifier go, as in `de_DE.UTF-8@euro`.
  try {
    return Intl.getCanonicalLocales(
      tag ? tag.split(/[.@]/)[0].replaceAll("_", "-") : []
    )[0]
  } catch {}
}

/**
 * The user's language, which their typing is in. Undefined on the server.
 * @stable
 */
function userLocale() {
  if (typeof navigator === "undefined") {
    return undefined
  }
  return toLocale(navigator.languages?.[0] ?? navigator.language)
}

/**
 * The language of the page around an element, or of the whole page: the
 * nearest `lang` Intl accepts, else the user's. Undefined on the server.
 * @stable
 */
function pageLocale(el?: Element) {
  if (typeof document === "undefined") {
    return undefined
  }
  const lang = (el ?? document.documentElement)
    .closest("[lang]")
    ?.getAttribute("lang")
  return toLocale(lang) ?? userLocale()
}

// Reads the page's language once the root is in the document. Vue binds
// before that, so it waits a microtask.
function bindPageLocale(el: Element, set: (locale: string | null) => void) {
  const read = () => set(pageLocale(el) ?? null)
  if (el.isConnected) {
    read()
  } else {
    queueMicrotask(read)
  }
}

// What a component formats in: its `locale` option, else the page's once
// `bindPageLocale` reads it. English until then, so the server's markup never
// depends on the server's own language and the first client render matches it.
const localeOf = (state: {
  locale?: string | null | undefined
  pageLocale?: string | null
}) => state.locale ?? state.pageLocale ?? "en-US"

export { bindPageLocale, localeOf, pageLocale, toLocale, userLocale }
