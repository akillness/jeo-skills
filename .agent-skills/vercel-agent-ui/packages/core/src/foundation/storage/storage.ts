// Where a value is kept between visits: localStorage, sessionStorage or a
// cookie, under an ID. Any of them can be unavailable, like on the server, in
// a sandboxed frame or with storage blocked, and then reads return null and
// writes do nothing.
//
// Every storage with the same kind and ID shares its listeners, so a write
// through one reaches the others on the page, which the browser's `storage`
// event never reports to the page that wrote. Other tabs come through that
// event for localStorage, and through `cookieStore` for cookies where the
// browser has it.
//
// A cookie is the one the server can read, given the request's `Cookie`
// header, so a value kept there renders right from the first render. For
// localStorage and sessionStorage, `script` writes an inline script that a
// component renders right after its root: as the page loads, before any
// bundle, it puts the saved value on that root as a `data-*` attribute, so CSS
// shows it on the first paint. Content that depends on the value catches up
// after hydration. Every script with the same kind and ID reads the storage
// once, and the scripts are identical, so compression shrinks the repeats.
import { isBrowser } from "../platform/env"

/**
 * Options for `createCookieStorage`.
 * @experimental
 */
type CookieStorageOptions = {
  /** The request's `Cookie` header, so the server reads the same value the browser will. */
  cookie?: string | null
  /**
   * How long the cookie lasts, in seconds.
   * @defaultValue 31536000
   */
  maxAge?: number
  /**
   * The paths that send the cookie.
   * @defaultValue "/"
   */
  path?: string
  /** The domain that sends the cookie. Defaults to the page's host. */
  domain?: string
  /**
   * Whether other sites' requests send the cookie.
   * @defaultValue "lax"
   */
  sameSite?: "strict" | "lax" | "none"
  /** Whether only HTTPS requests send the cookie. Defaults to true on HTTPS pages. */
  secure?: boolean
}

/**
 * What `script` puts on the component's root.
 * @experimental
 */
type StorageScriptOptions = {
  /** The attribute that shows the value, which has to start with `data-`, like `"data-color-scheme"`. */
  attribute: `data-${string}`
  /** The values it may show. Anything else saved under the ID leaves the root as the server rendered it. */
  values: readonly string[]
}

type Kind = "local" | "session" | "cookie"

// What every script reads with: the value saved under an ID, read once per
// kind and ID however many scripts ask, and cached on the window. ES5, since
// it runs before any bundle and any polyfill.
const readSaved = `function(k,i){var c=window.__uiSdkStorage||(window.__uiSdkStorage={}),n=k+":"+i;if(!(n in c)){var s=null;try{if(k==="cookie"){var m=("; "+document.cookie).split("; "+encodeURIComponent(i)+"=");if(m.length>1)s=decodeURIComponent(m[1].split(";")[0])}else s=(k==="local"?localStorage:sessionStorage).getItem(i)}catch(e){}c[n]=s}return c[n]}`

// Puts a value it allows on the element right before the script.
const seed = `function(k,i,a,v){try{var s=(${readSaved})(k,i),t=document.currentScript,r=t&&t.previousElementSibling;if(r&&s!==null&&v.indexOf(s)>-1)r.setAttribute(a,s)}catch(e){}}`

// JSON, with `<` escaped so a value can't close the script element.
const literal = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c")

// The listeners of every storage with one kind and ID, on this page.
const listenersByKey = new Map<string, Set<(value: string | null) => void>>()

const listenersOf = (kind: Kind, id: string) => {
  const key = `${kind}:${id}`
  let listeners = listenersByKey.get(key)
  if (!listeners) {
    listenersByKey.set(key, (listeners = new Set()))
  }
  return listeners
}

// The localStorage and sessionStorage objects that took a write. Only success
// is remembered: a full storage can take writes again once space frees up.
const writable = new WeakSet<Storage>()

// The page's localStorage or sessionStorage, or undefined where reading it
// throws, like in a sandboxed frame.
function areaOf(kind: "local" | "session") {
  if (!isBrowser) {
    return
  }
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage
  } catch {
    return
  }
}

// Whether a write goes through now, unlike in a browser that blocks storage or once it's full.
function canWrite(area: Storage) {
  if (writable.has(area)) {
    return true
  }
  try {
    const probe = "__ui-sdk-storage__"
    area.setItem(probe, probe)
    area.removeItem(probe)
    writable.add(area)
    return true
  } catch {
    return false
  }
}

function checkId(id: string) {
  if (typeof id !== "string" || id === "") {
    throw new Error(
      'A storage needs an ID, like createLocalStorage("color-scheme").'
    )
  }
}

// What every kind shares: the ID, telling the other storages with it about a
// write, and hearing them and other tabs.
function createStorage(
  kind: Kind,
  id: string,
  area: {
    readsOnServer: boolean
    script?: (options: StorageScriptOptions) => string
    available: () => boolean
    read: () => string | null
    write: (value: string | null) => boolean
    watch: (heard: () => void) => () => void
  }
) {
  checkId(id)
  const listeners = listenersOf(kind, id)
  const storageKind = kind

  const save = (value: string | null) => {
    if (!area.write(value)) {
      return false
    }
    for (const listener of [...listeners]) {
      listener(value)
    }
    return true
  }

  return {
    /** The ID the value is kept under: the localStorage or sessionStorage key, or the cookie's name. */
    id,
    /** Where the value is kept: `"local"`, `"session"` or `"cookie"`. */
    kind: storageKind,
    /** Whether the server reads the value too, so it renders right from the first render. True for cookies. */
    readsOnServer: area.readsOnServer,
    /**
     * The inline script a component renders right after its root, which puts
     * the saved value on the root before hydration, so CSS shows it on the
     * first paint. Undefined for a cookie, since the server renders its value.
     */
    script: (options: StorageScriptOptions) => area.script?.(options),
    /**
     * Whether storage appears available. A later write can still fail.
     * On the server, a cookie with a request header is available for reading only.
     */
    available: area.available,
    /** The value kept under the ID, or null when nothing is, or the storage is unavailable. */
    get: area.read,
    /**
     * Saves a value under the ID. Returns false when writing is unavailable or
     * the browser reports a write failure. For cookies, true means the assignment
     * didn't throw; it doesn't confirm the cookie was saved.
     */
    set: (value: string) => save(value),
    /**
     * Removes the value. Returns false when writing is unavailable or the
     * browser reports a write failure. For cookies, true means the assignment
     * didn't throw; it doesn't confirm the cookie was removed.
     */
    remove: () => save(null),
    /**
     * Hears the value change, through another storage with the same ID on the
     * page or in another tab. Returns the function that stops it.
     */
    subscribe(listener: (value: string | null) => void) {
      // A wrapper per subscription, so the same listener subscribed twice stops once per call.
      const entry = (value: string | null) => listener(value)
      listeners.add(entry)
      const unwatch = area.watch(() => listener(area.read()))
      return () => {
        listeners.delete(entry)
        unwatch()
      }
    },
  }
}

// localStorage and sessionStorage, which only differ in the area they use.
function createAreaStorage(kind: "local" | "session", id: string) {
  return createStorage(kind, id, {
    readsOnServer: false,
    script: ({ attribute, values }) => {
      if (!/^data-[a-z0-9-]+$/.test(attribute)) {
        throw new Error(
          `A storage script only sets data-* attributes, not "${attribute}".`
        )
      }
      return `(${seed})(${[kind, id, attribute, values].map(literal).join(",")})`
    },
    available: () => {
      const area = areaOf(kind)
      return Boolean(area && canWrite(area))
    },
    read: () => {
      try {
        return areaOf(kind)?.getItem(id) ?? null
      } catch {
        return null
      }
    },
    write: (value) => {
      const area = areaOf(kind)
      if (!area) {
        return false
      }
      try {
        if (value === null) {
          area.removeItem(id)
        } else {
          area.setItem(id, value)
        }
        return true
      } catch {
        // Blocked, or full.
        return false
      }
    },
    watch: (heard) => {
      if (!isBrowser) {
        return () => {}
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key !== id && event.key !== null) {
          return
        }
        if (event.storageArea !== areaOf(kind)) {
          return
        }
        heard()
      }
      window.addEventListener("storage", onStorage)
      return () => window.removeEventListener("storage", onStorage)
    },
  })
}

/**
 * A value kept in localStorage under `id`, which lasts until it's removed and
 * reaches every tab on the site. The server can't read it.
 * @experimental
 */
function createLocalStorage(id: string) {
  return createAreaStorage("local", id)
}

/**
 * A value kept in sessionStorage under `id`, which lasts while the tab is
 * open and stays in that tab. The server can't read it.
 * @experimental
 */
function createSessionStorage(id: string) {
  return createAreaStorage("session", id)
}

const cookieValue = (header: string | null | undefined, name: string) => {
  if (!header) {
    return null
  }
  for (const pair of header.split(";")) {
    const at = pair.indexOf("=")
    if (at < 0 || pair.slice(0, at).trim() !== name) {
      continue
    }
    try {
      return decodeURIComponent(pair.slice(at + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

const cookiesEnabled = () => {
  try {
    return (
      isBrowser &&
      navigator.cookieEnabled !== false &&
      typeof document.cookie === "string"
    )
  } catch {
    return false
  }
}

/**
 * A value kept in a cookie named `id`, which the server reads from the
 * request's `Cookie` header, so the value renders right from the first render.
 * @experimental
 */
function createCookieStorage(id: string, options: CookieStorageOptions = {}) {
  const name = encodeURIComponent(id)
  return createStorage("cookie", id, {
    readsOnServer: true,
    available: () => (isBrowser ? cookiesEnabled() : options.cookie != null),
    read: () => {
      if (!isBrowser) {
        return cookieValue(options.cookie, name)
      }
      try {
        return cookieValue(document.cookie, name)
      } catch {
        return null
      }
    },
    write: (value) => {
      if (!cookiesEnabled()) {
        return false
      }
      const secure = options.secure ?? location.protocol === "https:"
      const parts = [
        `${name}=${value === null ? "" : encodeURIComponent(value)}`,
        `path=${options.path ?? "/"}`,
        `max-age=${value === null ? 0 : (options.maxAge ?? 31536000)}`,
        `samesite=${options.sameSite ?? "lax"}`,
      ]
      if (options.domain) {
        parts.push(`domain=${options.domain}`)
      }
      if (secure) {
        parts.push("secure")
      }
      try {
        document.cookie = parts.join("; ")
        return true
      } catch {
        return false
      }
    },
    watch: (heard) => {
      // `cookieStore` hears other tabs' writes, where the browser has it.
      const store = isBrowser
        ? (window as Window & { cookieStore?: EventTarget }).cookieStore
        : undefined
      if (!store) {
        return () => {}
      }
      const onChange = (event: Event) => {
        const { changed = [], deleted = [] } = event as Event & {
          changed?: { name: string }[]
          deleted?: { name: string }[]
        }
        if ([...changed, ...deleted].some((cookie) => cookie.name === name)) {
          heard()
        }
      }
      store.addEventListener("change", onChange)
      return () => store.removeEventListener("change", onChange)
    },
  })
}

/**
 * A value kept under an ID, from `createLocalStorage`, `createSessionStorage`
 * or `createCookieStorage`. Pass one to anything that saves a value, like
 * `createColorScheme`'s `storage`.
 * @experimental
 */
type ValueStorage = ReturnType<typeof createLocalStorage>

export {
  literal,
  readSaved,
  type CookieStorageOptions,
  type StorageScriptOptions,
  type ValueStorage,
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
}
