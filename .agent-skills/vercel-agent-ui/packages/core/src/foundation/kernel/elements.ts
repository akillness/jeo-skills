import { inDocumentOrder } from "./order"
import type { Part } from "./primitive-types"

/**
 * A slot's bound elements, in document order, so collections keep no index
 * bookkeeping. Name the slot's props to type them: `elements<{ value: string }>(context, "item")`.
 * @stable
 */
function elements<Props extends object = object>(
  context: { parts(): Iterable<Part> },
  slot: string
) {
  const bound = [...context.parts()].filter(
    (part): part is Part & { el: HTMLElement } =>
      part.slot === slot && !!part.el?.isConnected
  )
  return inDocumentOrder(bound).map(({ el, key, props }) => ({
    el,
    key,
    props: props as Props,
  }))
}

export { elements }
