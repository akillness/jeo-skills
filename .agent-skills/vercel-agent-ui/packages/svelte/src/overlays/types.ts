/**
 * Props for the toast regions the overlay host renders: the region's props and attributes, like `class`.
 * @stable
 */
type OverlayHostToastProps = {
  side?: "top" | "bottom"
  align?: "start" | "center" | "end"
  max?: number
  expanded?: boolean
  shortcut?: string | null
  [attribute: string]: unknown
}

export { type OverlayHostToastProps }
