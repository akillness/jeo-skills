import { fuzzyScore } from "@ui-sdk/core/text-match"
import "@ui-sdk/web/command"

const commands = Array.from({ length: 10_000 }, (_, index) => ({
  value: `command-${index + 1}`,
  label: `Command ${index + 1}`,
}))

const row = 32

function rank(query: string) {
  if (!query.trim()) {
    return commands
  }
  return commands
    .map((item) => ({ item, score: fuzzyScore(item.label, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-command>
      <ui-command-input>
        <input aria-label="Search 10,000 commands" placeholder="Search 10,000 commands…" />
      </ui-command-input>
      <ui-command-list>
        <div aria-hidden="true"></div>
      </ui-command-list>
    </ui-command>
  `
  const command = root.querySelector("ui-command") as HTMLElement & {
    items: typeof commands
  }
  const list = root.querySelector<HTMLElement>("ui-command-list")!
  const spacer = list.querySelector<HTMLElement>("div")!

  let matches = commands

  const rendered = new Map<string, HTMLElement>()
  const render = () => {
    spacer.style.height = `${matches.length * row}px`
    const start = Math.max(0, Math.floor(list.scrollTop / row) - 4)
    const end = Math.min(
      matches.length,
      Math.ceil((list.scrollTop + list.clientHeight) / row) + 4
    )
    const visible = new Map(
      matches
        .slice(start, end)
        .map((item, offset) => [item.value, start + offset])
    )
    for (const [value, el] of rendered) {
      if (visible.has(value)) {
        continue
      }
      el.remove()
      rendered.delete(value)
    }
    for (const [value, index] of visible) {
      const existing = rendered.get(value)
      if (existing) {
        existing.setAttribute("index", String(index))
        existing.style.top = `${index * row}px`
        continue
      }
      const item = matches[index]
      list.insertAdjacentHTML(
        "beforeend",
        `<ui-command-item value="${item.value}" label="${item.label}" index="${index}" style="top: ${index * row}px">${item.label}</ui-command-item>`
      )
      rendered.set(value, list.lastElementChild as HTMLElement)
    }
  }
  render()
  command.items = commands
  list.addEventListener("scroll", render)
  command.addEventListener("querychange", (event) => {
    matches = rank((event as CustomEvent<{ value: string }>).detail.value)
    render()
  })
  command.addEventListener("valuechange", (event) => {
    const { index } = (
      event as CustomEvent<{ value: string | null; index: number }>
    ).detail
    if (index < 0) {
      return
    }
    const top = index * row
    if (top < list.scrollTop) {
      list.scrollTop = top
    } else if (top + row > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + row - list.clientHeight
    }
    render()
  })
}

export { mount }
