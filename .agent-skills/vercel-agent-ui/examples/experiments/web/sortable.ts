import { createParts } from "@ui-sdk/web"
import { sortable } from "../sortable"

function arrange(list: HTMLElement, instance: ReturnType<typeof sortable>) {
  const items = new Map<string, Element>()
  for (const child of list.children) {
    if (child.localName === "ui-sortable-item") {
      items.set(child.getAttribute("value") ?? "", child)
    }
  }
  let next = items.values().next().value ?? null
  for (const [index, key] of instance.api.reorder
    .order(instance.get())
    .entries()) {
    const item = items.get(key)
    if (!item) {
      continue
    }
    if (item === next) {
      next = item.nextElementSibling
    } else {
      list.insertBefore(item, next)
    }
    item.querySelector("[data-position]")?.replaceChildren(String(index + 1))
  }
}

createParts(sortable, {
  root: {
    tag: "ui-sortable",
    render: (el, instance) => instance.subscribe(() => arrange(el, instance)),
  },
  item: "ui-sortable-item",
  handle: "ui-sortable-handle",
  instructions: "ui-sortable-instructions",
})

const tracks: Record<
  string,
  { title: string; artist: string; length: string }
> = {
  t1: { title: "Northern Lights", artist: "Halden", length: "3:42" },
  t2: { title: "Glass Harbor", artist: "Mira Vale", length: "4:05" },
  t3: { title: "Copper Sky", artist: "The Fieldnotes", length: "2:58" },
  t4: { title: "Ash and Ember", artist: "Halden", length: "3:17" },
  t5: { title: "Slow Tide", artist: "Oona Reyes", length: "5:01" },
  t6: { title: "Paper Moons", artist: "Mira Vale", length: "3:33" },
}

const photos: Record<string, { label: string; tone: string }> = {
  p1: { label: "Dunes", tone: "#f97316" },
  p2: { label: "Fjord", tone: "#6366f1" },
  p3: { label: "Meadow", tone: "#10b981" },
  p4: { label: "Dusk", tone: "#9333ea" },
  p5: { label: "Glacier", tone: "#0ea5e9" },
  p6: { label: "Canyon", tone: "#dc2626" },
  p7: { label: "Forest", tone: "#15803d" },
  p8: { label: "Harbor", tone: "#475569" },
  p9: { label: "Lagoon", tone: "#0891b2" },
}

const grip = [4, 8, 12]
  .flatMap((y) =>
    [6, 10].map((x) => `<circle cx="${x}" cy="${y}" r="1.2"></circle>`)
  )
  .join("")

const track = (key: string, index: number) => `
  <ui-sortable-item value="${key}">
    <ui-sortable-handle>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">${grip}</svg>
    </ui-sortable-handle>
    <span data-slot="sortable-index" data-position>${index + 1}</span>
    <span data-slot="stack">
      <span>${tracks[key].title}</span>
      <span data-slot="hint">${tracks[key].artist}</span>
    </span>
    <span data-slot="hint">${tracks[key].length}</span>
  </ui-sortable-item>`

const photo = (key: string) => `
  <ui-sortable-item value="${key}" style="--tone: ${photos[key].tone}">${photos[key].label}</ui-sortable-item>`

function mount(root: HTMLElement) {
  const order = Object.keys(tracks)
  root.innerHTML = `
    <div data-slot="sortable-layout">
      <div data-slot="stack">
        <div data-slot="row">
          <button type="button" data-size="sm" data-sort>Sort by title</button>
          <button type="button" data-size="sm" data-reverse>Reverse</button>
        </div>
        <ui-sortable value="${order}" aria-label="Playlist">
          ${order.map(track).join("")}
          <ui-sortable-instructions>
            Space picks up the focused track, or every selected track; then Up and Down move them, Space
            drops them and Escape puts them back. Shift with an arrow selects, Control or Command with A
            selects all.
          </ui-sortable-instructions>
        </ui-sortable>
      </div>
      <ui-sortable default-value="${Object.keys(photos)}" orientation="grid" aria-label="Photos">
        ${Object.keys(photos).map(photo).join("")}
        <ui-sortable-instructions>
          Space picks up the focused photo, or every selected photo; then the arrows move them, Space
          drops them and Escape puts them back.
        </ui-sortable-instructions>
      </ui-sortable>
    </div>
  `
  const playlist = root.querySelector("ui-sortable")!
  const playlistOrder = () => playlist.getAttribute("value")!.split(",")
  const setPlaylistOrder = (keys: string[]) =>
    playlist.setAttribute("value", keys.join(","))
  playlist.addEventListener("valuechange", (event) =>
    setPlaylistOrder((event as CustomEvent<{ value: string[] }>).detail.value)
  )
  root
    .querySelector("[data-sort]")!
    .addEventListener("click", () =>
      setPlaylistOrder(
        playlistOrder().sort((a, b) =>
          tracks[a].title.localeCompare(tracks[b].title)
        )
      )
    )
  root
    .querySelector("[data-reverse]")!
    .addEventListener("click", () =>
      setPlaylistOrder(playlistOrder().reverse())
    )
}

export { mount }
