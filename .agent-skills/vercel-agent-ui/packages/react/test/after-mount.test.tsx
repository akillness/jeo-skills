// @vitest-environment jsdom
// Every option and slot prop follows a change after the first render, in
// React's own components, as in packages/core/test/after-mount.test.ts.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test } from "vitest"
import {
  baseOptions,
  type Built,
  changesOf,
  idle,
  pageOf,
  partsOf,
  tabStopProblem,
  title,
  withAttribute,
} from "../../core/test/after-mount"
import { cases, type Case } from "../../core/test/after-mount.cases"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []

// Every part React ships, by its export name.
const components = new Map<
  string,
  React.ComponentType<Record<string, unknown>>
>()
for (const module of Object.values(
  import.meta.glob("../src/*.tsx", { eager: true })
)) {
  for (const [name, value] of Object.entries(
    module as Record<string, unknown>
  )) {
    if (typeof value === "function" && /^[A-Z]/.test(name)) {
      components.set(
        name,
        value as React.ComponentType<Record<string, unknown>>
      )
    }
  }
}

const reactIds = /«[^»]*»|:r[0-9a-z]+:|_r_[0-9a-z]+_|mount-\d+/g

// React spells a few attributes its own way.
const reactName: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
}

function element(node: Built, key: number): React.ReactNode {
  if (typeof node === "string") {
    return node
  }
  const children = node.children.map(element)
  const props = Object.fromEntries(
    Object.entries(node.props).map(([name, value]) => [
      reactName[name] ?? name,
      value,
    ])
  )
  const type = node.part
    ? components.get(node.part)!
    : (node.tag ?? React.Fragment)
  return React.createElement(
    type,
    node.part || node.tag ? { ...props, key } : { key },
    ...children
  )
}

const tree = (entry: Case, markup: string, options: Record<string, unknown>) =>
  partsOf(entry, markup, options, (name) => components.has(name)).map(element)

let root: Root | undefined
let container: HTMLElement | undefined

async function render(
  entry: Case,
  markup: string,
  options: Record<string, unknown>
) {
  container ??= document.body.appendChild(document.createElement("div"))
  root ??= createRoot(container)
  await React.act(async () => root!.render(tree(entry, markup, options)))
  await React.act(idle)
  return container
}

async function unmount() {
  await React.act(async () => root?.unmount())
  root = undefined
  container = undefined
  document.body.replaceChildren()
}

afterEach(unmount)

for (const entry of cases) {
  describe(entry.name, () => {
    const { changes } = changesOf(entry)
    for (const change of changes) {
      test.skipIf(title(change) in (entry.skip ?? {}))(
        title(change),
        async () => {
          const base = baseOptions(entry, change)
          const markupAt = (value: unknown) =>
            change.kind === "prop"
              ? withAttribute(entry.markup, change, value)
              : entry.markup
          const optionsAt = (value: unknown) =>
            change.kind === "option" ? { ...base, [change.key]: value } : base

          const fresh = await render(
            entry,
            markupAt(change.to),
            optionsAt(change.to)
          )
          const expected = pageOf(fresh, entry.history, reactIds)
          const freshProblem = tabStopProblem({ root: fresh })
          await unmount()

          const changed = await render(
            entry,
            markupAt(change.from),
            optionsAt(change.from)
          )
          await render(entry, markupAt(change.to), optionsAt(change.to))
          expect(pageOf(changed, entry.history, reactIds)).toEqual(expected)
          if (entry.history?.includes("stop") && !freshProblem) {
            expect(tabStopProblem({ root: changed })).toBeUndefined()
          }
        }
      )
    }
  })
}
