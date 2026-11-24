import { treeFromPaths, type TreeItemData } from "@ui-sdk/core/tree"
import "@ui-sdk/web/tree"
import { ChevronRight, createElement, LoaderCircle } from "lucide"
import { log } from "../../../shared/web/log"

const paths = [
  "src/index.ts",
  "src/lib/format.ts",
  "src/lib/parse.ts",
  "src/routes/home.tsx",
  "src/routes/about.tsx",
  "tests/",
  "package.json",
  "tsconfig.json",
]

const items = treeFromPaths(paths)
const files = new Set(paths.filter((path) => !path.endsWith("/")))

function markup(items: TreeItemData[]) {
  let html = ""
  for (const item of items) {
    html += `
      <ui-tree-item value="${item.value}">
        <ui-tree-item-label>
          ${
            item.children
              ? `<ui-tree-item-indicator>${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}</ui-tree-item-indicator>`
              : ""
          }
          <span>${item.label}</span>
          ${createElement(LoaderCircle, { "aria-hidden": "true", "data-show": "pending" }).outerHTML}
        </ui-tree-item-label>
        ${item.children ? `<ui-tree-group>${markup(item.children)}</ui-tree-group>` : ""}
      </ui-tree-item>`
  }
  return html
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tree aria-label="Project" default-expanded="src" default-value="src/index.ts" activation="automatic">
      ${markup(items)}
    </ui-tree>
  `
  const tree = root.querySelector("ui-tree")!
  tree.paths = paths
  tree.addEventListener("action", (event) => {
    const { value, waitUntil } = event.detail
    if (!files.has(value)) {
      return
    }
    waitUntil(
      new Promise((resolve) => setTimeout(resolve, 600)).then(() =>
        log(root, `Opened ${value}`)
      )
    )
  })
}

export { mount }
