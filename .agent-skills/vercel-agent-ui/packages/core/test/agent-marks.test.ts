// @vitest-environment jsdom
// The marks an app writes for the agent bridge: `data-agent-confirm` leaves a
// change to a person, `data-agent-hidden` keeps a region from agents, and
// `data-agent-secret` keeps values from the model. `bind` from the kernel
// stands in for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import { button } from "../src/components/button/button"
import { combobox } from "../src/components/combobox/combobox"
import { dialog } from "../src/components/dialog/dialog"
import { input } from "../src/components/input/input"
import { listbox } from "../src/components/listbox/listbox-root"
import { select } from "../src/components/select/select"
import { toggle } from "../src/components/toggle/toggle"
import { toggleGroup } from "../src/components/toggle/toggle-group"
import { tree } from "../src/components/tree/tree"
import { attrs, bind } from "../src/foundation/kernel/part"
import { createAgent, registerTools } from "../src/page/agent/agent"
import { observe, type ObservedChange } from "../src/page/observe/observe"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

// A Button with its text, inside `parent`, which a test marks.
function mountButton(text: string, parent: HTMLElement = document.body) {
  const instance = button({ id: text })
  const el = document.createElement("button")
  el.textContent = text
  const onClick = vi.fn()
  el.addEventListener("click", onClick)
  parent.append(el)
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  return { el, onClick }
}

// An input with a label, inside `parent`.
function mountInput(
  label: string,
  parent: HTMLElement = document.body,
  onValueChange = vi.fn()
) {
  const instance = input({ id: label, onValueChange })
  const el = document.createElement("input")
  el.setAttribute("aria-label", label)
  parent.append(el)
  const unbind = bind(instance.part("root"), el)
  let mounted = true
  const unmount = () => {
    if (!mounted) {
      return
    }
    mounted = false
    unbind()
    instance.destroy()
  }
  cleanups.push(unmount)
  return { instance, unmount }
}

// The components on the page now. Ones earlier tests took off it stay listed with `offPage`.
const onPage = (agent: ReturnType<typeof createAgent>) =>
  agent.snapshot().filter((component) => !component.offPage)

// A region with one mark.
function region(mark: string, value = "") {
  const el = document.createElement("section")
  el.setAttribute(mark, value)
  document.body.append(el)
  return el
}

describe("data-agent-confirm", () => {
  test("without allow, a marked press fails, says what it does and leaves the click to the person", async () => {
    const agent = createAgent()
    const { el, onClick } = mountButton("Buy credits")
    el.setAttribute(
      "data-agent-confirm",
      "Charges $20 to your card for 1,000 credits"
    )
    const outcome = await agent.act({
      steps: [{ ref: "Buy credits", action: "press" }],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        step: 0,
        message:
          'Needs a person: "Charges $20 to your card for 1,000 credits". Ask them to press "Buy credits" themselves.',
      },
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  test("the snapshot says which component needs a person", () => {
    const agent = createAgent()
    mountButton("Buy credits").el.setAttribute(
      "data-agent-confirm",
      "Charges $20 to your card"
    )
    mountButton("Cancel")
    expect(agent.snapshot()).toEqual([
      expect.objectContaining({
        label: "Buy credits",
        confirm: "Charges $20 to your card",
      }),
      expect.not.objectContaining({ confirm: expect.anything() }),
    ])
  })

  test("with allow, a marked press waits for the answer and carries what it does", async () => {
    let answer = true
    const allow = vi.fn(async () => answer)
    const agent = createAgent({ allow })
    const { el, onClick } = mountButton("Buy credits")
    el.setAttribute("data-agent-confirm", "Charges $20 to your card")
    expect(
      await agent.act({ steps: [{ ref: "Buy credits", action: "press" }] })
    ).toMatchObject({ ok: true })
    expect(allow).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "press",
        confirm: "Charges $20 to your card",
      }),
      { signal: expect.any(AbortSignal) }
    )
    expect(onClick).toHaveBeenCalledTimes(1)
    answer = false
    expect(
      await agent.act({ steps: [{ ref: "Buy credits", action: "press" }] })
    ).toMatchObject({
      ok: false,
      error: { message: 'The person said no to "Charges $20 to your card".' },
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test("a mark on a region covers every control inside it, for any action", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    mountInput(
      "Billing email",
      region("data-agent-confirm", "Changes where invoices go"),
      onValueChange
    )
    const outcome = await agent.act({
      steps: [{ ref: "Billing email", action: "setValue", args: ["a@b.co"] }],
    })
    expect(outcome.error?.message).toBe(
      'Needs a person: "Changes where invoices go". Ask them to make this change themselves.'
    )
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("through WebMCP, a refusal by registerTools' allow isn't reported as the person's", async () => {
    const tools = new Map<
      string,
      { execute: (input: object) => Promise<{ ok: boolean }> }
    >()
    const registerTool = async (tool: {
      name: string
      execute: (input: object) => Promise<{ ok: boolean }>
    }) => {
      tools.set(tool.name, tool)
    }
    Object.assign(document, { modelContext: { registerTool } })
    const agent = createAgent({ allow: () => true })
    const { el, onClick } = mountButton("Buy credits")
    el.setAttribute("data-agent-confirm", "Charges $20")
    cleanups.push(
      registerTools(agent, { allow: (step) => step.action !== "press" }),
      () => Reflect.deleteProperty(document, "modelContext")
    )
    expect(
      await tools
        .get("act")!
        .execute({ steps: [{ ref: "Buy credits", action: "press" }] })
    ).toMatchObject({
      ok: false,
      error: {
        message: expect.stringMatching(/^The app refused press on c\d+\.$/),
      },
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  test("through WebMCP, registerTools' allow answers for the person", async () => {
    const tools = new Map<
      string,
      { execute: (input: object) => Promise<{ ok: boolean }> }
    >()
    const registerTool = async (tool: {
      name: string
      execute: (input: object) => Promise<{ ok: boolean }>
    }) => {
      tools.set(tool.name, tool)
    }
    Object.assign(document, { modelContext: { registerTool } })
    const allow = vi.fn(() => true)
    const { el, onClick } = mountButton("Buy credits")
    el.setAttribute("data-agent-confirm", "Charges $20")
    cleanups.push(registerTools(createAgent(), { allow }), () =>
      Reflect.deleteProperty(document, "modelContext")
    )
    expect(
      await tools
        .get("act")!
        .execute({ steps: [{ ref: "Buy credits", action: "press" }] })
    ).toMatchObject({
      ok: true,
    })
    expect(allow).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: "Charges $20" }),
      {
        signal: expect.any(AbortSignal),
      }
    )
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test("through WebMCP, a call the browser cancels stops waiting and frees the next call", async () => {
    const tools = new Map<
      string,
      {
        execute: (
          input: object,
          context?: { signal: AbortSignal }
        ) => Promise<{ ok: boolean; error?: { message: string } }>
      }
    >()
    Object.assign(document, {
      modelContext: {
        registerTool: async (tool: { name: string }) => {
          tools.set(tool.name, tool as never)
        },
      },
    })
    let signal: AbortSignal | undefined
    const { onClick } = mountButton("Buy credits")
    cleanups.push(
      registerTools(createAgent(), {
        allow: (_step, context) => {
          signal = context.signal
          return new Promise<boolean>(() => {})
        },
      }),
      () => Reflect.deleteProperty(document, "modelContext")
    )
    const browser = new AbortController()
    const call = tools
      .get("act")!
      .execute(
        { steps: [{ ref: "Buy credits", action: "press" }] },
        { signal: browser.signal }
      )
    await vi.waitFor(() => expect(signal).toBeDefined())
    browser.abort()
    expect((await call).error?.message).toMatch(
      /^press on c\d+ was cancelled\.$/
    )
    expect(signal?.aborted).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
    expect(await tools.get("query")!.execute({ kind: "button" })).toEqual(
      expect.any(Array)
    )
  })

  test("aborting act's signal ends a step waiting on allow, skips the rest and frees the next call", async () => {
    let signal: AbortSignal | undefined
    const agent = createAgent({
      allow: (_step, context) => {
        signal = context.signal
        return new Promise<boolean>(() => {})
      },
    })
    const buy = mountButton("Buy credits")
    const save = mountButton("Save")
    const stop = new AbortController()
    const call = agent.act(
      {
        steps: [
          { ref: "Buy credits", action: "press" },
          { ref: "Save", action: "press" },
        ],
      },
      { signal: stop.signal }
    )
    await vi.waitFor(() => expect(signal).toBeDefined())
    stop.abort()
    expect((await call).error).toEqual({
      step: 0,
      message: expect.stringMatching(/^press on c\d+ was cancelled\.$/),
    })
    expect(signal?.aborted).toBe(true)
    expect(buy.onClick).not.toHaveBeenCalled()
    expect(save.onClick).not.toHaveBeenCalled()
    expect(await agent.query({ kind: "button" })).toEqual(expect.any(Array))
  })

  test("act with a signal that already aborted runs no step", async () => {
    const agent = createAgent()
    const { onClick } = mountButton("Buy credits")
    const result = await agent.act(
      { steps: [{ ref: "Buy credits", action: "press" }] },
      { signal: AbortSignal.abort() }
    )
    expect(result.error).toEqual({
      step: 0,
      message: "press on Buy credits was cancelled.",
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a step nobody answers fails after the timeout, aborts allow's signal and frees the next call", async () => {
    let signal: AbortSignal | undefined
    const agent = createAgent({
      timeout: 50,
      allow: (_step, context) => {
        signal = context.signal
        return new Promise<boolean>(() => {})
      },
    })
    mountButton("Buy credits").el.setAttribute(
      "data-agent-confirm",
      "Charges $20"
    )
    const late = await agent.act({
      steps: [{ ref: "Buy credits", action: "press" }],
    })
    expect(late.error?.message).toMatch(
      /^No answer to press on c\d+ in 0 seconds\.$/
    )
    expect(signal?.aborted).toBe(true)
  })
})

describe("data-agent-confirm on items", () => {
  // A list with one item per value, the last marked, in an element named `label`.
  function mountList(
    label: string,
    instance: {
      part: (slot: never, props?: never) => never
      destroy: () => void
    },
    values: string[],
    slot = "item"
  ) {
    const root = document.body.appendChild(document.createElement("div"))
    root.setAttribute("aria-label", label)
    cleanups.push(bind(instance.part("root" as never), root), () =>
      instance.destroy()
    )
    for (const value of values) {
      const el = root.appendChild(document.createElement("div"))
      el.textContent = value
      if (value === values.at(-1)) {
        el.setAttribute("data-agent-confirm", `Grants ${value}`)
      }
      cleanups.push(bind(instance.part(slot as never, { value } as never), el))
    }
  }

  test("a listbox step that picks a marked option among others, or every option, needs a person", async () => {
    const agent = createAgent()
    const instance = listbox({ id: "roles", multiple: true })
    mountList("Roles", instance as never, ["viewer", "admin"])
    for (const step of [
      { ref: "Roles", action: "setValue", args: [["viewer", "admin"]] },
      { ref: "Roles", action: "selectAll" },
    ]) {
      const outcome = await agent.act({ steps: [step] })
      expect(outcome.error?.message).toBe(
        'Needs a person: "Grants admin". Ask them to make this change themselves.'
      )
    }
    const unknown = await agent.act({
      steps: [{ ref: "Roles", action: "setValue", args: [["owner"]] }],
    })
    expect(unknown.error?.message).toMatch(/^No item "owner" in Roles/)
    expect(instance.get().value).toEqual([])
  })

  test("a listbox step that takes a marked option out, by setValue or clear, needs a person", async () => {
    const agent = createAgent()
    const instance = listbox({
      id: "roles",
      multiple: true,
      defaultValue: ["viewer", "admin"],
    })
    mountList("Roles", instance as never, ["viewer", "admin"])
    for (const step of [
      { ref: "Roles", action: "setValue", args: [["viewer"]] },
      { ref: "Roles", action: "clear" },
    ]) {
      const outcome = await agent.act({ steps: [step] })
      expect(outcome.error?.message).toBe(
        'Needs a person: "Grants admin". Ask them to make this change themselves.'
      )
    }
    expect(instance.get().value).toEqual(["viewer", "admin"])
  })

  test("replacing one marked option with another shows both warnings to allow", async () => {
    const seen: (string | undefined)[] = []
    const agent = createAgent({
      allow: (step) => {
        seen.push(step.confirm)
        return step.confirm === "Grants viewer"
      },
    })
    const instance = listbox({ id: "roles", defaultValue: "viewer" })
    const root = document.body.appendChild(document.createElement("div"))
    root.setAttribute("aria-label", "Roles")
    cleanups.push(bind(instance.part("root"), root), () => instance.destroy())
    for (const value of ["viewer", "admin"]) {
      const el = root.appendChild(document.createElement("div"))
      el.textContent = value
      el.setAttribute("data-agent-confirm", `Grants ${value}`)
      cleanups.push(bind(instance.part("item", { value }), el))
    }
    const outcome = await agent.act({
      steps: [{ ref: "Roles", action: "setValue", args: ["admin"] }],
    })
    expect(seen).toEqual(["Grants viewer; Grants admin"])
    expect(outcome.error?.message).toBe(
      'The person said no to "Grants viewer; Grants admin".'
    )
    expect(instance.get().value).toBe("viewer")
  })

  test("a tree's setChecked with a marked row needs a person, and refuses a disabled one", async () => {
    const agent = createAgent()
    const instance = tree({
      id: "permissions",
      checkable: true,
      items: [
        { value: "read", label: "read" },
        { value: "locked", label: "locked", disabled: true },
        { value: "delete", label: "delete" },
      ],
    })
    mountList("Permissions", instance as never, ["read", "delete"])
    const marked = await agent.act({
      steps: [
        {
          ref: "Permissions",
          action: "setChecked",
          args: [["read", "delete"]],
        },
      ],
    })
    expect(marked.error?.message).toMatch(/^Needs a person: "Grants delete"/)
    const disabled = await agent.act({
      steps: [{ ref: "Permissions", action: "setChecked", args: [["locked"]] }],
    })
    expect(disabled.error?.message).toMatch(
      /^"locked" in Permissions \(c\d+\) is disabled now\.$/
    )
    expect(instance.get().checked).toEqual([])
  })

  test("a toggle group's step reads each toggle's own mark and disabled state", async () => {
    const agent = createAgent()
    const group = toggleGroup({ id: "format", multiple: true })
    const root = document.body.appendChild(document.createElement("div"))
    root.setAttribute("aria-label", "Format")
    cleanups.push(bind(group.part("group"), root), () => group.destroy())
    for (const [value, mark] of [
      ["bold", undefined],
      ["publish", "data-agent-confirm"],
      ["locked", "disabled"],
    ] as const) {
      const instance = toggle({
        id: value,
        value,
        disabled: mark === "disabled",
        group: () => group.api,
      })
      const el = root.appendChild(document.createElement("button"))
      el.textContent = value
      if (mark === "data-agent-confirm") {
        el.setAttribute(mark, "Publishes the post")
      }
      for (const [name, value] of Object.entries(
        attrs(instance.part("root"))
      )) {
        if (value !== undefined) {
          el.setAttribute(name, String(value))
        }
      }
      cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    }
    const marked = await agent.act({
      steps: [
        { ref: "Format", action: "setValue", args: [["bold", "publish"]] },
      ],
    })
    expect(marked.error?.message).toMatch(
      /^Needs a person: "Publishes the post"/
    )
    const disabled = await agent.act({
      steps: [{ ref: "Format", action: "setValue", args: [["locked"]] }],
    })
    expect(disabled.error?.message).toMatch(
      /^"locked" in Format \(c\d+\) is disabled now\.$/
    )
    expect(group.get().value).toEqual([])
  })

  test("a marked option that renders only while its select is open needs a person", async () => {
    const agent = createAgent()
    const content = document.body.appendChild(document.createElement("div"))
    const unbindItems: (() => void)[] = []
    const instance: ReturnType<typeof select> = select({
      id: "plan",
      onOpenChange: (open) => {
        unbindItems.splice(0).forEach((unbind) => unbind())
        content.replaceChildren()
        if (!open) {
          return
        }
        for (const value of ["Free", "Pro"]) {
          const item = content.appendChild(document.createElement("div"))
          item.textContent = value
          if (value === "Pro") {
            item.setAttribute("data-agent-confirm", "Charges $20 a month")
          }
          unbindItems.push(bind(instance.part("item", { value }), item))
        }
      },
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Plan")
    cleanups.push(bind(instance.part("trigger"), trigger), () => {
      unbindItems.forEach((unbind) => unbind())
      instance.destroy()
    })
    const outcome = await agent.act({
      steps: [{ ref: "Plan", action: "setValue", args: ["Pro"] }],
    })
    expect(outcome.error?.message).toMatch(
      /^Needs a person: "Charges \$20 a month"/
    )
    expect(instance.get().value).toBeNull()
  })

  // Options, "Pro" marked, that are in the page only while their list is open.
  function optionsWhileOpen(part: (value: string) => never) {
    const content = document.body.appendChild(document.createElement("div"))
    const unbinds: (() => void)[] = []
    cleanups.push(() => unbinds.forEach((unbind) => unbind()))
    return (open: boolean) => {
      unbinds.splice(0).forEach((unbind) => unbind())
      content.replaceChildren()
      for (const value of open ? ["Free", "Pro"] : []) {
        const item = content.appendChild(document.createElement("div"))
        item.textContent = value
        if (value === "Pro") {
          item.setAttribute("data-agent-confirm", "Charges $20 a month")
        }
        unbinds.push(bind(part(value), item))
      }
    }
  }

  async function choose(agent: ReturnType<typeof createAgent>, value: string) {
    return agent.act({
      steps: [{ ref: "Plan", action: "setValue", args: [value] }],
    })
  }

  test("a select with items data still reads the mark on an option that renders while it's open", async () => {
    const agent = createAgent()
    const instance: ReturnType<typeof select> = select({
      id: "plan",
      items: ["Free", "Pro"],
      onOpenChange: optionsWhileOpen(
        (value) => instance.part("item", { value }) as never
      ),
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Plan")
    cleanups.push(bind(instance.part("trigger"), trigger), () =>
      instance.destroy()
    )
    const marked = await choose(agent, "Pro")
    expect(marked.error?.message).toMatch(
      /^Needs a person: "Charges \$20 a month"/
    )
    expect(instance.get().value).toBeNull()
    const free = await choose(agent, "Free")
    expect(free.ok, free.error?.message).toBe(true)
    expect(instance.get()).toMatchObject({ value: "Free", open: false })
  })

  test("a select whose values are numbers keeps an option's mark and disabled state when it's named by its label", async () => {
    const agent = createAgent()
    const instance: ReturnType<typeof select> = select({
      id: "plan",
      items: [
        { value: 1, label: "Free" },
        { value: 2, label: "Pro" },
        { value: 3, label: "Team", disabled: true },
      ],
      defaultValue: 1,
      onOpenChange: optionsWhileOpen(
        (value) =>
          instance.part("item", {
            value: value === "Free" ? 1 : 2,
          }) as never
      ),
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Plan")
    cleanups.push(bind(instance.part("trigger"), trigger), () =>
      instance.destroy()
    )
    const marked = await choose(agent, "Pro")
    expect(marked.error?.message).toMatch(
      /^Needs a person: "Charges \$20 a month"/
    )
    const disabled = await choose(agent, "Team")
    expect(disabled.error?.message).toMatch(
      /^"Team" in Plan \(c\d+\) is disabled now\.$/
    )
    expect(instance.get()).toMatchObject({ value: 1, open: false })
  })

  test("a combobox's empty-query suggestion still reads the mark on its option, with no items of its own", async () => {
    const agent = createAgent()
    const instance: ReturnType<typeof combobox> = combobox({
      id: "plan",
      items: [],
      emptyItems: ["Free", "Pro"],
      onOpenChange: optionsWhileOpen(
        (value) => instance.part("item", { value }) as never
      ),
    })
    const field = document.body.appendChild(document.createElement("input"))
    field.setAttribute("aria-label", "Plan")
    cleanups.push(bind(instance.part("input"), field), () => instance.destroy())
    const marked = await choose(agent, "Pro")
    expect(marked.error?.message).toMatch(
      /^Needs a person: "Charges \$20 a month"/
    )
    expect(instance.get().value).toBeNull()
    const free = await choose(agent, "Free")
    expect(free.ok, free.error?.message).toBe(true)
    expect(instance.get()).toMatchObject({ value: "Free", open: false })
  })
})

describe("empty-query suggestions", () => {
  // A combobox of "Basic", with "Free" and "Pro" suggested while its query is
  // empty, "Pro" marked. Options are in the page only while the list is open,
  // and with `late`, the ones after the first mount a moment later.
  function plans(late = false) {
    const content = document.body.appendChild(document.createElement("div"))
    const unbinds: (() => void)[] = []
    cleanups.push(() => unbinds.forEach((unbind) => unbind()))
    const instance: ReturnType<typeof combobox> = combobox({
      id: "plan",
      items: ["Basic"],
      emptyItems: ["Free", "Pro"],
      onOpenChange: (open) => {
        unbinds.splice(0).forEach((unbind) => unbind())
        content.replaceChildren()
        const query = instance.get().query
        const shown = !open ? [] : query ? ["Basic"] : ["Free", "Pro"]
        shown.forEach((value, index) => {
          const add = () => {
            const item = content.appendChild(document.createElement("div"))
            item.textContent = value
            if (value === "Pro") {
              item.setAttribute("data-agent-confirm", "Charges $20 a month")
            }
            unbinds.push(bind(instance.part("item", { value }), item))
          }
          if (late && index) {
            setTimeout(add, 30)
          } else {
            add()
          }
        })
      },
    })
    const field = document.body.appendChild(document.createElement("input"))
    field.setAttribute("aria-label", "Plan")
    cleanups.push(bind(instance.part("input"), field), () => instance.destroy())
    return instance
  }

  test("one a query hides isn't chosen, since its marks can't be read", async () => {
    const instance = plans()
    const agent = createAgent()
    const outcome = await agent.act({
      steps: [
        { ref: "Plan", action: "setQuery", args: ["ba"] },
        { ref: "Plan", action: "setValue", args: ["Pro"] },
      ],
    })
    expect(outcome.error?.message).toMatch(
      /^"Pro" isn't shown in Plan \(\w+\) now\./
    )
    expect(instance.get().value).toBeNull()
  })

  test("a marked one that mounts after the list opens still needs a person", async () => {
    const instance = plans(true)
    const agent = createAgent()
    const outcome = await agent.act({
      steps: [{ ref: "Plan", action: "setValue", args: ["Pro"] }],
    })
    expect(outcome.error?.message).toMatch(
      /^Needs a person: "Charges \$20 a month"/
    )
    expect(instance.get().value).toBeNull()
  })
})

describe("while allow decides", () => {
  test("a mark the page adds asks again, and a field disabled meanwhile refuses the step", async () => {
    const section = region("data-other")
    const onValueChange = vi.fn()
    mountInput("Billing email", section, onValueChange)
    const steps: { confirm?: string }[] = []
    const marking = createAgent({
      allow: (step) => {
        steps.push(step)
        section.setAttribute("data-agent-confirm", "Changes where invoices go")
        return true
      },
    })
    await marking.act({
      steps: [
        { ref: "Billing email", action: "setValue", args: ["a@example.com"] },
      ],
    })
    expect(steps.map((step) => step.confirm)).toEqual([
      undefined,
      "Changes where invoices go",
    ])
    section.removeAttribute("data-agent-confirm")
    onValueChange.mockClear()
    const field = section.querySelector("input")!
    const disabling = createAgent({ allow: () => !!(field.disabled = true) })
    const outcome = await disabling.act({
      steps: [
        { ref: "Billing email", action: "setValue", args: ["b@example.com"] },
      ],
    })
    expect(outcome.error?.message).toMatch(/is disabled now\.$/)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe("data-agent-hidden", () => {
  test("a component inside is left out of the snapshot, and a step that names it is told so", async () => {
    const agent = createAgent()
    mountInput("New password", region("data-agent-hidden"))
    mountInput("Display name")
    expect(onPage(agent).map((component) => component.label)).toEqual([
      "Display name",
    ])
    const outcome = await agent.act({
      steps: [{ ref: "New password", action: "setValue", args: ["x"] }],
    })
    expect(outcome.error?.message).toBe(
      `"New password" isn't available to agents here. Ask the person.`
    )
  })

  test("its buttons can't be pressed, and its fields aren't kept after they leave", async () => {
    const agent = createAgent()
    const { onClick } = mountButton("Rotate keys", region("data-agent-hidden"))
    const { unmount } = mountInput("Recovery code", region("data-agent-hidden"))
    unmount()
    expect(onPage(agent)).toEqual([])
    expect(agent.snapshot().map((component) => component.label)).not.toContain(
      "Recovery code"
    )
    await agent.act({ steps: [{ ref: "Rotate keys", action: "press" }] })
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a hidden input is left out too, and isn't kept after it leaves", () => {
    const agent = createAgent()
    const { instance, unmount } = mountInput("Session token")
    document.querySelector("input")!.type = "hidden"
    instance.api.setValue("tok_123")
    expect(onPage(agent)).toEqual([])
    unmount()
    expect(JSON.stringify(agent.snapshot())).not.toContain("tok_123")
  })

  test("the agent doesn't hear its changes, and the app's observe does", () => {
    const agent = createAgent()
    const heard: ObservedChange[] = []
    const logged: ObservedChange[] = []
    cleanups.push(
      agent.subscribe((change) => heard.push(change)),
      observe((change) => logged.push(change))
    )
    const { instance } = mountInput(
      "Recovery email",
      region("data-agent-hidden")
    )
    instance.api.setValue("me@example.com")
    expect(heard).toEqual([])
    expect(logged).toEqual([
      expect.objectContaining({
        label: "Recovery email",
        value: "me@example.com",
      }),
    ])
  })
})

describe("data-agent-hidden inside a component", () => {
  test("text inside a marked element doesn't reach the agent", () => {
    const agent = createAgent()
    const instance = dialog({ id: "recovery", defaultOpen: true })
    const content = document.body.appendChild(document.createElement("div"))
    const description = content.appendChild(document.createElement("p"))
    description.innerHTML =
      'Save your codes. <span data-agent-hidden="">ABCD-1234</span>'
    cleanups.push(
      bind(instance.part("content"), content),
      bind(instance.part("description"), description),
      () => instance.destroy()
    )
    expect(JSON.stringify(agent.snapshot())).not.toContain("ABCD-1234")
    expect(onPage(agent)[0].text).toEqual(["Save your codes."])
  })
})

describe("data-agent-secret", () => {
  test("the agent sees a value is filled, never what it is, and can still type it", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    mountInput("Tax ID", region("data-agent-secret"), onValueChange)
    expect(onPage(agent)).toEqual([
      expect.objectContaining({ label: "Tax ID", value: "" }),
    ])
    const outcome = await agent.act({
      steps: [{ ref: "Tax ID", action: "setValue", args: ["12-345"] }],
    })
    expect(onValueChange).toHaveBeenCalledWith("12-345", expect.anything())
    expect(JSON.stringify(outcome)).not.toContain("12-345")
    expect(outcome.values).toMatchObject({
      [`${outcome.steps[0].ref} Tax ID`]: "[redacted]",
    })
    expect(onPage(agent)[0].value).toBe("[redacted]")
  })

  test("a failed action's error stays out of the snapshot and the step", async () => {
    const agent = createAgent()
    const instance = button({
      id: "Reveal",
      action: () => Promise.reject(new Error("Token sk-live-42 expired")),
    } as Parameters<typeof button>[0])
    const el = region("data-agent-secret").appendChild(
      document.createElement("button")
    )
    el.textContent = "Reveal"
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const outcome = await agent.act({
      steps: [{ ref: "Reveal", action: "press" }],
    })
    expect(outcome.error?.message).toBe(
      'Pressed "Reveal", and its action failed: [redacted]'
    )
    expect(JSON.stringify(agent.snapshot())).not.toContain("sk-live-42")
  })

  test("a password field is secret whatever the case of its type", () => {
    const agent = createAgent()
    const { instance } = mountInput("Password")
    document.querySelector("input")!.setAttribute("type", "PassWord")
    instance.api.setValue("hunter2")
    expect(onPage(agent)[0].value).toBe("[redacted]")
  })

  test("observe redacts it too", () => {
    const logged: ObservedChange[] = []
    cleanups.push(observe((change) => logged.push(change)))
    const { instance } = mountInput("Tax ID", region("data-agent-secret"))
    instance.api.setValue("12-345")
    expect(logged).toEqual([
      expect.objectContaining({ value: "[redacted]", previous: "[redacted]" }),
    ])
  })
})

describe("a mark on a custom element's host", () => {
  // A region inside the shadow root of an element with one mark.
  const shadowRegion = (mark: string) => {
    const host = region(mark)
    const inner = document.createElement("div")
    host.attachShadow({ mode: "open" }).append(inner)
    return inner
  }

  test("covers the controls in its shadow root", async () => {
    const agent = createAgent()
    mountInput("New password", shadowRegion("data-agent-hidden"))
    mountInput("Tax ID", shadowRegion("data-agent-secret"))
    mountButton("Delete", shadowRegion("data-agent-confirm"))
    expect(onPage(agent).map((component) => component.label)).toEqual([
      "Tax ID",
      "Delete",
    ])
    expect(onPage(agent)[1]).toMatchObject({ confirm: "This needs a person." })
    const outcome = await agent.act({
      steps: [{ ref: "Tax ID", action: "setValue", args: ["12-345"] }],
    })
    expect(JSON.stringify(outcome)).not.toContain("12-345")
  })
})

describe("mark names", () => {
  test("development warns about a misspelled mark, and not about an app's own data-agent attribute", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const agent = createAgent()
    mountButton("Buy", region("data-agent-confim", "Charges $20"))
    mountButton("Assign", region("data-agent-id", "42"))
    agent.snapshot()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(
      "data-agent-confim isn't an agent mark"
    )
    expect(warn.mock.calls[0][0]).toContain("data-agent-confirm")
    warn.mockRestore()
  })
})
