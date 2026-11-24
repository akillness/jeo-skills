// Attributes every component writes the same way: the state of a part that
// opens or checks, and a value inside an id.

/**
 * `data-open` or `data-closed`, never both. Every part that opens writes these.
 * @stable
 */
function openAttrs(open: boolean) {
  return {
    "data-open": open ? "" : undefined,
    "data-closed": open ? undefined : "",
  }
}

/**
 * `data-checked`, `data-unchecked` or `data-indeterminate`. Every part with a
 * checked state writes these.
 * @stable
 */
function checkedAttrs(checked: boolean | "indeterminate") {
  return {
    "data-checked": checked === true ? "" : undefined,
    "data-unchecked": checked === false ? "" : undefined,
    "data-indeterminate": checked === "indeterminate" ? "" : undefined,
  }
}

/**
 * A value made safe inside an id, like `${id}-item-${idPart(value)}`. Values
 * may hold spaces or `%`, which would break an `aria-controls` or
 * `aria-labelledby` reference.
 * @stable
 */
function idPart(value: string) {
  return value.replace(/[\s%]/g, encodeURIComponent)
}

export { checkedAttrs, idPart, openAttrs }
