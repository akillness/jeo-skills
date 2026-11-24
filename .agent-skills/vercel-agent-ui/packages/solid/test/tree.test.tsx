import { render } from "@solidjs/web"
import { createSignal, flush } from "solid-js"
import { expect, test } from "vitest"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "../src/tree"

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(code, root)
  flush()
  return {
    root,
    dispose() {
      dispose()
      root.remove()
    },
  }
}

test("a group makes its item's label and indicator a branch's, wherever it renders", () => {
  const { root, dispose } = mount(() => (
    <Tree aria-label="Docs" defaultExpanded={["guides", "api"]}>
      <TreeItem value="guides">
        <TreeItemLabel>
          <TreeItemIndicator />
          guides
        </TreeItemLabel>
        <TreeGroup>
          <TreeItem value="guides/start">
            <TreeItemLabel>
              <TreeItemIndicator />
              start.md
            </TreeItemLabel>
          </TreeItem>
        </TreeGroup>
      </TreeItem>
      <TreeItem value="api">
        <TreeGroup />
        <TreeItemLabel>
          <TreeItemIndicator />
          api
        </TreeItemLabel>
      </TreeItem>
    </Tree>
  ))
  const [guides, start, api] = root.querySelectorAll('[data-slot="tree-label"]')
  for (const label of [guides, api]) {
    for (const part of [label, label.firstElementChild!]) {
      expect(part.hasAttribute("data-branch")).toBe(true)
      expect(part.hasAttribute("data-expanded")).toBe(true)
    }
  }
  for (const part of [start, start.firstElementChild!]) {
    expect(part.hasAttribute("data-branch")).toBe(false)
    expect(part.hasAttribute("data-expanded")).toBe(false)
  }
  dispose()
})

test("an item's label follows its disabled prop", () => {
  const [disabled, setDisabled] = createSignal(false)
  const { root, dispose } = mount(() => (
    <Tree aria-label="Docs">
      <TreeItem value="readme" disabled={disabled()}>
        <TreeItemLabel>README.md</TreeItemLabel>
      </TreeItem>
    </Tree>
  ))
  const label = root.querySelector('[data-slot="tree-label"]')!
  expect(label.hasAttribute("data-disabled")).toBe(false)
  setDisabled(true)
  flush()
  expect(label.hasAttribute("data-disabled")).toBe(true)
  dispose()
})
