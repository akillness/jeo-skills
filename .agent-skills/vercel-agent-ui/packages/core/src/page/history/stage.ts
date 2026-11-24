// Trying changes on the page and taking them back: an agent's suggestion
// shown on the real control while a person looks at it, a preview of a
// preset, a "what would this look like". The values go on through the bridge,
// like any agent step, and `revert` puts back what each control had.
import type { AgentComponent, createAgent } from "../agent/agent"
import { entries as registered, setterOf } from "../observe/registry"

/**
 * One value to put on a control: its ref or label, the key, and the value.
 * @experimental
 */
type StagedChange = { ref: string; key?: string; value: unknown }

/**
 * Puts values on the page's controls through the agent bridge, and returns
 * how to take them back. `key` defaults to `"value"`, set with the
 * component's `set<Key>` action. Changes that can't run are skipped, and
 * `revert` restores only the ones that did, in reverse order, and resolves
 * with the ones it couldn't put back, like a password field's, whose value
 * before reads `"[redacted]"`.
 *
 * ```ts
 * const staged = await stageChanges(agent, [{ ref: "Volume", value: 80 }, { ref: "Theme", value: "dark" }])
 * // later
 * await staged.revert()
 * ```
 * @experimental
 */
async function stageChanges(
  agent: ReturnType<typeof createAgent>,
  changes: readonly StagedChange[]
) {
  const onPage = (list: AgentComponent[] | { error: string }) =>
    Array.isArray(list)
      ? list.filter((c) => !c.offPage && c.component !== "more")
      : []
  const components = onPage(agent.snapshot())
  // A long page's snapshot stops at its limit, so a control past it is looked up by ref, then name.
  const find = async (ref: string) => {
    const match = (list: AgentComponent[]) =>
      list.find((c) => c.ref === ref) ?? list.find((c) => c.label === ref)
    return (
      match(components) ??
      match(onPage(await agent.query({ within: ref }))) ??
      match(onPage(await agent.query({ text: ref })))
    )
  }
  const applied: {
    ref: string
    key: string
    before: unknown
    value: unknown
  }[] = []
  for (const change of changes) {
    const component = await find(change.ref)
    const key = change.key ?? "value"
    if (!component || !component.actions.includes(setterOf(key))) {
      continue
    }
    const result = await agent.act({
      steps: [
        { ref: component.ref, action: setterOf(key), args: [change.value] },
      ],
    })
    if (result.ok) {
      applied.push({
        ref: component.ref,
        key,
        before: component[key],
        value: change.value,
      })
    }
  }
  let reverted = false
  return {
    /** The changes that went on, each with the value it replaced. */
    applied: applied as readonly {
      ref: string
      key: string
      before: unknown
      value: unknown
    }[],
    /** Puts back what each control had, and resolves with the changes it couldn't. Runs once. */
    async revert() {
      if (reverted) {
        return []
      }
      reverted = true
      const failed: typeof applied = []
      for (const change of [...applied].reverse()) {
        const { ref, key, before } = change
        // A secret field's value before is hidden, and "[redacted]" would land in it.
        const hidden = before === "[redacted]" && !!registered.get(ref)?.secret
        const done =
          !hidden &&
          (
            await agent.act({
              steps: [{ ref, action: setterOf(key), args: [before] }],
            })
          ).ok
        if (!done) {
          failed.push(change)
        }
      }
      return failed
    },
  }
}

export { stageChanges, type StagedChange }
