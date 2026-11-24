import {
  tokenInput,
  type Token,
  type TokenCodec,
  type TokenInputApi,
  type TokenInputValue,
} from "@ui-sdk/core/token-input"
import { createParts, reconfigureInside } from "./define-element"

const owner = "ui-token-input"

// The properties rich values are set through.
type TokenInputElement = HTMLElement & {
  codec?: TokenCodec
  getTokenDescription?: (token: Token) => string
  // Renders a token's content into its host. Without it, a <template> child is cloned per token.
  renderToken?: (token: Token, host: HTMLElement) => void
}

// <ui-token-input> takes part in forms like a native control, submitting the
// codec text under its `name`. Markup:
//
// <ui-token-input name="prompt">
//   <ui-token-input-editor placeholder="Ask anything" aria-label="Prompt"></ui-token-input-editor>
//   <template>
//     <ui-token-input-token><span data-token-label></span><ui-token-input-token-remove>×</ui-token-input-token-remove></ui-token-input-token>
//   </template>
//   <ui-trigger-menu>…</ui-trigger-menu>
// </ui-token-input>
//
// A trigger menu inside it suggests into it. The template, or a `renderToken`
// property, renders each token; an element with data-token-label gets its label.

// Inside a token's host, the token's id comes from the host.
function tokenOf(el: HTMLElement) {
  const id = el.closest("[data-token-id]")?.getAttribute("data-token-id") ?? ""
  return { id, token: id }
}

function defineTokenInputElements() {
  createParts(tokenInput, {
    root: {
      tag: owner,
      formAssociated: true,
      properties: ["renderToken"],
      // The submit shortcut submits the form the element is in, so a form's own
      // submit event hears it. A bubbling "submit" event would reach the form too.
      silent: ["onSubmit"],
      // A disabled <ui-field> around it disables it, as a disabled Field does
      // in the other frameworks.
      options: (el) => ({
        ...(el.closest("ui-field")?.hasAttribute("disabled") && {
          disabled: true,
        }),
      }),
      display: "block",
      state: {
        value: {
          get: (api: TokenInputApi) => api.getValue(),
          set: (api: TokenInputApi, value: TokenInputValue | string) =>
            api.setValue(
              typeof value === "string"
                ? api.internal.codec().parse(value)
                : value
            ),
        },
      },
      api: [
        "getValue",
        "setValue",
        "getText",
        "getLabel",
        "insert",
        "updateToken",
        "removeToken",
        "undo",
        "redo",
        "canUndo",
        "canRedo",
        "clear",
        "focus",
      ],
      render(el, { api, subscribe }) {
        const target = el as TokenInputElement
        const mode = contentMode(target)
        api.internal.setCustom(mode !== "label")
        // A trigger menu inside finds this editor, whichever upgraded first, and
        // a new one when the token input is put back on the page.
        reconfigureInside(el)
        // Kept per render, so a new renderToken renders every host again.
        const rendered = new WeakMap<HTMLElement, Token>()
        const showTokens = () => renderTokens(target, api, rendered)
        showTokens()
        const unsubscribe = subscribe(showTokens)
        return () => {
          unsubscribe()
          // Renderers that keep nodes per container, like lit's or React's, update
          // the ones they left, so a new renderToken renders over them. Hosts only
          // empty when the element leaves or switches to a template or labels.
          if (el.isConnected && contentMode(target) === mode) {
            return
          }
          for (const { host } of api.internal.hosts()) {
            if (rendered.has(host)) {
              host.replaceChildren()
            }
          }
        }
      },
    },
    editor: { tag: "ui-token-input-editor", display: "block" },
    token: { tag: "ui-token-input-token", context: tokenOf },
    "token-remove": { tag: "ui-token-input-token-remove", context: tokenOf },
  })
}

const contentMode = (el: TokenInputElement) =>
  el.renderToken
    ? "renderToken"
    : el.querySelector(":scope > template")
      ? "template"
      : "label"

// Renders each token's content into its host, from `renderToken` or the template.
function renderTokens(
  el: TokenInputElement,
  api: TokenInputApi,
  rendered: WeakMap<HTMLElement, Token>
) {
  const template = el.querySelector<HTMLTemplateElement>(":scope > template")
  for (const { token, host } of api.internal.hosts()) {
    if (rendered.get(host) === token) {
      continue
    }
    rendered.set(host, token)
    if (el.renderToken) {
      el.renderToken(token, host)
      continue
    }
    if (!template) {
      continue
    }
    if (!host.firstChild) {
      host.append(template.content.cloneNode(true))
    }
    for (const label of host.querySelectorAll("[data-token-label]")) {
      label.textContent = token.label
    }
  }
}

export { defineTokenInputElements }
