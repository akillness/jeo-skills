import "@ui-sdk/web/tree"
import {
  ChevronRight,
  createElement,
  LoaderCircle,
  RotateCw,
  type IconNode,
} from "lucide"

type Node = { value: string; label: string; branch?: boolean }

const top: Node[] = [
  { value: "users", label: "users", branch: true },
  { value: "orders", label: "orders", branch: true },
  { value: "archive", label: "archive", branch: true },
]

let archiveAsked = false
async function fetchChildren(value: string, signal: AbortSignal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800)
    signal.addEventListener(
      "abort",
      () => (clearTimeout(timer), reject(signal.reason))
    )
  })
  if (value === "archive" && !archiveAsked) {
    archiveAsked = true
    throw new Error("Network error")
  }
  return Array.from({ length: 3 }, (_, index) => ({
    value: `${value}/${index + 1}`,
    label: `${value.slice(0, -1)}_${index + 1}.json`,
  }))
}

const icon = (node: IconNode, show: string) =>
  createElement(node, { "aria-hidden": "true", "data-show": show }).outerHTML

const markup = (items: Node[]) =>
  items
    .map(
      (item) => `
        <ui-tree-item value="${item.value}"${item.branch ? " branch" : ""}>
          <ui-tree-item-label>
            ${
              item.branch
                ? `<ui-tree-item-indicator>
                    ${icon(LoaderCircle, "loading")}
                    ${icon(RotateCw, "failed")}
                    ${icon(ChevronRight, "idle")}
                  </ui-tree-item-indicator>`
                : ""
            }
            ${item.label}
          </ui-tree-item-label>
        </ui-tree-item>`
    )
    .join("")

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tree aria-label="Database">
      ${markup(top)}
    </ui-tree>
  `
  const tree = root.querySelector("ui-tree")!
  tree.loadChildren = async (value, { signal }) => {
    const children = await fetchChildren(value, signal)
    tree
      .querySelector(`ui-tree-item[value="${value}"]`)!
      .insertAdjacentHTML(
        "beforeend",
        `<ui-tree-group>${markup(children)}</ui-tree-group>`
      )
  }
  tree.announcement = ({ type, label }) =>
    ({
      expanded: "Expanded",
      collapsed: "Collapsed",
      loading: `Loading ${label}`,
      "load-failed": `${label} didn't load. Try again.`,
    })[type]
}

export { mount }
