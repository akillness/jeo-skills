const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined"

// iPhone and iPad, including iPads that report a Mac.
function isIOS() {
  return (
    isBrowser &&
    (/iP(hone|ad|od)/.test(navigator.platform) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  )
}

/**
 * Whether `el` lays out right to left, from its computed direction. False on the server.
 * @stable
 */
function isRTL(el: Element | null | undefined) {
  return !!el && isBrowser && getComputedStyle(el).direction === "rtl"
}

export { isBrowser, isIOS, isRTL }
