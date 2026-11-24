import "@ui-sdk/web/trigger-menu"
import { toText, type Token } from "@ui-sdk/web/token-input"
import { ArrowUp, Check, Clock, Code, createElement, File, X } from "lucide"
import { log } from "../../../shared/web/log"

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
  { value: "package.json", label: "package.json" },
]

const skills = [
  {
    value: "search",
    label: "search",
    arguments: [{ name: "query", hint: "<query>", required: true }],
  },
  { value: "review", label: "review" },
  { value: "summarize", label: "summarize" },
]

const loadFile = () => new Promise<void>((resolve) => setTimeout(resolve, 800))

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form>
      <ui-token-input>
        <div data-slot="card">
          <ui-token-input-editor aria-label="Prompt" placeholder="Ask anything. Type @ or /"></ui-token-input-editor>
          <div data-slot="row">
            <button type="button" data-size="sm">Attach README</button>
            <button type="submit" data-variant="solid" data-size="sm" data-shape="round" aria-label="Send">
              ${createElement(ArrowUp, { "aria-hidden": "true" }).outerHTML}
            </button>
          </div>
        </div>
        <ui-trigger-menu>
          <ui-trigger-menu-hint></ui-trigger-menu-hint>
          <ui-trigger-menu-content>
            <ui-trigger-menu-empty>No matches</ui-trigger-menu-empty>
            <ui-trigger-menu-list></ui-trigger-menu-list>
          </ui-trigger-menu-content>
        </ui-trigger-menu>
      </ui-token-input>
    </form>
  `
  const input = root.querySelector("ui-token-input")!
  const prompt = input.api
  const menu = root.querySelector("ui-trigger-menu")!
  const [attach, send] = root.querySelectorAll("button")
  let running = false
  let sendTimer: ReturnType<typeof setTimeout> | undefined

  input.renderToken = (token, host) => {
    host.innerHTML = `
      <ui-token-input-token>
        ${createElement(token.type === "skill" ? Code : File, { "aria-hidden": "true" }).outerHTML}
        <span></span>
        ${token.data?.run === "running" ? createElement(Clock, { "aria-hidden": "true" }).outerHTML : ""}
        ${token.data?.run === "done" ? createElement(Check, { "aria-hidden": "true" }).outerHTML : ""}
        <ui-token-input-token-remove>${createElement(X, { "aria-hidden": "true" }).outerHTML}</ui-token-input-token-remove>
      </ui-token-input-token>
    `
    host.querySelector("span")!.textContent =
      token.type === "skill" ? `/${token.label}` : token.label
  }
  menu.triggers = [
    { char: "@", type: "file", items: files },
    { char: "/", boundary: "start", type: "skill", items: skills },
  ]
  menu.addEventListener("itemselect", (event) => {
    if (event.detail.trigger === "@") {
      event.detail.waitUntil(loadFile())
    }
  })

  const setRunning = (next: boolean) => {
    running = next
    send.disabled = next
    send.setAttribute("aria-label", next ? "Running" : "Send")
    send.innerHTML = createElement(next ? Clock : ArrowUp, {
      "aria-hidden": "true",
    }).outerHTML
  }

  attach.addEventListener("mousedown", (event) => event.preventDefault())
  attach.addEventListener("click", () =>
    prompt.insert(
      { type: "file", value: "README.md", label: "README.md" },
      { resolve: loadFile() }
    )
  )
  root.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault()
    if (running || !prompt.getLabel().trim()) {
      return
    }
    setRunning(true)
    const skillTokens = prompt
      .getValue()
      .filter(
        (segment): segment is Token =>
          typeof segment !== "string" && segment.type === "skill"
      )
    for (const skill of skillTokens) {
      prompt.updateToken(skill.id!, { data: { ...skill.data, run: "running" } })
    }
    sendTimer = setTimeout(() => {
      for (const skill of skillTokens) {
        prompt.updateToken(skill.id!, { data: { ...skill.data, run: "done" } })
      }
      log(root, `Sent ${toText(prompt.getValue())}`)
      prompt.clear()
      setRunning(false)
    }, 1500)
  })

  return () => clearTimeout(sendTimer)
}

export { mount }
