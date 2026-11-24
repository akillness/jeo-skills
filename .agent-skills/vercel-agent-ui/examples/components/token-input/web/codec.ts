import "@ui-sdk/web/field"
import { fromText, toText, type TokenCodec } from "@ui-sdk/web/token-input"
import { log } from "../../../shared/web/log"

const chat: TokenCodec = {
  format: (token) => `<@${token.value}>`,
  parse: (text) =>
    text.split(/(<@[\w.-]+>)/).map((part) => {
      const id = /^<@([\w.-]+)>$/.exec(part)?.[1]
      return id ? { type: "mention", value: id, label: `@${id}` } : part
    }),
}

const draft = fromText("Ping <@hollis> and <@ines> about the launch", chat)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Message</ui-field-label>
    </ui-field>
  `
  const message = document.createElement("ui-token-input")
  message.codec = chat
  message.setAttribute("copy", "label")
  message.defaultValue = draft
  message.innerHTML = `<ui-token-input-editor></ui-token-input-editor>`
  message.addEventListener("valuechange", (event) =>
    log(root, toText(event.detail.value, chat))
  )
  root.querySelector("ui-field")!.append(message)
}

export { mount }
