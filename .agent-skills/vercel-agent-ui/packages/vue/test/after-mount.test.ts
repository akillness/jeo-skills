// @vitest-environment jsdom
// Every option and slot prop follows a change after the first render, in
// Vue's own components, as in packages/core/test/after-mount.test.ts.
import { afterEach, describe, expect, test } from "vitest"
import {
  createApp,
  defineComponent,
  Fragment,
  h,
  nextTick,
  shallowRef,
  type App,
  type VNodeChild,
} from "vue"
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

Element.prototype.getAnimations ??= () => []

const components = new Map<string, object>()
for (const module of Object.values(
  import.meta.glob("../src/*.ts", { eager: true })
)) {
  for (const [name, value] of Object.entries(
    module as Record<string, unknown>
  )) {
    if (
      /^[A-Z]/.test(name) &&
      (typeof value === "function" ||
        (value &&
          typeof value === "object" &&
          ("setup" in value || "render" in value)))
    ) {
      components.set(name, value)
    }
  }
}

const vueIds = /v-\d+(-\d+)*|v:[0-9a-z:]+|mount-\d+/g

function vnode(node: Built): VNodeChild {
  if (typeof node === "string") {
    return node
  }
  const children = () => node.children.map(vnode)
  if (node.part) {
    return h(components.get(node.part) as never, node.props, {
      default: children,
    })
  }
  if (node.tag) {
    return h(node.tag, node.props, children())
  }
  return h(Fragment, children())
}

let app: App | undefined
let container: HTMLElement | undefined
const shown = shallowRef<{
  entry: Case
  markup: string
  options: Record<string, unknown>
}>()

async function render(
  entry: Case,
  markup: string,
  options: Record<string, unknown>
) {
  shown.value = { entry, markup, options }
  if (!app) {
    container = document.body.appendChild(document.createElement("div"))
    app = createApp(
      defineComponent(() => () => {
        const { entry, markup, options } = shown.value!
        return partsOf(entry, markup, options, (name) =>
          components.has(name)
        ).map(vnode)
      })
    )
    app.mount(container)
  }
  await nextTick()
  await idle()
  await nextTick()
  return container!
}

function unmount() {
  app?.unmount()
  app = undefined
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
          const expected = pageOf(fresh, entry.history, vueIds)
          const freshProblem = tabStopProblem({ root: fresh })
          unmount()

          const changed = await render(
            entry,
            markupAt(change.from),
            optionsAt(change.from)
          )
          await render(entry, markupAt(change.to), optionsAt(change.to))
          expect(pageOf(changed, entry.history, vueIds)).toEqual(expected)
          if (entry.history?.includes("stop") && !freshProblem) {
            expect(tabStopProblem({ root: changed })).toBeUndefined()
          }
        }
      )
    }
  })
}
