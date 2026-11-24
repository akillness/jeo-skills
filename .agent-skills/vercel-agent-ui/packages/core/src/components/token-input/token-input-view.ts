// TokenInput's DOM: renders a value into a contenteditable element and turns
// what the browser does back into edits of the value. The core owns this DOM;
// frameworks render only inside token hosts, which keep their identity.
//
// The shape follows what the three browser engines need:
// text nodes; a host per token, `span[contenteditable=false]`; a zero-width
// space on both sides of every host, without which Firefox can't place the
// caret between two tokens or after a final one; and a trailing <br> when the
// text ends in a new line or a token. Offsets skip the zero-width spaces.
import type { TextRange, Token } from "../../foundation/text/text-editor"
import { isToken, type TokenInputValue } from "./token-input-model"

const ANCHOR = "\u200b"
// Hidden from sight, never from assistive technology.
const visuallyHidden =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap"
const HOST = "data-token-id"
// A server host's place among the value's tokens, so one deleted before the
// page's script runs takes only its own token with it.
const SERVER_INDEX = "data-token-index"
const SENTINEL_ATTRIBUTE = "data-ui-sentinel"
// A symbol, so no text can be mistaken for it.
const SENTINEL = Symbol("sentinel")

type Desired = string | Token | typeof SENTINEL

// What a value renders as, child by child.
function layout(value: TokenInputValue) {
  const nodes: Desired[] = []
  value.forEach((segment, index) => {
    if (isToken(segment)) {
      // An anchor before the host, in the text before it or on its own.
      const last = nodes.length - 1
      if (typeof nodes[last] === "string") {
        nodes[last] += ANCHOR
      } else {
        nodes.push(ANCHOR)
      }
      nodes.push(segment, ANCHOR)
      return
    }
    const last = nodes.length - 1
    if (index > 0 && typeof nodes[last] === "string") {
      nodes[last] += segment
    } else {
      nodes.push(segment)
    }
  })
  const last = value.at(-1)
  if (isToken(last) || (typeof last === "string" && last.endsWith("\n"))) {
    nodes.push(SENTINEL)
  }
  return nodes
}

const isHost = (node: Node | null): node is HTMLElement =>
  node?.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute(HOST)
const isSentinel = (node: Node | null) =>
  node?.nodeType === Node.ELEMENT_NODE &&
  (node as Element).hasAttribute(SENTINEL_ATTRIBUTE)
const realLength = (text: string) => text.replaceAll(ANCHOR, "").length

function createTokenView(
  el: HTMLElement,
  {
    describe,
    customContent,
    onHosts,
  }: {
    // The visually hidden kind and status each host carries.
    describe: (token: Token) => string
    // Whether a framework renders each token's content.
    customContent: () => boolean
    // Hosts were added or removed, so frameworks render into the new ones.
    onHosts: () => void
  }
) {
  const doc = el.ownerDocument
  type Entry = {
    host: HTMLElement
    content: HTMLElement
    label: HTMLElement
    labelText: Text
    token: Token
  }
  const hosts = new Map<string, Entry>()
  let hostCount = 0

  function hostFor(token: Token) {
    let entry = hosts.get(token.id!)
    if (!entry) {
      const host = doc.createElement("span")
      host.setAttribute(HOST, token.id!)
      host.setAttribute("contenteditable", "false")
      host.setAttribute("spellcheck", "false")
      host.setAttribute("data-slot", "token-input-host")
      const content = doc.createElement("span")
      const label = doc.createElement("span")
      label.style.cssText = visuallyHidden
      label.setAttribute("data-slot", "token-input-token-label")
      host.append(content, label)
      entry = { host, content, label, labelText: doc.createTextNode(""), token }
      hosts.set(token.id!, entry)
    }
    entry.token = token
    const description = ` ${describe(token)}`
    if (entry.label.textContent !== description) {
      entry.label.textContent = description
    }
    showLabel(entry)
    host(entry.host, token)
    return entry.host
  }

  // A host shows its token's label until a framework renders its content. Only
  // the label's own node moves, so content a framework is still removing stays.
  function showLabel({ content, labelText, token }: Entry) {
    if (customContent()) {
      return labelText.remove()
    }
    if (labelText.data !== token.label) {
      labelText.data = token.label
    }
    if (labelText.parentNode !== content) {
      content.prepend(labelText)
    }
  }

  // State attributes on a host, for styling chips without a framework part.
  function host(element: HTMLElement, token: Token) {
    element.setAttribute("data-token-type", token.type)
    for (const status of ["pending", "unresolved"] as const) {
      if (token.status === status) {
        element.setAttribute(`data-${status}`, "")
      } else {
        element.removeAttribute(`data-${status}`)
      }
    }
  }

  // Patches the children to match the value, reusing text nodes and hosts, so
  // the caret, spelling marks and framework content survive.
  function render(value: TokenInputValue) {
    const wanted = layout(value)
    const used = new Set<string>()
    let cursor = el.firstChild
    for (const item of wanted) {
      if (item === SENTINEL) {
        if (isSentinel(cursor)) {
          cursor = cursor!.nextSibling
        } else {
          el.insertBefore(doc.createElement("br"), cursor).setAttribute(
            SENTINEL_ATTRIBUTE,
            ""
          )
        }
        continue
      }
      if (typeof item === "string") {
        if (cursor?.nodeType === Node.TEXT_NODE) {
          if ((cursor as Text).data !== item) {
            ;(cursor as Text).data = item
          }
          cursor = cursor.nextSibling
        } else {
          el.insertBefore(doc.createTextNode(item), cursor)
        }
        continue
      }
      const element = hostFor(item)
      used.add(item.id!)
      if (cursor === element) {
        cursor = cursor.nextSibling
      } else {
        el.insertBefore(element, cursor)
      }
    }
    while (cursor) {
      const next = cursor.nextSibling
      cursor.remove()
      cursor = next
    }
    let changed = false
    for (const [id, entry] of hosts) {
      if (!used.has(id)) {
        entry.host.remove()
        hosts.delete(id)
        changed = true
      }
    }
    if (changed || used.size !== hostCount) {
      hostCount = used.size
      onHosts()
    }
  }

  // The value the DOM holds now: text without anchors, and a token per known
  // host. A host the browser removed or emptied is a removed token. Anything
  // else, like a <div> an engine wrapped a line in, becomes its text.
  function read(rendered: Token[] = []) {
    const value: TokenInputValue = []
    const walk = (parent: Node, nested: boolean) => {
      parent.childNodes.forEach((node, index) => {
        if (node.nodeType === Node.TEXT_NODE) {
          value.push((node as Text).data.replaceAll(ANCHOR, ""))
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return
        }
        if (isHost(node)) {
          const entry = hosts.get(node.getAttribute(HOST)!)
          if (entry && entry.host === node && node.isConnected) {
            value.push(entry.token)
          }
          return
        }
        if (isSentinel(node)) {
          return
        }
        if ((node as Element).matches('[data-slot="token-input-host"]')) {
          const token =
            rendered[Number((node as Element).getAttribute(SERVER_INDEX))]
          return void (token && value.push(token))
        }
        const name = (node as Element).localName
        if (name === "br") {
          return void value.push("\n")
        }
        const block = name === "div" || name === "p"
        if (block && (index > 0 || nested)) {
          value.push("\n")
        }
        walk(node, nested || block)
      })
    }
    walk(el, false)
    return value
  }

  // The host a node is in, if any.
  function hostOf(node: Node | null) {
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement
    const host = element?.closest<HTMLElement>(`[${HOST}]`)
    return host && el.contains(host) ? host : null
  }

  // Where a node starts, in offsets: the length of everything before it.
  function startOf(node: Node) {
    let total = 0
    for (
      let current: Node | null = node;
      current && current !== el;
      current = current.parentNode
    ) {
      for (
        let sibling = current.previousSibling;
        sibling;
        sibling = sibling.previousSibling
      ) {
        total += lengthOf(sibling)
      }
    }
    return total
  }

  // A DOM point as an offset. Inside a host, the token's start, or its end
  // with `after`, since nothing inside a token is a caret position.
  function offsetOf(node: Node, offset: number, after = false) {
    const host = hostOf(node)
    if (host) {
      return startOf(host) + (after || (host === node && offset > 0) ? 1 : 0)
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return startOf(node) + realLength((node as Text).data.slice(0, offset))
    }
    let total = node === el ? 0 : startOf(node)
    for (
      let index = 0;
      index < offset && index < node.childNodes.length;
      index++
    ) {
      total += lengthOf(node.childNodes[index])
    }
    return total
  }

  function lengthOf(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return realLength((node as Text).data)
    }
    if (isHost(node)) {
      return 1
    }
    if (isSentinel(node)) {
      return 0
    }
    if ((node as Element).localName === "br") {
      return 1
    }
    let total = 0
    node.childNodes.forEach((child) => (total += lengthOf(child)))
    return total
  }

  // An offset as a DOM point: inside a text node, after the anchor that
  // follows a host and before the one that precedes the next.
  // check-code: allow return-type TypeScript would infer an array instead of a tuple.
  function pointAt(offset: number): [Node, number] {
    let remaining = offset
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const data = (child as Text).data
        const length = realLength(data)
        if (remaining <= length) {
          let index = data.startsWith(ANCHOR) && data.length > 1 ? 1 : 0
          for (let counted = 0; counted < remaining; index++) {
            if (data[index] !== ANCHOR) {
              counted++
            }
          }
          return [child, index]
        }
        remaining -= length
      } else {
        remaining -= lengthOf(child)
      }
    }
    return [el, el.childNodes.length - (isSentinel(el.lastChild) ? 1 : 0)]
  }

  function selection() {
    const selected = doc.getSelection()
    if (
      !selected ||
      !selected.rangeCount ||
      !el.contains(selected.anchorNode)
    ) {
      return null
    }
    const range = selected.getRangeAt(0)
    const start = offsetOf(range.startContainer, range.startOffset)
    const end = offsetOf(range.endContainer, range.endOffset, !range.collapsed)
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }

  function select({ start, end }: TextRange) {
    const selected = doc.getSelection()
    if (!selected) {
      return
    }
    const [startNode, startOffset] = pointAt(start)
    const [endNode, endOffset] =
      start === end ? [startNode, startOffset] : pointAt(end)
    const current = selected.rangeCount ? selected.getRangeAt(0) : null
    if (
      current &&
      current.startContainer === startNode &&
      current.startOffset === startOffset &&
      current.endContainer === endNode &&
      current.endOffset === endOffset
    ) {
      return
    }
    selected.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
  }

  // The caret's rectangle at an offset. A collapsed range in a non-empty text
  // node measures in every engine; an empty line or a point next to a host
  // measures zero, so the neighbouring character or host stands in.
  function rectAt(offset: number) {
    if (!el.isConnected) {
      return null
    }
    const [node, index] = pointAt(offset)
    const range = doc.createRange()
    range.setStart(node, index)
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if (rect.height) {
      return { x: rect.x, y: rect.y, width: 0, height: rect.height }
    }
    if (node.nodeType === Node.TEXT_NODE && index > 0) {
      range.setStart(node, index - 1)
      range.setEnd(node, index)
      const before = range.getBoundingClientRect()
      if (before.height) {
        return { x: before.right, y: before.y, width: 0, height: before.height }
      }
    }
    const previous =
      node.nodeType === Node.TEXT_NODE
        ? node.previousSibling
        : node.childNodes[index - 1]
    if (isHost(previous)) {
      const box = previous.getBoundingClientRect()
      return { x: box.right, y: box.y, width: 0, height: box.height }
    }
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return {
      x:
        box.x +
        parseFloat(style.paddingLeft) +
        parseFloat(style.borderLeftWidth),
      y:
        box.y + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
      width: 0,
      height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2,
    }
  }

  // What was typed into the server's markup before the page's script ran, its
  // hosts standing for the value's tokens. A view bound before, as
  // under React's StrictMode, left its own hosts.
  function typedBeforeBind(value: TokenInputValue) {
    const server = doc.createElement("template")
    server.innerHTML = renderStaticHtml(value, describe)
    if (
      !el.firstChild ||
      el.querySelector(`[${HOST}]`) ||
      el.innerHTML === server.innerHTML
    ) {
      return
    }
    return read(value.filter(isToken))
  }

  return {
    render,
    read: () => read(),
    typedBeforeBind,
    selection,
    select,
    rectAt,
    offsetAt: (node: Node, offset: number) => offsetOf(node, offset),
    // Whether a DOM point is inside a token's host.
    inHost: (node: Node | null) => !!hostOf(node),
    hosts: () =>
      [...hosts].map(([id, { token, content }]) => ({
        id,
        token,
        host: content,
      })),
    hostElement: (id: string) => hosts.get(id)?.host,
    showLabels: () => hosts.forEach(showLabel),
    destroy() {
      hosts.clear()
      onHosts()
    },
  }
}

type TokenView = ReturnType<typeof createTokenView>

/**
 * The same DOM as a string, for a server render that hydrates without the
 * editor jumping. Hosts get their label; the core re-renders on mount.
 */
function renderStaticHtml(
  value: TokenInputValue,
  describe: (token: Token) => string
) {
  const escape = (text: string) =>
    text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
  let tokens = 0
  return layout(value)
    .map((item) => {
      if (item === SENTINEL) {
        return `<br ${SENTINEL_ATTRIBUTE}="">`
      }
      if (typeof item === "string") {
        return escape(item)
      }
      // No token ids: the client gives its own, and replaces these hosts once it binds.
      return `<span contenteditable="false" spellcheck="false" data-slot="token-input-host" ${SERVER_INDEX}="${tokens++}" data-token-type="${escape(item.type)}"><span>${escape(item.label)}</span><span data-slot="token-input-token-label" style="${visuallyHidden}"> ${escape(describe(item))}</span></span>`
    })
    .join("")
}

export { createTokenView, renderStaticHtml, type TokenView }
