// The testing kit's markup: tags are slot names, or plain elements, and
// attributes are slot props, read without a DOM, so a server check can use
// the same markup a mounted test does.

/** A tag in the markup, with its attributes in order and its children. */
type MarkupNode = {
  tag: string
  attributes: [name: string, value: string][]
  children: (MarkupNode | string)[]
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
}
const decode = (text: string) =>
  text.replace(
    /&(amp|lt|gt|quot|apos|#39);/g,
    (_, name: string) => entities[name]
  )

const voids = new Set([
  "area",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
])

// Tags, attributes and text, in order. Self-closing tags and void elements
// have no children.
function parseMarkup(markup: string) {
  const root: MarkupNode = { tag: "", attributes: [], children: [] }
  const open = [root]
  const token =
    /<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g
  for (const [, close, tag, attributes, selfClosing, text] of markup.matchAll(
    token
  )) {
    const parent = open.at(-1)!
    if (text !== undefined) {
      if (text.trim()) {
        parent.children.push(decode(text))
      }
      continue
    }
    if (close) {
      if (open.length > 1 && open.at(-1)!.tag === close.toLowerCase()) {
        open.pop()
      }
      continue
    }
    const node: MarkupNode = {
      tag: tag.toLowerCase(),
      attributes: [],
      children: [],
    }
    for (const [, name, quoted, single, bare] of attributes.matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    )) {
      node.attributes.push([name, decode(quoted ?? single ?? bare ?? "")])
    }
    parent.children.push(node)
    if (!selfClosing && !voids.has(node.tag)) {
      open.push(node)
    }
  }
  return root.children
}

export { type MarkupNode, parseMarkup }
