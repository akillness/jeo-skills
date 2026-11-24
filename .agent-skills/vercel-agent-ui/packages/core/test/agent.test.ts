// @vitest-environment jsdom
// The agent bridge: what an agent sees of the page's components, and what its
// calls change, through the public entry. `bind` from the kernel stands in
// for an adapter.
import { afterEach, describe, expect, test, vi } from "vitest"
import { accordion } from "../src/components/accordion/accordion"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import {
  createAgent,
  registerTools,
  type AgentComponent,
  type AgentStep,
} from "../src/page/agent/agent"
import { button } from "../src/components/button/button"
import { checkbox } from "../src/components/checkbox/checkbox"
import { collapsible } from "../src/components/collapsible/collapsible"
import { combobox } from "../src/components/combobox/combobox"
import { datePicker } from "../src/components/date-picker/date-picker"
import { dialog } from "../src/components/dialog/dialog"
import { input, inputGroup, textarea } from "../src/components/input/input"
import { listbox } from "../src/components/listbox/listbox-root"
import { menu } from "../src/components/menu/menu"
import { numberInput } from "../src/components/number-input/number-input"
import { pagination } from "../src/components/pagination/pagination"
import { passwordInput } from "../src/components/password-input/password-input"
import { progress } from "../src/components/progress/progress"
import { attrs, bind } from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { select } from "../src/components/select/select"
import { separator } from "../src/components/separator/separator"
import { slider } from "../src/components/slider/slider"
import { tabs } from "../src/components/tabs/tabs"
import { tokenInput } from "../src/components/token-input/token-input"
import { toastRegion } from "../src/components/toast/toast"
import { createToaster } from "../src/components/toast/toaster"
import { toolbar } from "../src/components/toolbar/toolbar"
import { createOverlays } from "../src/page/overlays/overlays"
import { tree } from "../src/components/tree/tree"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { tooltip } from "../src/components/tooltip/tooltip"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

// A checkbox in a label, bound the way an adapter binds it.
function mountCheckbox(
  options: Parameters<typeof checkbox>[0],
  text = "Accept the terms"
) {
  const instance = checkbox(options)
  const label = document.createElement("label")
  const el = document.createElement("button")
  label.append(el, text)
  document.body.append(label)
  const unbind = bind(instance.part("root"), el)
  cleanups.push(() => {
    unbind()
    instance.destroy()
  })
  return instance
}

describe("agent", () => {
  test("lists the components on the page with their label, state and actions", () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms" })
    // Made and never mounted, like a render a framework threw away.
    checkbox({ id: "spare" })
    const screen = agent.snapshot()
    expect(screen).toHaveLength(1)
    expect(screen[0]).toMatchObject({
      component: "checkbox",
      label: "Accept the terms",
      checked: false,
    })
    expect(screen[0].actions).toContain("setChecked")
    expect(screen[0].actions).not.toContain("focus")
  })

  test("a step changes the component, reports the source agent and returns what changed", async () => {
    const agent = createAgent()
    const onCheckedChange = vi.fn()
    mountCheckbox({ id: "terms", onCheckedChange })
    const [{ ref }] = agent.snapshot()
    const outcome = await agent.act({
      steps: [{ ref, action: "setChecked", args: [true] }],
    })
    expect(onCheckedChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ source: "agent" })
    )
    expect(outcome).toMatchObject({
      ok: true,
      steps: [
        {
          ref,
          changes: [
            {
              component: "checkbox",
              label: "Accept the terms",
              key: "checked",
              value: true,
            },
          ],
        },
      ],
      values: { [`${ref} Accept the terms`]: true },
    })
  })

  test("a step whose value the option's kind doesn't take fails and changes nothing", async () => {
    const agent = createAgent()
    const instance = mountCheckbox({ id: "terms" })
    const outcome = await agent.act({
      steps: [
        {
          ref: "Accept the terms",
          action: "setChecked",
          args: ["not-a-boolean"],
        },
      ],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining(
          'takes true or false, not "not-a-boolean"'
        ),
      },
    })
    expect(instance.get().checked).toBe(false)
  })

  test("a number option given text takes the number", async () => {
    const agent = createAgent()
    const instance = pagination({ id: "pages", pageCount: 10 })
    const root = document.createElement("nav")
    root.setAttribute("aria-label", "Results")
    document.body.append(root)
    cleanups.push(bind(instance.part("root"), root), () => instance.destroy())
    await agent.act({
      steps: [{ ref: "Results", action: "setPage", args: ["3"] }],
    })
    expect(instance.get().page).toBe(3)
  })

  test("the app can refuse a step in its change callback, since it knows the agent asked", async () => {
    const agent = createAgent()
    mountCheckbox({
      id: "terms",
      onCheckedChange: (_checked, details) => {
        if (details.source === "agent") {
          details.cancel()
        }
      },
    })
    const [{ ref }] = agent.snapshot()
    const outcome = await agent.act({
      steps: [{ ref, action: "setChecked", args: [true] }],
    })
    expect(outcome.steps[0].changes).toBeUndefined()
  })

  test("allow refuses an action before it runs", async () => {
    const allow = vi.fn(() => false)
    const agent = createAgent({ allow })
    const onCheckedChange = vi.fn()
    mountCheckbox({ id: "terms", onCheckedChange })
    const [{ ref }] = agent.snapshot()
    const outcome = await agent.act({
      steps: [{ ref, action: "setChecked", args: [true] }],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { step: 0, message: `The app refused setChecked on ${ref}.` },
    })
    expect(allow).toHaveBeenCalledWith(
      {
        ref,
        component: "checkbox",
        label: "Accept the terms",
        action: "setChecked",
        args: [true],
      },
      { signal: expect.any(AbortSignal) }
    )
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  test("a disabled component takes no actions, and a call says what it takes", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms", disabled: true })
    const [component] = agent.snapshot()
    expect(component).toMatchObject({ disabled: true, actions: [] })
    const outcome = await agent.act({
      steps: [{ ref: component.ref, action: "setChecked", args: [true] }],
    })
    expect(outcome.error?.message).toContain("takes no setChecked now")
  })

  test("a component inside a disabled fieldset takes no actions", async () => {
    const agent = createAgent()
    const instance = select({ id: "visibility", items: ["Private", "Public"] })
    const fieldset = document.createElement("fieldset")
    fieldset.disabled = true
    const trigger = document.createElement("button")
    trigger.setAttribute("aria-label", "Visibility")
    const input = document.createElement("input")
    fieldset.append(trigger, input)
    document.body.append(fieldset)
    cleanups.push(
      bind(instance.part("trigger"), trigger),
      bind(instance.part("form-input"), input),
      () => instance.destroy()
    )
    await Promise.resolve()
    const [component] = agent.snapshot()
    expect(component).toMatchObject({
      label: "Visibility",
      disabled: true,
      actions: [],
    })
    const outcome = await agent.act({
      steps: [{ ref: "Visibility", action: "setValue", args: ["Public"] }],
    })
    expect(outcome.error?.message).toContain("takes no setValue now")
  })

  test.each([
    ["input", input],
    ["textarea", textarea],
  ] as const)(
    "a %s inside a disabled fieldset takes no actions",
    async (tag, make) => {
      const agent = createAgent()
      const instance = make({ id: "note" })
      const fieldset = document.createElement("fieldset")
      fieldset.disabled = true
      const el = document.createElement(tag)
      el.setAttribute("aria-label", "Note")
      fieldset.append(el)
      document.body.append(fieldset)
      cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
      await Promise.resolve()
      const [component] = agent.snapshot()
      expect(component).toMatchObject({
        label: "Note",
        disabled: true,
        actions: [],
      })
      const outcome = await agent.act({
        steps: [{ ref: "Note", action: "setValue", args: ["Changed"] }],
      })
      expect(outcome.error?.message).toContain("takes no setValue now")
      expect(instance.get().value).not.toBe("Changed")
    }
  )

  test.each([
    ["input", input],
    ["textarea", textarea],
  ] as const)(
    "a read-only %s takes no actions, and a required one says so",
    async (tag, make) => {
      const agent = createAgent()
      const instance = make({ id: "note", defaultValue: "Kept" })
      const el = document.createElement(tag)
      el.setAttribute("aria-label", "Note")
      document.body.append(el)
      cleanups.push(
        bind(instance.part("root", { readOnly: true, required: true }), el),
        () => instance.destroy()
      )
      const [component] = agent.snapshot()
      expect(component).toMatchObject({
        label: "Note",
        disabled: true,
        required: true,
        actions: [],
      })
      const outcome = await agent.act({
        steps: [{ ref: "Note", action: "setValue", args: ["Changed"] }],
      })
      expect(outcome.error?.message).toContain("takes no setValue now")
      expect(instance.get().value).toBe("Kept")
    }
  )

  test("a date picker whose input a disabled fieldset disables takes no actions", async () => {
    const agent = createAgent()
    const instance = datePicker({ id: "due", defaultMonth: "2026-11" })
    const fieldset = document.body.appendChild(
      document.createElement("fieldset")
    )
    fieldset.disabled = true
    const input = fieldset.appendChild(document.createElement("input"))
    input.setAttribute("aria-label", "Due")
    cleanups.push(bind(instance.part("input"), input), () => instance.destroy())
    await Promise.resolve()
    const component = agent
      .snapshot()
      .find((found) => found.component === "date-picker")
    expect(component).toMatchObject({
      label: "Due",
      disabled: true,
      actions: [],
    })
    const outcome = await agent.act({
      steps: [{ ref: "Due", action: "setValue", args: ["2030-01-02"] }],
    })
    expect(outcome.error?.message).toContain("takes no setValue now")
  })

  test("a date picker whose keyed input a disabled fieldset disables takes no actions, as adapters bind it", async () => {
    const agent = createAgent()
    const instance = datePicker({ id: "start-date", defaultMonth: "2026-11" })
    const fieldset = document.body.appendChild(
      document.createElement("fieldset")
    )
    fieldset.disabled = true
    const input = fieldset.appendChild(document.createElement("input"))
    input.setAttribute("aria-label", "Start")
    cleanups.push(
      bind(instance.part("input", { id: "start", end: false }), input),
      () => instance.destroy()
    )
    await Promise.resolve()
    const component = agent
      .snapshot()
      .find((found) => found.component === "date-picker")
    expect(component).toMatchObject({
      label: "Start",
      disabled: true,
      actions: [],
    })
  })

  test("a number input at its max still takes actions, though its increment button is disabled", async () => {
    const agent = createAgent()
    const instance = numberInput({ id: "seats", defaultValue: 10, max: 10 })
    const field = document.body.appendChild(document.createElement("input"))
    field.setAttribute("aria-label", "Seats")
    const increment = document.body.appendChild(
      document.createElement("button")
    )
    cleanups.push(
      bind(instance.part("control"), field),
      bind(instance.part("increment"), increment),
      () => instance.destroy()
    )
    await Promise.resolve()
    increment.disabled = true
    const component = agent.snapshot().find((found) => found.label === "Seats")
    expect(component?.disabled).toBeUndefined()
    expect(component?.actions).toContain("setValue")
  })

  test("a number input takes its field's name, not the name of a step button before it", async () => {
    const agent = createAgent()
    const instance = numberInput({ id: "people", defaultValue: 2 })
    const label = document.body.appendChild(document.createElement("label"))
    label.id = "people-label"
    label.textContent = "People"
    const decrement = document.body.appendChild(
      document.createElement("button")
    )
    decrement.setAttribute("aria-label", "One fewer person")
    const field = document.body.appendChild(document.createElement("input"))
    field.setAttribute("aria-labelledby", "people-label")
    cleanups.push(
      bind(instance.part("decrement"), decrement),
      bind(instance.part("control"), field),
      () => instance.destroy()
    )
    const shown = agent.snapshot().filter((found) => !found.offPage)
    expect(shown.map((found) => found.label)).toEqual(["People"])
    const outcome = await agent.act({
      steps: [{ ref: "People", action: "setValue", args: [4] }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(instance.get().value).toBe(4)
  })

  test("a component that leaves the page stays in the snapshot as off the page, with the state it had", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms", defaultChecked: true }, "Send a weekly digest")
    const [{ ref }] = agent.snapshot()
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    expect(agent.snapshot().find((component) => component.ref === ref)).toEqual(
      {
        ref,
        component: "checkbox",
        offPage: true,
        label: "Send a weekly digest",
        checked: true,
        actions: [],
      }
    )
    const outcome = await agent.act({
      steps: [{ ref, action: "setChecked", args: [true] }],
    })
    expect(outcome.error?.message).toContain("No component")
  })

  test("a password field isn't kept once it leaves the page", () => {
    const agent = createAgent()
    const instance = input({ id: "password", defaultValue: "hunter2" })
    const el = document.createElement("input")
    el.type = "password"
    el.setAttribute("aria-label", "Password")
    document.body.append(el)
    const unbind = bind(instance.part("root"), el)
    const password = () =>
      agent.snapshot().filter((component) => component.label === "Password")
    expect(password()).toHaveLength(1)
    unbind()
    instance.destroy()
    expect(password()).toEqual([])
  })

  test("a toast's action and close are pressed by their text, a link action too", async () => {
    // jsdom has neither, and a toast measures itself as it binds.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    )
    Element.prototype.getAnimations ??= () => []
    cleanups.push(() => vi.unstubAllGlobals())
    const agent = createAgent()
    const toaster = createToaster({ overlays: createOverlays() })
    const region = toastRegion({ id: "toasts", toaster })
    cleanups.push(region.api.internal.connect(), () => region.destroy())
    const undone: string[] = []
    // Shows a toast, presses one of its buttons by text, and takes it off the page.
    async function pressed(title: string, text: string, href?: string) {
      const id = toaster(title, { duration: Infinity })
      const root = document.body.appendChild(document.createElement("div"))
      const unbinds = [bind(region.part("root", { id }), root)]
      for (const slot of ["action", "close"] as const) {
        const link = slot === "action" && href
        const el = root.appendChild(
          document.createElement(link ? "a" : "button")
        )
        el.textContent = slot === "action" ? "Undo" : "Dismiss"
        if (link) {
          el.setAttribute("href", href)
        }
        const part = region.part(slot, {
          id: `${id}-${slot}`,
          toast: id,
          ...(slot === "action" && { onAction: () => undone.push(title) }),
        })
        unbinds.push(bind(part, el))
      }
      const seen = agent.snapshot().find((found) => found.component === "toast")
      await agent.act({
        steps: [{ ref: "toast", action: "press", args: [text] }],
      })
      unbinds.forEach((unbind) => unbind())
      root.remove()
      return seen
    }
    expect(await pressed("Deleted", "Undo")).toMatchObject({
      buttons: ["Undo", "Dismiss"],
      actions: ["pause", "press"],
    })
    expect(await pressed("Archived", "Undo", "#archive")).toMatchObject({
      buttons: ["Undo", "Dismiss"],
    })
    expect(undone).toEqual(["Deleted", "Archived"])
    await pressed("Saved", "Dismiss")
    expect(undone).toEqual(["Deleted", "Archived"])
    expect(toaster.toasts()).toEqual([])
  })

  test("a toolbar's buttons are pressed by their text", async () => {
    const agent = createAgent()
    const instance = toolbar({ id: "format" })
    const root = document.body.appendChild(document.createElement("div"))
    root.setAttribute("aria-label", "Format")
    cleanups.push(bind(instance.part("root"), root), () => instance.destroy())
    const pressed: string[] = []
    for (const text of ["Bold", "Italic"]) {
      const button = root.appendChild(document.createElement("button"))
      button.textContent = text
      button.addEventListener("click", () => pressed.push(text))
      cleanups.push(bind(instance.part("button", { id: text }), button))
    }
    const component = agent.snapshot().find((found) => found.label === "Format")
    expect(component).toMatchObject({
      buttons: ["Bold", "Italic"],
      actions: ["press"],
    })
    const outcome = await agent.act({
      steps: [{ ref: "Format", action: "press", args: ["Italic"] }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(pressed).toEqual(["Italic"])
  })

  test("a password's value never reaches the agent, even while it's shown", async () => {
    const agent = createAgent()
    const instance = passwordInput({ id: "secret", defaultVisible: true })
    const root = document.createElement("div")
    const el = document.createElement("input")
    el.setAttribute("aria-label", "Password")
    root.append(el)
    document.body.append(root)
    cleanups.push(
      bind(instance.part("root"), root),
      bind(instance.part("control"), el),
      () => instance.destroy()
    )
    expect(el.type).toBe("text")
    const [component] = agent.snapshot()
    const outcome = await agent.act({
      steps: [{ ref: component.ref, action: "setValue", args: ["swordfish"] }],
    })
    expect(instance.get().value).toBe("swordfish")
    expect(JSON.stringify(outcome)).not.toContain("swordfish")
    expect(agent.snapshot()[0]).toMatchObject({
      component: "password-input",
      value: "[redacted]",
    })
  })

  test("registerTools registers the three methods as WebMCP tools, and unregisters them", async () => {
    const tools = new Map<
      string,
      { annotations: object; execute: (input: object) => unknown }
    >()
    const registerTool = vi.fn(
      async (
        tool: {
          name: string
          annotations: object
          execute: (input: object) => unknown
        },
        { signal }: { signal: AbortSignal }
      ) => {
        tools.set(tool.name, tool)
        signal.addEventListener("abort", () => tools.delete(tool.name))
      }
    )
    Object.assign(document, { modelContext: { registerTool } })
    const agent = createAgent()
    const instance = mountCheckbox({ id: "digest" }, "Weekly digest")
    const asked: string[] = []
    const remove = registerTools(agent, {
      allow: (step) => {
        asked.push(`${step.action} ${step.args[0]}`)
        return step.args[0] !== false
      },
    })
    expect([...tools.keys()]).toEqual(["snapshot", "act", "query"])
    expect(tools.get("snapshot")?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    })
    expect(tools.get("act")?.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
      consequentialHint: true,
    })
    await tools.get("act")?.execute({
      steps: [{ ref: "Weekly digest", action: "setChecked", args: [true] }],
    })
    expect(instance.get().checked).toBe(true)
    // Its `allow` decides every step the browser's agent asks for.
    expect(
      await tools.get("act")?.execute({
        steps: [{ ref: "Weekly digest", action: "setChecked", args: [false] }],
      })
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("The app refused setChecked") },
    })
    expect(instance.get().checked).toBe(true)
    expect(asked).toEqual(["setChecked true", "setChecked false"])
    // The agent's own calls don't ask it.
    await agent.act({
      steps: [{ ref: "Weekly digest", action: "setChecked", args: [false] }],
    })
    expect(instance.get().checked).toBe(false)
    expect(asked).toHaveLength(2)
    // Without one, it refuses to register.
    expect(() => registerTools(agent, {} as never)).toThrow(
      "registerTools needs an `allow`"
    )
    // Each tool is the method of the same name.
    expect(await tools.get("snapshot")?.execute({})).toEqual(agent.snapshot())
    expect(await tools.get("query")?.execute({ within: "Nothing" })).toEqual({
      error: expect.stringContaining('No component "Nothing"'),
    })
    remove()
    expect(tools.size).toBe(0)
    delete (document as { modelContext?: unknown }).modelContext
    // Without WebMCP it does nothing.
    expect(() => registerTools(agent, { allow: () => true })()).not.toThrow()
  })

  function mountRegion(
    items: { value: string; label: string; disabled?: boolean }[],
    onValueChange = vi.fn()
  ) {
    const instance = select({ id: "region", items, onValueChange })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Region")
    document.body.append(el)
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    return instance
  }

  test("setValue refuses an item a select doesn't have, and lists its items", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    mountRegion(
      [
        { value: "fra", label: "Frankfurt" },
        { value: "sin", label: "Singapore" },
      ],
      onValueChange
    )
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Tokyo"] }],
    })
    expect(outcome.error?.message).toMatch(
      /^No item "Tokyo" in Region \(c\d+\)\. Its items: Frankfurt, Singapore\.$/
    )
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("setValue names an item of a select whose values are numbers by its label", async () => {
    const agent = createAgent()
    const instance = select({
      id: "project",
      items: [
        { value: 1, label: "Mobile app" },
        { value: 2, label: "Website" },
      ],
      defaultValue: 1,
    })
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Project")
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    const byLabel = await agent.act({
      steps: [{ ref: "Project", action: "setValue", args: ["Website"] }],
    })
    expect(byLabel.ok).toBe(true)
    expect(instance.get().value).toBe(2)
    await agent.act({
      steps: [{ ref: "Project", action: "setValue", args: ["1"] }],
    })
    expect(instance.get().value).toBe(1)
  })

  function mountCombobox(
    options: Parameters<typeof combobox>[0],
    label: string
  ) {
    const instance = combobox(options)
    const el = document.body.appendChild(document.createElement("input"))
    el.setAttribute("aria-label", label)
    cleanups.push(bind(instance.part("input"), el), () => instance.destroy())
    return instance
  }

  test("a combobox refuses a value that isn't in its list, unless it allows custom values", async () => {
    const agent = createAgent()
    const items = [
      { value: "fra", label: "Frankfurt" },
      { value: "sin", label: "Singapore" },
    ]
    const region = mountCombobox({ id: "region", items }, "Region")
    const refused = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Tokyo"] }],
    })
    expect(refused.error?.message).toMatch(
      /^No item "Tokyo" in Region \(c\d+\)\. Its items: Frankfurt, Singapore\.$/
    )
    expect(region.get().value).toBeNull()

    const city = mountCombobox(
      { id: "city", items, allowCustomValue: true },
      "City"
    )
    const custom = await agent.act({
      steps: [{ ref: "City", action: "setValue", args: ["Tokyo"] }],
    })
    expect(custom.ok, custom.error?.message).toBe(true)
    expect(city.get().value).toBe("Tokyo")

    const stops = mountCombobox(
      { id: "stops", items, multiple: true, defaultValue: ["ber"] },
      "Stops"
    )
    const kept = await agent.act({
      steps: [{ ref: "Stops", action: "setValue", args: [["ber", "sin"]] }],
    })
    expect(kept.ok, kept.error?.message).toBe(true)
    expect(stops.get().value).toEqual(["ber", "sin"])
    const unknown = await agent.act({
      steps: [{ ref: "Stops", action: "setValue", args: [["ber", "tok"]] }],
    })
    expect(unknown.error?.message).toMatch(/^No item "tok" in Stops/)
  })

  test("a combobox takes an item it shows while its query is empty, by its value or its label", async () => {
    const agent = createAgent()
    const region = mountCombobox(
      {
        id: "region",
        items: [{ value: "fra", label: "Frankfurt" }],
        emptyItems: [
          { value: "fra", label: "Frankfurt" },
          { value: "tok", label: "Tokyo" },
        ],
      },
      "Region"
    )
    const [found] = (await agent.query({ within: "Region" })) as {
      items: unknown[]
    }[]
    expect(found.items).toEqual([
      { value: "fra", label: "Frankfurt" },
      { value: "tok", label: "Tokyo" },
    ])
    for (const text of ["tok", "fra", "Tokyo"]) {
      const outcome = await agent.act({
        steps: [{ ref: "Region", action: "setValue", args: [text] }],
      })
      expect(outcome.ok, outcome.error?.message).toBe(true)
    }
    expect(region.get().value).toBe("tok")
  })

  test("a combobox or select whose data has no items refuses any value", async () => {
    const agent = createAgent()
    const region = mountCombobox(
      { id: "region", items: [], filter: false },
      "Region"
    )
    const stops = mountCombobox(
      { id: "stops", items: [], multiple: true },
      "Stops"
    )
    const plan = select({ id: "plan", items: [] })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Plan")
    cleanups.push(bind(plan.part("trigger"), trigger), () => plan.destroy())
    for (const [ref, value] of [
      ["Region", "Tokyo"],
      ["Stops", ["tok"]],
      ["Plan", "Pro"],
    ] as const) {
      const outcome = await agent.act({
        steps: [{ ref, action: "setValue", args: [value] }],
      })
      expect(outcome.error?.message).toMatch(
        new RegExp(`^No item "${value}" in ${ref} `)
      )
    }
    expect(region.get().value).toBeNull()
    expect(stops.get().value).toEqual([])
    expect(plan.get().value).toBeNull()
  })

  test("a combobox that renders its own items and shows none refuses a value, unless it allows custom values", async () => {
    const agent = createAgent()
    const region = mountCombobox({ id: "region", defaultOpen: true }, "Region")
    const refused = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Tokyo"] }],
    })
    expect(refused.error?.message).toMatch(
      /^No item "Tokyo" in Region \(c\d+\)\. Its items: none\.$/
    )
    expect(region.get().value).toBeNull()
    const stops = mountCombobox(
      { id: "stops", defaultOpen: true, multiple: true },
      "Stops"
    )
    const list = await agent.act({
      steps: [{ ref: "Stops", action: "setValue", args: [["tok"]] }],
    })
    expect(list.error?.message).toMatch(/^No item "tok" in Stops /)
    expect(stops.get().value).toEqual([])
    const city = mountCombobox(
      { id: "city", defaultOpen: true, allowCustomValue: true },
      "City"
    )
    const taken = await agent.act({
      steps: [{ ref: "City", action: "setValue", args: ["Tokyo"] }],
    })
    expect(taken.ok, taken.error?.message).toBe(true)
    expect(city.get().value).toBe("Tokyo")
  })

  test("a combobox takes the value it holds, even one its list no longer has", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    const region = mountCombobox(
      {
        id: "region",
        items: [{ value: "fra", label: "Frankfurt" }],
        defaultValue: "ber",
        onValueChange,
      },
      "Region"
    )
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["ber"] }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(region.get().value).toBe("ber")
    const other = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["tok"] }],
    })
    expect(other.error?.message).toMatch(/^No item "tok" in Region/)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("setValue takes labels in a list of values, like a multiple combobox's", async () => {
    const agent = createAgent()
    const instance = combobox({
      id: "watchers",
      multiple: true,
      items: [
        { value: "theo", label: "Theo Laurent" },
        { value: "ana", label: "Ana Ruiz" },
      ],
    })
    const el = document.body.appendChild(document.createElement("input"))
    el.setAttribute("aria-label", "Watchers")
    cleanups.push(bind(instance.part("input"), el), () => instance.destroy())
    const outcome = await agent.act({
      steps: [
        {
          ref: "Watchers",
          action: "setValue",
          args: [["Theo Laurent", "ana"]],
        },
      ],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(instance.get().value).toEqual(["theo", "ana"])
  })

  test("setValue takes one value or label for a list, like a multiple combobox's", async () => {
    const agent = createAgent()
    const instance = combobox({
      id: "watchers",
      multiple: true,
      items: [
        { value: "theo", label: "Theo Laurent" },
        { value: "ana", label: "Ana Ruiz" },
      ],
    })
    const el = document.body.appendChild(document.createElement("input"))
    el.setAttribute("aria-label", "Watchers")
    cleanups.push(bind(instance.part("input"), el), () => instance.destroy())
    for (const [text, value] of [
      ["ana", ["ana"]],
      ["Theo Laurent", ["theo"]],
    ] as const) {
      const outcome = await agent.act({
        steps: [{ ref: "Watchers", action: "setValue", args: [text] }],
      })
      expect(outcome.ok, outcome.error?.message).toBe(true)
      expect(instance.get().value).toEqual(value)
    }
  })

  test("setValue reads a token input's text as tokens, not as a list of one", async () => {
    const agent = createAgent()
    const instance = tokenInput({ id: "prompt" })
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Prompt")
    cleanups.push(bind(instance.part("editor"), el), () => instance.destroy())
    const outcome = await agent.act({
      steps: [
        {
          ref: "Prompt",
          action: "setValue",
          args: ["Ask [@Ada](mention:ada)"],
        },
      ],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(instance.api.getValue()).toMatchObject([
      "Ask ",
      { type: "mention", label: "Ada" },
    ])
  })

  test("setValue refuses a disabled item, by its label or its value, as a person can't choose it", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    mountRegion(
      [
        { value: "fra", label: "Frankfurt", disabled: true },
        { value: "sin", label: "Singapore" },
      ],
      onValueChange
    )
    for (const args of [["Frankfurt"], ["fra"]]) {
      const outcome = await agent.act({
        steps: [{ ref: "Region", action: "setValue", args }],
      })
      expect(outcome.error?.message).toMatch(
        /^"Frankfurt" in Region \(c\d+\) is disabled now\.$/
      )
    }
    expect(onValueChange).not.toHaveBeenCalled()
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Singapore"] }],
    })
    expect(outcome.ok).toBe(true)
  })

  test("setValue compares object values by their contents, not as text", async () => {
    const agent = createAgent()
    const instance = select({
      id: "city",
      items: [
        { value: { id: "fra" }, label: "Frankfurt", disabled: true },
        { value: { id: "tyo" }, label: "Tokyo" },
      ],
      itemToValue: (value: { id: string }) => value.id,
    })
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "City")
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    const enabled = await agent.act({
      steps: [{ ref: "City", action: "setValue", args: [{ id: "tyo" }] }],
    })
    expect(enabled.ok).toBe(true)
    expect(instance.get().value).toEqual({ id: "tyo" })
    const refused = await agent.act({
      steps: [{ ref: "City", action: "setValue", args: [{ id: "fra" }] }],
    })
    expect(refused.ok).toBe(false)
    expect(instance.get().value).toEqual({ id: "tyo" })
  })

  test("setValue keys object values the way the select does, so other fields can't pass a disabled item", async () => {
    const agent = createAgent()
    const instance = select({
      id: "city",
      items: [
        { value: { id: 2, name: "B" }, label: "B", disabled: true },
        { value: { id: 1, name: "A" }, label: "A" },
      ],
      itemToValue: (value: { id: number }) => String(value.id),
    })
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "City")
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    const outcome = await agent.act({
      steps: [
        { ref: "City", action: "setValue", args: [{ id: 2, name: "x" }] },
      ],
    })
    expect(outcome.ok).toBe(false)
    expect(instance.get().value).toBeNull()
  })

  test("setValue refuses a disabled option that renders only while its select is open", async () => {
    const agent = createAgent()
    const content = document.body.appendChild(document.createElement("div"))
    const unbindItems: (() => void)[] = []
    const instance: ReturnType<typeof select> = select({
      id: "region",
      onOpenChange: (open) => {
        unbindItems.splice(0).forEach((unbind) => unbind())
        content.replaceChildren()
        if (!open) {
          return
        }
        for (const [value, label, disabled] of [
          ["fra", "Frankfurt", true],
          ["tyo", "Tokyo", false],
        ] as const) {
          const item = content.appendChild(document.createElement("div"))
          item.textContent = label
          unbindItems.push(
            bind(instance.part("item", { value, disabled }), item)
          )
        }
      },
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Region")
    cleanups.push(bind(instance.part("trigger"), trigger), () => {
      unbindItems.forEach((unbind) => unbind())
      instance.destroy()
    })
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Frankfurt"] }],
    })
    expect(outcome.ok).toBe(false)
    expect(instance.get().value).toBeNull()
  })

  function mountRegionWhileOpen(options: { multiple?: boolean } = {}) {
    const content = document.body.appendChild(document.createElement("div"))
    const unbindItems: (() => void)[] = []
    const disabled = { fra: true }
    const instance: ReturnType<typeof select> = select({
      id: "region",
      ...options,
      onOpenChange: (open) => {
        unbindItems.splice(0).forEach((unbind) => unbind())
        content.replaceChildren()
        if (!open) {
          return
        }
        for (const [value, label] of [
          ["fra", "Frankfurt"],
          ["tyo", "Tokyo"],
        ] as const) {
          const item = content.appendChild(document.createElement("div"))
          item.textContent = label
          unbindItems.push(
            bind(
              instance.part("item", {
                value,
                disabled: value === "fra" && disabled.fra,
              }),
              item
            )
          )
        }
      },
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Region")
    cleanups.push(bind(instance.part("trigger"), trigger), () => {
      unbindItems.forEach((unbind) => unbind())
      instance.destroy()
    })
    return { instance, disabled }
  }

  test("setValue refuses a list of values holding a disabled option that renders only while open", async () => {
    const agent = createAgent()
    const { instance } = mountRegionWhileOpen({ multiple: true })
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: [["fra"]] }],
    })
    expect(outcome.ok).toBe(false)
    expect(instance.get().value).toEqual([])
  })

  test("an item enabled after a failed step can be chosen, since disabled items are read anew each step", async () => {
    const agent = createAgent()
    const { instance, disabled } = mountRegionWhileOpen()
    expect(
      (
        await agent.act({
          steps: [{ ref: "Region", action: "setValue", args: ["Nowhere"] }],
        })
      ).ok
    ).toBe(false)
    disabled.fra = false
    instance.api.setOpen(true)
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Frankfurt"] }],
    })
    expect(outcome.error).toBeUndefined()
    expect(instance.get().value).toBe("fra")
  })

  test("opening a select names no item, so a disabled empty placeholder doesn't stop it", async () => {
    const agent = createAgent()
    const instance = mountRegion([
      { value: "", label: "Choose a region", disabled: true },
      { value: "tyo", label: "Tokyo" },
    ])
    expect(
      (
        await agent.act({
          steps: [{ ref: "Region", action: "setValue", args: ["Tokyo"] }],
        })
      ).ok
    ).toBe(true)
    for (const action of ["open", "toggle"]) {
      if (
        typeof (instance.api as Record<string, unknown>)[action] !== "function"
      ) {
        continue
      }
      const outcome = await agent.act({ steps: [{ ref: "Region", action }] })
      expect([action, outcome.error]).toEqual([action, undefined])
      instance.api.setOpen(false)
    }
  })

  test("opening a dialog with a payload opens it once, since a payload names no item", async () => {
    const agent = createAgent()
    const onOpenChange = vi.fn()
    const instance = dialog({ id: "settings", onOpenChange })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.textContent = "Settings"
    cleanups.push(bind(instance.part("trigger"), trigger), () =>
      instance.destroy()
    )
    const outcome = await agent.act({
      steps: [
        { ref: "Settings", action: "open", args: [{ payload: { id: 1 } }] },
      ],
    })
    expect(outcome.error).toBeUndefined()
    expect(onOpenChange.mock.calls.map(([open]) => open)).toEqual([true])
  })

  test("setValue refuses a disabled object-valued option named by its label", async () => {
    const agent = createAgent()
    const instance = select({
      id: "region",
      itemToValue: (value: { id: string }) => value.id,
    })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.setAttribute("aria-label", "Region")
    cleanups.push(bind(instance.part("trigger"), trigger), () =>
      instance.destroy()
    )
    for (const [id, label, disabled] of [
      ["fra", "Frankfurt", true],
      ["tyo", "Tokyo", false],
    ] as const) {
      const item = document.body.appendChild(document.createElement("div"))
      item.textContent = label
      cleanups.push(
        bind(instance.part("item", { value: { id }, disabled }), item)
      )
    }
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Frankfurt"] }],
    })
    expect(outcome.ok).toBe(false)
    expect(instance.get().value).toBeNull()
  })

  test("setValue takes text that matches a disabled suggestion in an autocomplete, as a person can type it", async () => {
    const agent = createAgent()
    const instance = autocomplete({
      id: "city",
      items: ["Berlin", { value: "Cherry", label: "Cherry", disabled: true }],
    })
    const el = document.createElement("input")
    el.setAttribute("aria-label", "City")
    document.body.append(el)
    cleanups.push(bind(instance.part("input"), el), () => instance.destroy())
    await Promise.resolve()
    const outcome = await agent.act({
      steps: [{ ref: "City", action: "setValue", args: ["Cherry"] }],
    })
    expect(outcome.error).toBeUndefined()
    expect(instance.get().value).toBe("Cherry")
  })

  test("setValue takes an item's label ignoring accents and case", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    const instance = mountRegion(
      [{ value: "de", label: "Allemagne" }],
      onValueChange
    )
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["allemagne"] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get().value).toBe("de")
  })

  test("a label two items share is refused, with their values", async () => {
    const agent = createAgent()
    mountRegion([
      { value: "fra-1", label: "Frankfurt" },
      { value: "fra-2", label: "Frankfurt" },
    ])
    const outcome = await agent.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Frankfurt"] }],
    })
    expect(outcome.error?.message).toMatch(
      /"Frankfurt" names 2 items in Region \(c\d+\): fra-1, fra-2\./
    )
  })

  test("a name two closed sections share is refused, with the sections, and opening one first finds it", async () => {
    const agent = createAgent()
    // Each open section mounts its own Deploy failures switch, as adapters render an open panel.
    const mounted = new Map<string, ReturnType<typeof mountCheckbox>>()
    const instance = accordion({
      id: "channels",
      onValueChange: (value) => {
        for (const [section, checkbox] of mounted) {
          if (!value.includes(section)) {
            checkbox.destroy()
            mounted.delete(section)
          }
        }
        for (const section of value) {
          if (!mounted.has(section)) {
            mounted.set(
              section,
              mountCheckbox({ id: section }, "Deploy failures")
            )
          }
        }
      },
    })
    for (const [value, text] of [
      ["email", "Email"],
      ["slack", "Slack"],
    ]) {
      const item = document.createElement("div")
      const trigger = document.createElement("button")
      trigger.textContent = text
      item.append(trigger)
      document.body.append(item)
      cleanups.push(
        bind(instance.part("item", { value }), item),
        bind(instance.part("trigger", { value }), trigger)
      )
    }
    cleanups.push(() => instance.destroy())
    const step = { ref: "Deploy failures", action: "setChecked", args: [true] }
    const refused = await agent.act({ steps: [step] })
    expect(refused.error?.message).toMatch(
      /"Deploy failures" is in 2 closed sections: Email, Slack\. Open one first, like \{ "ref": "c\d+", "action": "open", "args": \["Email"\] \}\./
    )
    expect(instance.get().value).toEqual([])
    const outcome = await agent.act({
      steps: [{ ref: "accordion", action: "open", args: ["Slack"] }, step],
    })
    expect(outcome.ok).toBe(true)
    expect(mounted.get("slack")?.get().checked).toBe(true)
  })

  test("act finishes in a hidden tab, where the browser runs no frames", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 0)
    const agent = createAgent()
    mountCheckbox({ id: "terms" })
    const outcome = await agent.act({
      steps: [{ ref: "Accept the terms", action: "setChecked", args: [true] }],
    })
    expect(outcome.ok).toBe(true)
    expect(frame).not.toHaveBeenCalled()
    hidden.mockRestore()
    frame.mockRestore()
  })

  test("registerTools warns when a tool name is taken, and not when the page turns WebMCP off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const refuse = (name: string) =>
      vi.fn(async () => {
        throw new DOMException("Refused.", name)
      })
    Object.assign(document, {
      modelContext: { registerTool: refuse("InvalidStateError") },
    })
    registerTools(createAgent(), { allow: () => true })
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(3))
    expect(warn.mock.calls[0][0]).toContain(
      "registerTools couldn't register snapshot."
    )
    warn.mockClear()
    const registerTool = refuse("NotAllowedError")
    Object.assign(document, { modelContext: { registerTool } })
    registerTools(createAgent(), { allow: () => true })
    await vi.waitFor(() => expect(registerTool).toHaveBeenCalledTimes(3))
    await new Promise((resolve) => setTimeout(resolve))
    expect(warn).not.toHaveBeenCalled()
    delete (document as { modelContext?: unknown }).modelContext
    warn.mockRestore()
  })
  test("acts run one at a time, so one can't answer the confirm another waits on", async () => {
    let answer = (_yes: boolean) => {}
    const agent = createAgent({
      allow: (step) =>
        step.ref !== "c1" ||
        new Promise<boolean>((resolve) => (answer = resolve)),
    })
    const first = mountCheckbox({ id: "terms" })
    const second = mountCheckbox({ id: "digest" }, "Send a weekly digest")
    const waiting = agent.act({
      steps: [{ ref: "Accept the terms", action: "setChecked", args: [true] }],
    })
    const next = agent.act({
      steps: [
        { ref: "Send a weekly digest", action: "setChecked", args: [true] },
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(second.get().checked).toBe(false)
    answer(true)
    expect(await waiting).toMatchObject({ ok: true })
    expect(await next).toMatchObject({ ok: true })
    expect([first.get().checked, second.get().checked]).toEqual([true, true])
  })

  test("a tree's items reach inside collapsed branches, and come from paths too", async () => {
    const agent = createAgent()
    const mount = (options: Parameters<typeof tree>[0]) => {
      const instance = tree(options)
      const el = document.createElement("div")
      el.setAttribute("aria-label", options.id)
      document.body.append(el)
      cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
      return instance
    }
    const nested = mount({
      id: "Files",
      items: [
        {
          value: "src",
          label: "src",
          children: [{ value: "src/index.ts", label: "index.ts" }],
        },
        { value: "README.md", label: "README.md" },
      ],
    })
    mount({ id: "Paths", paths: ["src/agent.ts", "README.md"] })
    expect(await agent.query({ within: "Files", text: "index" })).toEqual([
      expect.objectContaining({
        label: "Files",
        items: [{ value: "src/index.ts", label: "index.ts" }],
      }),
    ])
    expect(await agent.query({ within: "Paths", text: "agent" })).toEqual([
      expect.objectContaining({
        items: [expect.objectContaining({ label: "agent.ts" })],
      }),
    ])
    // A label inside a collapsed branch names its node.
    await agent.act({
      steps: [{ ref: "Files", action: "setValue", args: ["index.ts"] }],
    })
    expect(nested.get().value).toBe("src/index.ts")
    // Text that names no node is refused, not stored as a value.
    const refused = await agent.act({
      steps: [{ ref: "Files", action: "setValue", args: ["index"] }],
    })
    expect(refused.error?.message).toContain('No item "index" in Files')
    expect(nested.get().value).toBe("src/index.ts")
  })

  test("a component whose elements are all hidden, like one in a closed dialog, isn't on the page", async () => {
    const agent = createAgent()
    const shown = mountCheckbox({ id: "status-shown" }, "Status")
    mountCheckbox({ id: "status-closed" }, "Status")
    const closed = document.body.appendChild(document.createElement("div"))
    closed.hidden = true
    closed.append(document.body.querySelectorAll("label")[1])
    expect(
      agent.snapshot().filter((component) => component.label === "Status")
    ).toHaveLength(1)
    await agent.act({
      steps: [{ ref: "Status", action: "setChecked", args: [true] }],
    })
    expect(shown.get().checked).toBe(true)
  })

  test("a component in a popup that's animating out, like a menu after a choice, isn't on the page", async () => {
    const agent = createAgent()
    const shown = mountCheckbox({ id: "notes-shown" }, "Release notes")
    mountCheckbox({ id: "notes-leaving" }, "Release notes")
    const leaving = document.body.appendChild(document.createElement("div"))
    leaving.setAttribute("data-ending-style", "")
    leaving.append(document.body.querySelectorAll("label")[1])
    expect(
      agent
        .snapshot()
        .filter((component) => component.label === "Release notes")
    ).toHaveLength(1)
    await agent.act({
      steps: [{ ref: "Release notes", action: "setChecked", args: [true] }],
    })
    expect(shown.get().checked).toBe(true)
  })

  test("a component inside aria-hidden isn't on the page", () => {
    const agent = createAgent()
    mountCheckbox({ id: "shown" }, "Shown")
    mountCheckbox({ id: "decorative" }, "Decorative")
    const hidden = document.body.appendChild(document.createElement("div"))
    hidden.setAttribute("aria-hidden", "true")
    hidden.append(document.body.querySelectorAll("label")[1])
    expect(
      agent
        .snapshot()
        .filter((component) => !component.offPage)
        .map((component) => component.label)
    ).toEqual(["Shown"])
  })

  test("a reading, like a progress bar's value, is in the snapshot", () => {
    const agent = createAgent()
    const instance = progress({ id: "upload", value: 2, max: 4 })
    const el = document.body.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Upload")
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    expect(
      agent.snapshot().find((component) => component.label === "Upload")
    ).toMatchObject({
      value: 2,
      max: 4,
    })
  })

  test("a step without a ref or an action fails with a message the model can act on", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms" })
    const noRef = await agent.act({
      steps: [{ action: "press" } as unknown as AgentStep],
    })
    expect(noRef.error).toEqual({
      step: 0,
      message:
        "A step needs a ref: a component's ref from snapshot, or its label.",
    })
    const noAction = await agent.act({
      steps: [{ ref: "Accept the terms" } as unknown as AgentStep],
    })
    expect(noAction.error?.message).toBe(
      'A step on "Accept the terms" needs an action, like "press".'
    )
  })

  test("a reading inside data-agent-secret is redacted", () => {
    const agent = createAgent()
    const instance = progress({ id: "score", value: 3, max: 4 })
    const region = document.body.appendChild(document.createElement("div"))
    region.setAttribute("data-agent-secret", "")
    const el = region.appendChild(document.createElement("div"))
    el.setAttribute("aria-label", "Credit score")
    cleanups.push(
      bind(instance.part("root"), el),
      () => instance.destroy(),
      () => region.remove()
    )
    expect(
      agent.snapshot().find((component) => component.label === "Credit score")
    ).toMatchObject({
      value: "[redacted]",
    })
  })

  test("a date picker takes a date without opening its calendar to look for an item", async () => {
    const agent = createAgent()
    const instance = datePicker({ id: "start" })
    const label = document.body.appendChild(document.createElement("label"))
    label.textContent = "Start date"
    const input = label.appendChild(document.createElement("input"))
    cleanups.push(bind(instance.part("input"), input), () => instance.destroy())
    const opened = vi.fn()
    instance.subscribe(() => instance.get().open && opened())
    const outcome = await agent.act({
      steps: [{ ref: "Start date", action: "setValue", args: ["2026-12-01"] }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(instance.get().value).toBe("2026-12-01")
    expect(opened).not.toHaveBeenCalled()
  })

  test("a date picker is named by its input's label, not by the month its calendar shows", () => {
    const agent = createAgent()
    const instance = datePicker({ id: "due", defaultMonth: "2026-11" })
    const label = document.body.appendChild(document.createElement("label"))
    label.textContent = "Due date"
    const input = label.appendChild(document.createElement("input"))
    const heading = document.body.appendChild(document.createElement("h2"))
    heading.textContent = "November 2026"
    cleanups.push(
      bind(instance.part("input"), input),
      bind(instance.part("heading"), heading),
      () => instance.destroy()
    )
    expect(
      agent
        .snapshot()
        .find((component) => component.component === "date-picker")?.label
    ).toBe("Due date")
  })

  test("a select keeps its trigger's name when its popup's search field mounts", () => {
    const agent = createAgent()
    const instance = select({ id: "fruit", items: ["Apple", "Pear"] })
    const trigger = document.body.appendChild(document.createElement("button"))
    trigger.textContent = "Fruit"
    const content = document.body.appendChild(document.createElement("div"))
    const search = content.appendChild(document.createElement("input"))
    search.setAttribute("aria-label", "Search fruit")
    cleanups.push(
      bind(instance.part("trigger"), trigger),
      bind(instance.part("content"), content),
      bind(instance.part("input"), search),
      () => instance.destroy()
    )
    expect(
      agent.snapshot().find((component) => component.component === "select")
        ?.label
    ).toBe("Fruit")
  })

  test("item labels read as text: spaces collapsed, and without a nested item's text", () => {
    const agent = createAgent()
    const views = tabs({ id: "views" })
    const list = document.body.appendChild(document.createElement("div"))
    list.setAttribute("aria-label", "Views")
    cleanups.push(bind(views.part("root"), list), () => views.destroy())
    for (const [value, count] of [
      ["active", 12],
      ["activity", 2],
    ] as const) {
      const tab = list.appendChild(document.createElement("button"))
      tab.innerHTML = `\n  ${value}\n  <span>${count}</span>\n`
      cleanups.push(bind(views.part("tab", { value }), tab))
    }
    const files = tree({ id: "files" })
    const root = document.body.appendChild(document.createElement("ul"))
    root.setAttribute("aria-label", "Files")
    cleanups.push(bind(files.part("root"), root), () => files.destroy())
    const branch = root.appendChild(document.createElement("li"))
    branch.append("src")
    const group = branch.appendChild(document.createElement("ul"))
    const leaf = group.appendChild(document.createElement("li"))
    leaf.textContent = "index.ts"
    cleanups.push(
      bind(files.part("item", { value: "src" }), branch),
      bind(files.part("item", { value: "src/index.ts" }), leaf)
    )
    const screen = agent.snapshot()
    expect(
      screen.find((component) => component.label === "Views")?.items
    ).toEqual([
      { value: "active", label: "active 12" },
      { value: "activity", label: "activity 2" },
    ])
    expect(
      screen.find((component) => component.label === "Files")?.items
    ).toEqual([
      { value: "src", label: "src" },
      { value: "src/index.ts", label: "index.ts" },
    ])
  })

  test("a single tab doesn't name its tabs over the list's label", () => {
    const agent = createAgent()
    const files = tabs({ id: "open-files" })
    const root = document.body.appendChild(document.createElement("div"))
    const list = root.appendChild(document.createElement("div"))
    list.setAttribute("aria-label", "Open files")
    const tab = list.appendChild(document.createElement("button"))
    tab.textContent = "index.ts"
    // React binds a child before its parent.
    cleanups.push(
      bind(files.part("tab", { value: "index" }), tab),
      bind(files.part("list"), list),
      bind(files.part("root"), root),
      () => files.destroy()
    )
    expect(
      agent
        .snapshot()
        .find(
          (component) => component.component === "tabs" && !component.offPage
        )?.label
    ).toBe("Open files")
  })

  test("an item's label leaves out text a screen reader skips, like its check mark", async () => {
    const agent = createAgent()
    const people = listbox({ id: "people", multiple: true })
    const list = document.body.appendChild(document.createElement("div"))
    list.setAttribute("aria-label", "People")
    cleanups.push(bind(people.part("root"), list), () => people.destroy())
    for (const name of ["Ada Lovelace", "Alan Turing"]) {
      const item = list.appendChild(document.createElement("div"))
      // The indicator's attributes, as an adapter renders them.
      const mark = item.appendChild(document.createElement("span"))
      for (const [key, value] of Object.entries(
        attrs(people.part("item-indicator", { item: name }))
      )) {
        if (typeof value === "string") {
          mark.setAttribute(key, value)
        }
      }
      mark.textContent = "✓"
      item.append(name)
      cleanups.push(
        bind(people.part("item", { value: name }), item),
        bind(
          people.part("item-indicator", { item: name, keepMounted: true }),
          mark
        )
      )
    }
    expect(
      agent.snapshot().find((component) => component.label === "People")?.items
    ).toEqual([
      { value: "Ada Lovelace", label: "Ada Lovelace" },
      { value: "Alan Turing", label: "Alan Turing" },
    ])
    const outcome = await agent.act({
      steps: [{ ref: "People", action: "setValue", args: [["Ada Lovelace"]] }],
    })
    expect(outcome.ok).toBe(true)
  })

  test("a button whose text a screen reader skips is pressed by its name", async () => {
    const agent = createAgent()
    const instance = dialog({ id: "invite", defaultOpen: true })
    const popup = document.body.appendChild(
      Object.assign(document.createElement("div"), { getAnimations: () => [] })
    )
    popup.setAttribute("aria-label", "Invite")
    const close = popup.appendChild(document.createElement("button"))
    close.setAttribute("aria-label", "Close")
    close.innerHTML = `<span aria-hidden="true">×</span>`
    cleanups.push(
      bind(instance.part("content"), popup),
      bind(instance.part("close"), close),
      () => instance.destroy()
    )
    expect(
      agent.snapshot().find((component) => component.component === "dialog")
        ?.buttons
    ).toEqual(["Close"])
    const outcome = await agent.act({
      steps: [{ ref: "Invite", action: "press", args: ["Close"] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get().open).toBe(false)
  })

  test("a button with no text but what's off-limits isn't named by it", () => {
    const agent = createAgent()
    const instance = dialog({ id: "token", defaultOpen: true })
    const popup = document.body.appendChild(
      Object.assign(document.createElement("div"), { getAnimations: () => [] })
    )
    popup.setAttribute("aria-label", "Token")
    const copy = popup.appendChild(document.createElement("button"))
    copy.innerHTML = `<span data-agent-hidden>sk-123</span>`
    cleanups.push(
      bind(instance.part("content"), popup),
      bind(instance.part("close"), copy),
      () => instance.destroy()
    )
    expect(
      agent.snapshot().find((component) => component.component === "dialog")
        ?.buttons
    ).toEqual([""])
  })

  test("of two components on one field, the step goes to the one that takes its action", async () => {
    const agent = createAgent()
    const message = textarea({ id: "message" })
    const mentions = triggerMenu({
      id: "mentions",
      triggers: [{ char: "@", items: [] }],
    })
    const field = document.body.appendChild(document.createElement("textarea"))
    field.setAttribute("aria-label", "Message")
    cleanups.push(
      bind(message.part("root"), field),
      bind(mentions.part("input"), field),
      () => message.destroy(),
      () => mentions.destroy()
    )
    const named = agent
      .snapshot()
      .filter((component) => component.label === "Message")
    expect(named.map((component) => component.component).sort()).toEqual([
      "textarea",
      "trigger-menu",
    ])
    const outcome = await agent.act({
      steps: [{ ref: "Message", action: "setValue", args: ["Hello"] }],
    })
    expect(outcome.ok).toBe(true)
    expect(message.get().value).toBe("Hello")
  })

  test("a press waits for the button's action, and a failed action fails the step", async () => {
    const agent = createAgent()
    let fail = false
    const instance = button({
      id: "save",
      action: () =>
        new Promise((resolve, reject) =>
          setTimeout(
            () => (fail ? reject(new Error("Network down")) : resolve(null)),
            120
          )
        ),
    } as Parameters<typeof button>[0])
    const el = document.createElement("button")
    el.textContent = "Save"
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const saved = await agent.act({ steps: [{ ref: "Save", action: "press" }] })
    expect(saved).toMatchObject({
      ok: true,
      steps: [{ result: 'Pressed "Save".' }],
    })
    expect(instance.get().pending).toBe(false)
    fail = true
    const failed = await agent.act({
      steps: [{ ref: "Save", action: "press" }],
    })
    expect(failed).toMatchObject({
      ok: false,
      error: {
        step: 0,
        message: 'Pressed "Save", and its action failed: Network down',
      },
    })
    expect(agent.snapshot()[0]).toMatchObject({
      component: "button",
      error: "Network down",
    })
  })

  test("a button rendered as a link lists press and takes it", async () => {
    const agent = createAgent()
    const instance = button({ id: "start" } as Parameters<typeof button>[0])
    const el = document.createElement("a")
    el.href = "#docs"
    el.textContent = "Get started"
    const onClick = vi.fn((event: Event) => event.preventDefault())
    el.addEventListener("click", onClick)
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    expect(agent.snapshot()[0]).toMatchObject({
      component: "button",
      label: "Get started",
      actions: ["press"],
    })
    const pressed = await agent.act({
      steps: [{ ref: "Get started", action: "press" }],
    })
    expect(pressed).toMatchObject({
      ok: true,
      steps: [{ result: 'Pressed "Get started".' }],
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test("a press takes a button's own text", async () => {
    const agent = createAgent()
    const action = vi.fn()
    const instance = button({ id: "save", action } as Parameters<
      typeof button
    >[0])
    const el = document.createElement("button")
    el.textContent = "Save settings"
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const saved = await agent.act({
      steps: [
        { ref: "Save settings", action: "press", args: ["Save settings"] },
      ],
    })
    expect(saved).toMatchObject({
      ok: true,
      steps: [{ result: 'Pressed "Save settings".' }],
    })
    expect(action).toHaveBeenCalledTimes(1)
    const missed = await agent.act({
      steps: [{ ref: "Save settings", action: "press", args: ["Publish"] }],
    })
    expect(missed).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Buttons: Save settings.") },
    })
    expect(action).toHaveBeenCalledTimes(1)
  })

  test("a closed select's items come from its data, without opening it", async () => {
    const agent = createAgent()
    const onOpenChange = vi.fn()
    const instance = select({
      id: "region",
      items: [
        {
          type: "group",
          label: "Europe",
          items: [{ value: "fra", label: "Frankfurt" }],
        },
        "Tokyo",
      ],
      onOpenChange,
    })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Region")
    document.body.append(el)
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    const [{ ref }] = agent.snapshot()
    expect(await agent.query({ within: ref })).toEqual([
      expect.objectContaining({
        ref,
        items: [
          { value: "fra", label: "Frankfurt" },
          { value: "Tokyo", label: "Tokyo" },
        ],
      }),
    ])
    expect(await agent.query({ within: ref, text: "frank" })).toEqual([
      expect.objectContaining({
        items: [{ value: "fra", label: "Frankfurt" }],
      }),
    ])
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe("agent query", () => {
  // A Button with its text, bound the way an adapter binds it.
  const mountButton = (text: string) => {
    const instance = button({ id: text })
    const el = document.createElement("button")
    el.textContent = text
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  }

  // A closed select with these items, labelled `label`.
  const mountSelect = (
    label: string,
    items: string[],
    options: { defaultOpen?: boolean } = {}
  ) => {
    const instance = select({ id: label, items, ...options })
    const el = document.createElement("button")
    el.setAttribute("aria-label", label)
    document.body.append(el)
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
  }

  test("finds components by the words of their label, and lists with matching items under them", async () => {
    const agent = createAgent()
    mountButton("Save draft")
    mountButton("Saved replies")
    mountSelect("Timezone", ["Europe/Paris", "Asia/Tokyo", "America/Toronto"])
    expect(await agent.query({ text: "save" })).toEqual([
      expect.objectContaining({ label: "Save draft" }),
    ])
    expect(await agent.query({ text: "to" })).toEqual([
      expect.objectContaining({
        label: "Timezone",
        items: [
          { value: "Asia/Tokyo", label: "Asia/Tokyo" },
          { value: "America/Toronto", label: "America/Toronto" },
        ],
      }),
    ])
  })

  test("kind keeps one kind of component, and a query needs something to look for", async () => {
    const agent = createAgent()
    mountButton("Save")
    mountSelect("Region", ["Tokyo"])
    // Earlier tests' selects follow with offPage, like any component that left the page.
    const selects = (await agent.query({ kind: "select" })) as AgentComponent[]
    expect(
      selects
        .filter((component) => !component.offPage)
        .map((component) => component.label)
    ).toEqual(["Region"])
    expect(selects.every((component) => component.component === "select")).toBe(
      true
    )
    expect(await agent.query({})).toEqual({
      error: "query takes text, within or kind. snapshot lists everything.",
    })
  })

  test("a long list's items stop at 50 and say how many more there were", async () => {
    const agent = createAgent()
    mountSelect(
      "Country",
      Array.from({ length: 70 }, (_, index) => `Country ${index + 1}`)
    )
    const [country] = (await agent.query({
      within: "Country",
    })) as AgentComponent[]
    expect(country.items).toHaveLength(50)
    expect(country.more).toBe(20)
  })

  test("a long page's snapshot stops at 100, keeps what's open and ends with how many were left out", () => {
    const agent = createAgent()
    for (let index = 1; index <= 120; index++) {
      mountButton(`Row ${index}`)
    }
    mountSelect("Status", ["Open", "Closed"], { defaultOpen: true })
    const screen = agent.snapshot()
    expect(screen).toHaveLength(101)
    expect(screen).toContainEqual(
      expect.objectContaining({ label: "Status", open: true })
    )
    expect(screen.at(-1)).toEqual({
      ref: "more",
      component: "more",
      more: expect.any(Number),
      use: "query",
      actions: [],
    })
    expect(screen.at(-1)!.more).toBeGreaterThanOrEqual(21)
  })
})

describe("agent press", () => {
  test("presses the button a component is, and a button inside an open one", async () => {
    const agent = createAgent()
    const { button } = await import("../src/components/button/button")
    const instance = button({ id: "save" })
    const el = document.createElement("button")
    el.textContent = "Save"
    const onClick = vi.fn()
    el.addEventListener("click", onClick)
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const [component] = agent.snapshot()
    expect(component).toMatchObject({
      component: "button",
      label: "Save",
      actions: ["press"],
    })
    await agent.act({ steps: [{ ref: component.ref, action: "press" }] })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe("agent rows", () => {
  // A checkbox on a row of its own, beside the row's text.
  function mountRow(name: string) {
    const instance = checkbox({ id: `pick-${name}` })
    const row = document.createElement("li")
    const text = document.createElement("span")
    text.textContent = `${name} Admin`
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Select")
    row.append(text, el)
    document.body.append(row)
    const unbind = bind(instance.part("root"), el)
    return () => {
      unbind()
      instance.destroy()
      row.remove()
    }
  }

  test("a component on a row carries the row's text, so rows with the same controls differ", () => {
    const agent = createAgent()
    cleanups.push(mountRow("Priya Shah"), mountRow("Tom Becker"))
    const shown = agent.snapshot().filter((component) => !component.offPage)
    expect(shown.map((component) => component.row)).toEqual([
      "Priya Shah Admin",
      "Tom Becker Admin",
    ])
  })

  test("a table's header row adds no row text, so a header button is found by its label", async () => {
    const agent = createAgent()
    const table = document.createElement("table")
    table.innerHTML =
      "<thead><tr><th><button>Email</button></th><th><button>Status</button></th></tr></thead>" +
      "<tbody><tr><th>Row</th><td><button>Edit</button></td></tr></tbody>"
    document.body.append(table)
    const pressed: string[] = []
    for (const el of table.querySelectorAll("button")) {
      const instance = button({ id: el.textContent! })
      el.addEventListener("click", () => pressed.push(el.textContent!))
      cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    }
    const rows = Object.fromEntries(
      agent
        .snapshot()
        .filter((component) => !component.offPage)
        .map((component) => [component.label, component.row])
    )
    expect(rows).toEqual({ Email: undefined, Status: undefined, Edit: "Row" })
    expect(
      await agent.act({ steps: [{ ref: "Email", action: "press" }] })
    ).toMatchObject({ ok: true })
    expect(pressed).toEqual(["Email"])
  })

  test("a component that leaves and comes back, like a tab's, keeps its ref", () => {
    const agent = createAgent()
    const unmount = mountRow("Priya Shah")
    const [{ ref }] = agent.snapshot()
    unmount()
    expect(
      agent.snapshot().find((component) => component.ref === ref)?.offPage
    ).toBe(true)
    cleanups.push(mountRow("Priya Shah"))
    const back = agent.snapshot().filter((component) => component.ref === ref)
    expect(back).toHaveLength(1)
    expect(back[0].offPage).toBeUndefined()
  })
})

describe("agent refs", () => {
  // A checkbox in a label, optionally on a row, that can leave the page early.
  function mountLabeled(
    options: Parameters<typeof checkbox>[0],
    text: string,
    row?: string
  ) {
    const instance = checkbox(options)
    const label = document.createElement("label")
    const el = document.createElement("button")
    label.append(el, text)
    const host = row ? document.createElement("li") : label
    if (row) {
      host.append(row, label)
    }
    document.body.append(host)
    const unbind = bind(instance.part("root"), el)
    let mounted = true
    const unmount = () => {
      if (!mounted) {
        return
      }
      mounted = false
      unbind()
      instance.destroy()
      host.remove()
    }
    cleanups.push(unmount)
    return { instance, unmount }
  }

  test("twins with the same label that leave and come back keep their own refs, with no off-page copy left", async () => {
    const agent = createAgent()
    const a = mountLabeled({ id: "twin-a", defaultChecked: true }, "Notify me")
    const b = mountLabeled({ id: "twin-b" }, "Notify me")
    const [refA, refB] = agent.snapshot().map((component) => component.ref)
    a.unmount()
    b.unmount()
    const a2 = mountLabeled(
      { id: "twin-a2", defaultChecked: true },
      "Notify me"
    )
    const b2 = mountLabeled({ id: "twin-b2" }, "Notify me")
    const twins = agent
      .snapshot()
      .filter((component) => component.label === "Notify me")
    expect(twins).toEqual([
      expect.objectContaining({ ref: refA, checked: true }),
      expect.objectContaining({ ref: refB, checked: false }),
    ])
    expect(twins.some((component) => component.offPage)).toBe(false)
    await agent.act({
      steps: [{ ref: refB, action: "setChecked", args: [true] }],
    })
    expect(a2.instance.get().checked).toBe(true)
    expect(b2.instance.get().checked).toBe(true)
  })

  test("only the last 500 labels that left keep a ref for when they come back", () => {
    const agent = createAgent()
    // A text field named by `aria-label`, which the agent reads quickly.
    const mountField = (label: string) => {
      const instance = input({ id: label })
      const el = document.createElement("input")
      el.setAttribute("aria-label", label)
      document.body.append(el)
      const unbind = bind(instance.part("root"), el)
      const ref = agent
        .snapshot()
        .find(
          (component) => component.label === label && !component.offPage
        )?.ref
      const unmount = () => {
        unbind()
        instance.destroy()
        el.remove()
      }
      return { ref, unmount }
    }
    const first = mountField("Note 0")
    first.unmount()
    let last = first
    for (let index = 1; index <= 500; index++) {
      last = mountField(`Note ${index}`)
      last.unmount()
    }
    const again = mountField("Note 0")
    const lastAgain = mountField("Note 500")
    cleanups.push(again.unmount, lastAgain.unmount)
    expect(again.ref).not.toBe(first.ref)
    expect(lastAgain.ref).toBe(last.ref)
  })

  test("a row's text leaves out the component's own label", () => {
    const agent = createAgent()
    mountLabeled({ id: "row-alice" }, "Make admin", "Alice")
    expect(
      agent.snapshot().find((component) => component.label === "Make admin")
        ?.row
    ).toBe("Alice")
  })

  test("a component keeps its ref when its row's text changed before it left", () => {
    const agent = createAgent()
    const instance = checkbox({ id: "pick" })
    const row = document.createElement("li")
    const text = document.createElement("span")
    text.textContent = "Priya Shah Member"
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Select")
    row.append(text, el)
    document.body.append(row)
    const unbind = bind(instance.part("root"), el)
    const [{ ref }] = agent.snapshot()
    text.textContent = "Priya Shah Admin"
    agent.snapshot()
    unbind()
    instance.destroy()
    const again = checkbox({ id: "pick-again" })
    cleanups.push(bind(again.part("root"), el), () => again.destroy())
    expect(
      agent
        .snapshot()
        .filter((component) => !component.offPage)
        .map((component) => component.ref)
    ).toEqual([ref])
  })
})

describe("agent act", () => {
  test("runs several steps in order, finds components by label or row text, and reports what they changed", async () => {
    const agent = createAgent()
    const onCheckedChange = vi.fn()
    mountCheckbox({ id: "terms", onCheckedChange })
    mountCheckbox({ id: "digest" }, "Send a weekly digest")
    const outcome = await agent.act({
      steps: [
        { ref: "Accept the terms", action: "setChecked", args: [true] },
        { ref: "weekly", action: "setChecked", args: [true] },
      ],
    })
    expect(onCheckedChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ source: "agent" })
    )
    expect(outcome).toMatchObject({
      ok: true,
      steps: [
        {
          step: 0,
          changes: [{ label: "Accept the terms", key: "checked", value: true }],
        },
        {
          step: 1,
          changes: [
            { label: "Send a weekly digest", key: "checked", value: true },
          ],
        },
      ],
    })
    expect(Object.entries(outcome.values)).toEqual(
      expect.arrayContaining([
        [expect.stringContaining("Accept the terms"), true],
        [expect.stringContaining("Send a weekly digest"), true],
      ])
    )
  })

  test("names a component by whole words of its label, so part of a word matches nothing", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "username" }, "Username")
    const missed = await agent.act({
      steps: [{ ref: "Name", action: "setChecked", args: [true] }],
    })
    expect(missed.ok).toBe(false)
    expect(missed.error?.message).toContain('No component "Name"')
    const display = mountCheckbox({ id: "display-name" }, "Display name")
    const found = await agent.act({
      steps: [{ ref: "name", action: "setChecked", args: [true] }],
    })
    expect(found.ok).toBe(true)
    expect(display.get().checked).toBe(true)
  })

  test("names a component ignoring accents and case", async () => {
    const agent = createAgent()
    const region = mountCheckbox({ id: "fold-region" }, "Région")
    const city = mountCheckbox({ id: "fold-city" }, "İl")
    const street = mountCheckbox({ id: "fold-street" }, "Straße")
    const town = mountCheckbox({ id: "fold-town" }, "Łódź")
    const company = mountCheckbox({ id: "fold-company" }, "Ørsted")
    const outcome = await agent.act({
      steps: [
        { ref: "Region", action: "setChecked", args: [true] },
        { ref: "il", action: "setChecked", args: [true] },
        { ref: "STRASSE", action: "setChecked", args: [true] },
        { ref: "lodz", action: "setChecked", args: [true] },
        { ref: "orsted", action: "setChecked", args: [true] },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(
      [region, city, street, town, company].map(
        (instance) => instance.get().checked
      )
    ).toEqual([true, true, true, true, true])
  })

  test("labels that differ only by an accent name both components, with their refs", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "fold-resume" }, "Résumé")
    mountCheckbox({ id: "fold-resume-plain" }, "Resume")
    const refs = agent
      .snapshot()
      .filter(
        (component) =>
          !component.offPage && /^r[eé]sum[eé]$/i.test(component.label ?? "")
      )
      .map((component) => `${component.ref} ${component.label}`)
    const outcome = await agent.act({
      steps: [{ ref: "resume", action: "setChecked", args: [true] }],
    })
    expect(outcome.error?.message).toBe(
      `"resume" names 2 components: ${refs.join(", ")}. Use a ref. A page tells them apart with a word in one label the other lacks, like a verb or the row's name.`
    )
  })

  test("an exact label doesn't beat a row that holds the same words, since page text can be anyone's", async () => {
    const agent = createAgent()
    const row = (html: string, id: string) => {
      const instance = checkbox({ id })
      const el = document.createElement("div")
      el.setAttribute("role", "row")
      el.innerHTML = html
      document.body.append(el)
      cleanups.push(
        bind(instance.part("root"), el.querySelector("button")!),
        () => instance.destroy()
      )
      return instance
    }
    const jane = row(
      `<span>Jane Doe</span> <span>jane@acme.com</span><button aria-label="Admin"></button>`,
      "jane"
    )
    const other = row(`<button aria-label="Jane Doe"></button>`, "other")
    const outcome = await agent.act({
      steps: [{ ref: "Jane Doe", action: "setChecked", args: [true] }],
    })
    expect(outcome.error?.message).toMatch(
      /"Jane Doe" names 2 components: c\d+ Admin \(Jane Doe jane@acme\.com\), c\d+ Jane Doe\. Use a ref\. A page tells them apart with a word in one label the other lacks, like a verb or the row's name\./
    )
    expect([jane.get().checked, other.get().checked]).toEqual([false, false])
  })

  test("an open component whose label only holds the words doesn't beat the exact label", async () => {
    const agent = createAgent()
    const el = document.body.appendChild(document.createElement("button"))
    el.textContent = "System"
    const pressed = vi.fn()
    el.addEventListener("click", pressed)
    const own = button({ id: "system" })
    const row = collapsible({ id: "tool-call", defaultOpen: true })
    const root = document.body.appendChild(document.createElement("div"))
    root.setAttribute("aria-label", "Read live-system.png")
    const trigger = root.appendChild(document.createElement("button"))
    trigger.textContent = "read live-system.png"
    const panel = root.appendChild(
      Object.assign(document.createElement("div"), {
        textContent: "image",
        getAnimations: () => [],
      })
    )
    cleanups.push(
      bind(own.part("root"), el),
      bind(row.part("root"), root),
      bind(row.part("trigger"), trigger),
      bind(row.part("panel"), panel),
      () => [own, row].forEach((instance) => instance.destroy())
    )
    const outcome = await agent.act({
      steps: [{ ref: "System", action: "press" }],
    })
    expect(outcome.error?.message).toMatch(/"System" names 2 components/)
    expect(pressed).not.toHaveBeenCalled()
    expect(row.get().open).toBe(true)
  })

  test("a label that matches exactly still wins when nothing else holds its words", async () => {
    const agent = createAgent()
    const name = mountCheckbox({ id: "name" }, "Name")
    mountCheckbox({ id: "email" }, "Email")
    const outcome = await agent.act({
      steps: [{ ref: "name", action: "setChecked", args: [true] }],
    })
    expect(outcome.ok).toBe(true)
    expect(name.get().checked).toBe(true)
  })

  test("stops at the first step that fails and says which", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms" })
    mountCheckbox({ id: "digest" }, "Send a weekly digest")
    const outcome = await agent.act({
      steps: [
        { ref: "Accept the terms", action: "setChecked", args: [true] },
        { ref: "Send", action: "setValue", args: ["x"] },
        { ref: "Send a weekly digest", action: "setChecked", args: [true] },
      ],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { step: 1, message: expect.stringContaining("takes no setValue") },
    })
    expect(outcome.steps).toHaveLength(1)
  })

  test("a label that names two components is refused, with their refs", async () => {
    const agent = createAgent()
    mountCheckbox({ id: "a" }, "Deploy failures")
    mountCheckbox({ id: "b" }, "Deploy failures")
    const outcome = await agent.act({
      steps: [{ ref: "Deploy failures", action: "setChecked", args: [true] }],
    })
    expect(outcome.error?.message).toMatch(/names 2 components/)
  })

  test("a press by label on a Button that opens a tooltip and a menu presses the Button", async () => {
    const agent = createAgent()
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Account")
    const clicked = vi.fn()
    el.addEventListener("click", clicked)
    const own = button({ id: "account" })
    const hint = tooltip({ id: "account-hint" })
    const actions = menu({ id: "account-menu" })
    cleanups.push(
      bind(own.part("root"), el),
      bind(hint.part("trigger"), el),
      bind(actions.part("trigger"), el),
      () => [own, hint, actions].forEach((instance) => instance.destroy())
    )
    const outcome = await agent.act({
      steps: [{ ref: "Account", action: "press" }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  test("the snapshot leaves out a closed tooltip whose trigger is a listed Button", () => {
    const agent = createAgent()
    const el = document.body.appendChild(document.createElement("button"))
    el.setAttribute("aria-label", "Account")
    const plain = document.body.appendChild(document.createElement("button"))
    plain.setAttribute("aria-label", "Help")
    const own = button({ id: "account" })
    const hint = tooltip({ id: "account-hint" })
    const help = tooltip({ id: "help-hint" })
    cleanups.push(
      bind(own.part("root"), el),
      bind(hint.part("trigger"), el),
      bind(help.part("trigger"), plain),
      () => [own, hint, help].forEach((instance) => instance.destroy())
    )
    expect(
      agent
        .snapshot()
        .filter((component) => !component.offPage)
        .map(({ component, label }) => [component, label])
    ).toEqual([
      ["button", "Account"],
      ["tooltip", "Help"],
    ])
  })

  test("a press with the text of a button in the dialog a Button opens is on the dialog", async () => {
    const agent = createAgent()
    const el = document.body.appendChild(document.createElement("button"))
    el.textContent = "Delete project"
    const content = document.body.appendChild(document.createElement("div"))
    const remove = content.appendChild(document.createElement("button"))
    remove.textContent = "Delete forever"
    const clicked = vi.fn()
    remove.addEventListener("click", clicked)
    const own = button({ id: "delete" })
    const confirm = dialog({ id: "delete-dialog" })
    cleanups.push(
      bind(own.part("root"), el),
      bind(confirm.part("trigger"), el),
      bind(confirm.part("content"), content),
      () => [own, confirm].forEach((instance) => instance.destroy())
    )
    const outcome = await agent.act({
      steps: [
        { ref: "Delete project", action: "press", args: ["Delete forever"] },
      ],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  test("setValue takes an item's label as well as its value", async () => {
    const agent = createAgent()
    const onValueChange = vi.fn()
    const instance = select({
      id: "region",
      items: [{ value: "fra", label: "Germany (Frankfurt)" }],
      onValueChange,
    })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Region")
    document.body.append(el)
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    await agent.act({
      steps: [
        { ref: "Region", action: "setValue", args: ["germany (frankfurt)"] },
      ],
    })
    expect(onValueChange).toHaveBeenCalledWith(
      "fra",
      expect.objectContaining({ source: "agent" })
    )
  })

  test("an accordion's open takes a section's label, and \"dialog\" names an alert dialog", async () => {
    const agent = createAgent()
    const instance = accordion({ id: "notifications" })
    for (const [value, text] of [
      ["email", "Email"],
      ["slack", "Slack"],
    ]) {
      const item = document.createElement("div")
      const trigger = document.createElement("button")
      trigger.textContent = text
      item.append(trigger)
      document.body.append(item)
      cleanups.push(
        bind(instance.part("item", { value }), item),
        bind(instance.part("trigger", { value }), trigger)
      )
    }
    cleanups.push(() => instance.destroy())
    const behind = await agent.act({
      steps: [{ ref: "Deploy failures", action: "setChecked", args: [true] }],
    })
    expect(behind.error?.message).toMatch(
      /behind one of these.*accordion \(c\d+\): Email, Slack/
    )
    const outcome = await agent.act({
      steps: [{ ref: "Email", action: "open", args: ["Email"] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get().value).toEqual(["email"])
    const missing = await agent.act({
      steps: [{ ref: "dialog", action: "press", args: ["Remove"] }],
    })
    expect(missing.error?.message).toMatch(/No component "dialog"/)
  })

  test("a step finds a component inside a closed accordion section and opens it", async () => {
    const agent = createAgent()
    // The section's switch mounts once Email opens, as adapters render a closed panel.
    let unmount: (() => void) | undefined
    const instance = accordion({
      id: "channels",
      onValueChange: (value) => {
        unmount?.()
        unmount = undefined
        if (value.includes("email")) {
          const checkbox = mountCheckbox({ id: "deploys" }, "Deploy failures")
          unmount = () => checkbox.destroy()
        }
      },
    })
    for (const [value, text] of [
      ["slack", "Slack"],
      ["email", "Email"],
    ]) {
      const item = document.createElement("div")
      const trigger = document.createElement("button")
      trigger.textContent = text
      item.append(trigger)
      document.body.append(item)
      cleanups.push(
        bind(instance.part("item", { value }), item),
        bind(instance.part("trigger", { value }), trigger)
      )
    }
    cleanups.push(() => instance.destroy())
    const outcome = await agent.act({
      steps: [{ ref: "Deploy failures", action: "setChecked", args: [true] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get().value).toEqual(["email"])
    expect(Object.entries(outcome.values)).toContainEqual([
      expect.stringContaining("Deploy failures"),
      true,
    ])
  })

  test("a slider given text takes the number in it", async () => {
    const agent = createAgent()
    const instance = slider({
      id: "retention",
      min: 30,
      max: 365,
      defaultValue: 30,
    })
    const root = document.createElement("div")
    root.setAttribute("aria-label", "Data retention")
    document.body.append(root)
    cleanups.push(bind(instance.part("root"), root), () => instance.destroy())
    await agent.act({
      steps: [{ ref: "Data retention", action: "setValue", args: ["90 days"] }],
    })
    expect(instance.get().value).toBe(90)
    const outcome = await agent.act({
      steps: [{ ref: "Data retention", action: "setValue", args: ["a lot"] }],
    })
    expect(outcome.error?.message).toMatch(/takes a number/)
  })

  test("a number field refuses text with grouped digits, which would read as the first group", async () => {
    const agent = createAgent()
    const instance = numberInput({ id: "price", defaultValue: 10 })
    const el = document.body.appendChild(document.createElement("input"))
    el.setAttribute("aria-label", "Price")
    cleanups.push(bind(instance.part("control"), el), () => instance.destroy())
    for (const text of ["1,499.5", "1 499", "1.499,5"]) {
      const outcome = await agent.act({
        steps: [{ ref: "Price", action: "setValue", args: [text] }],
      })
      expect(outcome.error?.message).toMatch(/takes a number/)
    }
    expect(instance.get().value).toBe(10)
    await agent.act({
      steps: [{ ref: "Price", action: "setValue", args: ["1499"] }],
    })
    expect(instance.get().value).toBe(1499)
  })

  test("a select with a few items shows them", () => {
    const agent = createAgent()
    const instance = select({
      id: "visibility",
      items: ["Private", "Internal", "Public"],
    })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Visibility")
    document.body.append(el)
    cleanups.push(bind(instance.part("trigger"), el), () => instance.destroy())
    const visibility = agent
      .snapshot()
      .find((component) => component.label === "Visibility")
    expect(visibility?.items).toEqual([
      { value: "Private", label: "Private" },
      { value: "Internal", label: "Internal" },
      { value: "Public", label: "Public" },
    ])
  })

  // A row's actions popover whose Remove button renders once it opens, the
  // way an adapter renders its content, and every open change it hears.
  async function mountActions({
    confirm,
    disabled,
    ariaDisabled,
    inDisabledFieldset,
    triggerId,
  }: {
    confirm?: string
    disabled?: boolean
    ariaDisabled?: boolean
    inDisabledFieldset?: boolean
    triggerId?: string
  } = {}) {
    const { popover } = await import("../src/components/popover/popover")
    const onClick = vi.fn()
    const changes: [boolean, string][] = []
    const content = Object.assign(document.createElement("div"), {
      getAnimations: () => [],
    })
    const instance = popover({
      id: "actions",
      onOpenChange: (open, details) => {
        changes.push([open, details.source])
        if (!open) {
          return content.replaceChildren()
        }
        const remove = document.createElement("button")
        remove.textContent = "Remove"
        if (confirm) {
          remove.setAttribute("data-agent-confirm", confirm)
        }
        remove.disabled = !!disabled
        if (ariaDisabled) {
          remove.setAttribute("aria-disabled", "true")
        }
        remove.addEventListener("click", onClick)
        if (inDisabledFieldset) {
          const fieldset = content.appendChild(
            document.createElement("fieldset")
          )
          fieldset.disabled = true
          fieldset.append(remove)
        } else {
          content.append(remove)
        }
      },
    })
    const trigger = document.createElement("button")
    trigger.setAttribute("aria-label", "Actions for Tom Becker")
    document.body.append(trigger, content)
    cleanups.push(
      bind(
        instance.part("trigger", triggerId ? { id: triggerId } : undefined),
        trigger
      ),
      bind(instance.part("content"), content),
      () => instance.destroy()
    )
    return { instance, onClick, changes }
  }

  test("press opens a closed popup to press a button inside it", async () => {
    const agent = createAgent()
    const { onClick } = await mountActions()
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["remove"] }],
    })
    // The popover stays open here, since its button doesn't close it, and the step says what it pressed.
    expect(outcome).toMatchObject({
      ok: true,
      steps: [
        {
          result: expect.stringMatching(
            /^Pressed "Remove", after opening c\d+\.$/
          ),
        },
      ],
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test("press with no text clicks a closed popup's trigger, which opens it", async () => {
    const agent = createAgent()
    const { instance } = await mountActions()
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press" }],
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(instance.get().open).toBe(true)
  })

  test("press with no text opens a popup whose one trigger has a key, like a web component's id", async () => {
    const agent = createAgent()
    const { instance } = await mountActions({ triggerId: "auto-1" })
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press" }],
    })
    expect(outcome).toMatchObject({ ok: true })
    expect(instance.get().open).toBe(true)
  })

  test("a press on a disabled button fails, and closes the popup it opened", async () => {
    const agent = createAgent()
    const { instance, onClick } = await mountActions({ disabled: true })
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('"Remove"') },
    })
    expect(outcome.error?.message).toContain("disabled")
    expect(instance.get().open).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press on an aria-disabled button fails, and closes the popup it opened", async () => {
    const agent = createAgent()
    const { instance, onClick } = await mountActions({ ariaDisabled: true })
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('"Remove"') },
    })
    expect(outcome.error?.message).toContain("disabled")
    expect(instance.get().open).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press on a disabled button in a popup the person opened fails, and leaves it open", async () => {
    const agent = createAgent()
    const { instance, onClick } = await mountActions({ disabled: true })
    ;(instance.api as unknown as { setOpen: (open: boolean) => void }).setOpen(
      true
    )
    await vi.waitFor(() => expect(instance.get().open).toBe(true))
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome.ok).toBe(false)
    expect(instance.get().open).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press on a button a disabled fieldset disables fails", async () => {
    const agent = createAgent()
    const { onClick } = await mountActions({ inDisabledFieldset: true })
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("disabled") },
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press on a button disabled while its confirmation is pending fails, and closes the popup", async () => {
    let answer: ((allowed: boolean) => void) | undefined
    const agent = createAgent({
      allow: (step) =>
        !step.confirm || new Promise<boolean>((resolve) => (answer = resolve)),
    })
    const { instance, onClick } = await mountActions({
      confirm: "Removes Tom from the team",
    })
    const outcome = agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    await vi.waitFor(() => expect(answer).toBeDefined())
    const remove = [...document.querySelectorAll("button")].find(
      (el) => el.textContent === "Remove"
    )!
    remove.disabled = true
    answer!(true)
    const result = await outcome
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('"Remove"') },
    })
    expect(result.error?.message).toContain("disabled")
    expect(instance.get().open).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press allow refuses doesn't open the popup", async () => {
    const allow = vi.fn(() => false)
    const agent = createAgent({ allow })
    const { instance, changes } = await mountActions()
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome.error?.message).toMatch(/^The app refused press on c\d+\.$/)
    expect(allow).toHaveBeenCalledWith(
      expect.objectContaining({ action: "press", args: ["Remove"] }),
      expect.anything()
    )
    expect(changes).toEqual([])
    expect(instance.get().open).toBe(false)
  })

  test("a press refused once its button shows closes the popup it opened", async () => {
    const agent = createAgent({ allow: (step) => !step.confirm })
    const { instance, onClick, changes } = await mountActions({
      confirm: "Removes Tom from the team",
    })
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(outcome.error?.message).toBe(
      'The person said no to "Removes Tom from the team".'
    )
    expect(changes).toEqual([
      [true, "agent"],
      [false, "agent"],
    ])
    expect(instance.get().open).toBe(false)
    expect(onClick).not.toHaveBeenCalled()

    const alone = await createAgent().act({
      steps: [{ ref: "Tom Becker", action: "press", args: ["Remove"] }],
    })
    expect(alone.error?.message).toMatch(/^Needs a person/)
    expect(instance.get().open).toBe(false)
  })

  test("a dialog shared by many triggers lists them, and a press opens it through the one it names", async () => {
    const agent = createAgent()
    const instance = dialog({ id: "edit" })
    const clicked: string[] = []
    for (const card of ["Alpha", "Beta"]) {
      const trigger = document.body.appendChild(
        document.createElement("button")
      )
      trigger.textContent = `Edit ${card}`
      trigger.addEventListener("click", () => clicked.push(card))
      cleanups.push(
        bind(instance.part("trigger", { id: card, payload: card }), trigger)
      )
    }
    cleanups.push(() => instance.destroy())
    const [component] = agent.snapshot().filter((found) => !found.offPage)
    expect(component).toMatchObject({
      component: "dialog",
      buttons: ["Edit Alpha", "Edit Beta"],
    })
    expect(component.actions).toContain("press")
    const outcome = await agent.act({
      steps: [{ ref: component.ref, action: "press", args: ["Edit Beta"] }],
    })
    expect(outcome.ok, outcome.error?.message).toBe(true)
    expect(clicked).toEqual(["Beta"])
    expect(instance.get()).toMatchObject({ open: true, payload: "Beta" })
  })

  test("a refused press returns once the dialog it opened has left the page", async () => {
    let unbindOpen: (() => void)[] = []
    const content = Object.assign(document.createElement("div"), {
      getAnimations: () => [],
    })
    const instance = dialog({
      id: "delete",
      onOpenChange: (open) => {
        if (!open) {
          requestAnimationFrame(() => {
            unbindOpen.forEach((unbind) => unbind())
            unbindOpen = []
            content.replaceChildren()
          })
          return
        }
        const title = document.createElement("h2")
        title.textContent = "Delete Apollo?"
        const remove = document.createElement("button")
        remove.textContent = "Delete forever"
        remove.setAttribute("data-agent-confirm", "Deletes the project")
        content.append(title, remove)
        unbindOpen = [
          bind(instance.part("content"), content),
          bind(instance.part("title"), title),
        ]
      },
    })
    const trigger = document.createElement("button")
    trigger.textContent = "Delete project"
    document.body.append(trigger, content)
    cleanups.push(bind(instance.part("trigger"), trigger), () => {
      unbindOpen.forEach((unbind) => unbind())
      instance.destroy()
    })
    let approve = false
    const agent = createAgent({ allow: (step) => !step.confirm || approve })
    const remove = {
      steps: [
        { ref: "Delete project", action: "press", args: ["Delete forever"] },
      ],
    }

    expect((await agent.act(remove)).error?.message).toBe(
      'The person said no to "Deletes the project".'
    )
    approve = true
    expect(await agent.act(remove)).toMatchObject({ ok: true })
  })

  test("query and a refused step's message read a closed popup without opening it", async () => {
    const agent = createAgent()
    const { changes } = await mountActions()
    expect(await agent.query({ within: "Tom Becker" })).toEqual([
      expect.objectContaining({ items: [] }),
    ])
    const outcome = await agent.act({
      steps: [{ ref: "Tom Becker", action: "setValue", args: ["x"] }],
    })
    expect(outcome.error?.message).toMatch(
      /press takes the text of a button inside it, and opens it first/
    )
    expect(changes).toEqual([])
  })

  // A select without item data, whose items render only while it's open.
  function mountRenderedRegion(
    onOpenChange: (open: boolean) => void = () => {}
  ) {
    const content = document.createElement("div")
    const unbindItems: (() => void)[] = []
    const instance: ReturnType<typeof select> = select({
      id: "rendered-region",
      onOpenChange: (open) => {
        onOpenChange(open)
        unbindItems.splice(0).forEach((unbind) => unbind())
        content.replaceChildren()
        if (!open) {
          return
        }
        for (const [value, label] of [
          ["de", "Germany"],
          ["fr", "France"],
        ]) {
          const item = document.createElement("div")
          item.textContent = label
          content.append(item)
          unbindItems.push(bind(instance.part("item", { value }), item))
        }
      },
    })
    const trigger = document.createElement("button")
    trigger.setAttribute("aria-label", "Region")
    document.body.append(trigger, content)
    cleanups.push(bind(instance.part("trigger"), trigger), () => {
      unbindItems.forEach((unbind) => unbind())
      instance.destroy()
    })
    return instance
  }

  test("a list whose items show only while it's open is opened for a label only once allow lets the step", async () => {
    const onOpenChange = vi.fn()
    const refused = createAgent({ allow: () => false })
    const instance = mountRenderedRegion(onOpenChange)
    const refusal = await refused.act({
      steps: [{ ref: "Region", action: "setValue", args: ["Germany"] }],
    })
    expect(refusal.ok).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()

    const asked: unknown[][] = []
    const allow = (step: { args: unknown[] }) => asked.push(step.args) > 0
    const outcome = await createAgent({ allow }).act({
      steps: [{ ref: "Region", action: "setValue", args: ["Germany"] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get().value).toBe("de")
    // Before it opens, with the label the agent gave, and then with the item's value.
    expect(asked).toEqual([["Germany"], ["de"]])
  })

  test("query on a list whose items show only while it's open leaves it closed and says how act reaches them", async () => {
    const onOpenChange = vi.fn()
    mountRenderedRegion(onOpenChange)
    const [region] = (await createAgent().query({
      within: "Region",
    })) as AgentComponent[]
    expect(region).toMatchObject({
      items: [],
      note: expect.stringMatching(/act's setValue takes an item's label/),
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  test("on a long page, act's values keep the fields it touched or changed, then others up to 100, and how many more", async () => {
    const agent = createAgent()
    for (let index = 0; index < 150; index++) {
      mountCheckbox({ id: `admin-${index}` }, `Admin ${index}`)
    }
    const outcome = await agent.act({
      steps: [{ ref: "Admin 149", action: "setChecked", args: [true] }],
    })
    const { more, ...fields } = outcome.values
    expect(Object.keys(fields)).toHaveLength(100)
    // At least the 50 checkboxes past the first 100, and fields earlier tests left off the page.
    expect(more).toBeGreaterThanOrEqual(50)
    expect(fields[`${outcome.steps[0].ref} Admin 149`]).toBe(true)
  })
})

describe("a custom action that returns a Promise", () => {
  const drafts = definePrimitive({
    name: "drafts",
    state: (_options: {}) => ({}),
    api: () => ({
      save: async (fails: boolean) => {
        await Promise.resolve()
        if (fails) {
          throw new Error("The server is down.")
        }
      },
    }),
    slots: (slot) => ({
      root: slot({ attrs: () => ({ "aria-label": "Drafts" }) }),
    }),
    agent: { actions: ["save"] },
  })

  function mount() {
    const instance = drafts({ id: "drafts" })
    const el = document.body.appendChild(document.createElement("div"))
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  }

  test("is still running when the step ends", async () => {
    const agent = createAgent()
    mount()
    const outcome = await agent.act({
      steps: [{ ref: "Drafts", action: "save", args: [false] }],
    })
    expect(outcome).toMatchObject({ ok: true, steps: [{ result: "pending" }] })
  })

  test("fails the step when it rejects before the step ends", async () => {
    const agent = createAgent()
    mount()
    const outcome = await agent.act({
      steps: [{ ref: "Drafts", action: "save", args: [true] }],
    })
    expect(outcome.ok).toBe(false)
    expect(JSON.stringify(outcome)).toContain("The server is down.")
  })
})

describe("a primitive's agent key", () => {
  // A size picker built from scratch, the way someone builds their own primitive.
  const sizes = (agent?: Parameters<typeof definePrimitive>[0]["agent"]) =>
    definePrimitive({
      name: "size-picker",
      options: { visible: "boolean" },
      state: (options: { visible?: boolean }) => ({
        value: "m",
        items: ["s", "m", "l"],
        visible: options.visible ?? true,
      }),
      api: ({ store }) => ({
        setValue: (value: string) => store.set({ value }),
        resetSizes: () => store.set({ value: "m" }),
      }),
      slots: (slot) => ({
        root: slot({ attrs: () => ({ "aria-label": "Size" }) }),
      }),
      agent,
    })

  function mount(
    primitive: ReturnType<typeof sizes>,
    options: { visible?: boolean } = {}
  ) {
    const instance = primitive({ id: "size", ...options })
    const el = document.createElement("div")
    // As a framework writes the root's attributes.
    el.setAttribute("aria-label", "Size")
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    return instance
  }

  test("without one, the actions are the api's methods named like a change", () => {
    const agent = createAgent()
    mount(sizes())
    expect(agent.snapshot()[0].actions).toEqual(["setValue", "resetSizes"])
  })

  test("its items show in the snapshot when none are on the page", () => {
    const agent = createAgent()
    mount(sizes())
    expect(agent.snapshot()[0].items).toEqual([
      { value: "s", label: "s" },
      { value: "m", label: "m" },
      { value: "l", label: "l" },
    ])
  })

  test("the items its agent key gives show in the snapshot for any action", async () => {
    const steps = [
      { value: "account", label: "Account" },
      { value: "profile", label: "Profile" },
    ]
    const stepper = definePrimitive({
      name: "stepper",
      state: () => ({ value: "account" }),
      api: ({ store }) => ({ goTo: (value: string) => store.set({ value }) }),
      slots: (slot) => ({
        root: slot({ attrs: () => ({ "aria-label": "Signup" }) }),
      }),
      agent: { actions: ["goTo"], items: () => steps },
    })
    const instance = stepper({ id: "signup" })
    const el = document.createElement("div")
    el.setAttribute("aria-label", "Signup")
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    const agent = createAgent()
    const [{ ref, items }] = agent.snapshot()
    expect(items).toEqual(steps)
    expect(
      (
        await agent.act({
          steps: [{ ref, action: "goTo", args: [items![1].value] }],
        })
      ).ok
    ).toBe(true)
    expect(instance.get()).toMatchObject({ value: "profile" })
  })

  test("its actions are the only ones an agent sees and takes", async () => {
    const agent = createAgent()
    mount(sizes({ actions: ["setValue"] }))
    const [{ ref, actions }] = agent.snapshot()
    expect(actions).toEqual(["setValue"])
    const outcome = await agent.act({
      steps: [{ ref, action: "resetSizes", args: [] }],
    })
    expect(outcome.ok).toBe(false)
  })

  test("a closed list refuses text that names none of its items", async () => {
    const agent = createAgent()
    const open = mount(sizes({ actions: ["setValue"] }))
    const [{ ref }] = agent.snapshot()
    await agent.act({ steps: [{ ref, action: "setValue", args: ["xl"] }] })
    expect(open.get()).toMatchObject({ value: "xl" })
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    const closed = mount(sizes({ actions: ["setValue"], closed: true }))
    const [{ ref: closedRef }] = agent.snapshot()
    const outcome = await agent.act({
      steps: [{ ref: closedRef, action: "setValue", args: ["xl"] }],
    })
    expect(outcome.ok).toBe(false)
    expect(closed.get()).toMatchObject({ value: "m" })
  })

  test("an action with no option in the schema takes its arguments unchecked", async () => {
    const agent = createAgent()
    const instance = mount(sizes({ actions: ["setValue"] }))
    const outcome = await agent.act({
      steps: [{ ref: "Size", action: "setValue", args: [42] }],
    })
    expect(outcome.ok).toBe(true)
    expect(instance.get()).toMatchObject({ value: 42 })
  })

  test("an input in a group with a clear button is one input, and clears by its label", async () => {
    const agent = createAgent()
    const field = input({ id: "website", defaultValue: "example.com" })
    const group = inputGroup({ id: "website-group" })
    const label = document.createElement("label")
    label.htmlFor = "website"
    label.textContent = "Website"
    const wrapper = document.createElement("div")
    const el = document.createElement("input")
    el.id = "website"
    const clear = document.createElement("button")
    clear.setAttribute("aria-label", "Clear website")
    wrapper.append(el, clear)
    document.body.append(label, wrapper)
    cleanups.push(
      bind(group.part("group"), wrapper),
      bind(field.part("root"), el),
      bind(group.part("clear"), clear),
      () => group.destroy(),
      () => field.destroy()
    )
    await Promise.resolve()
    expect(
      agent.snapshot().filter((component) => !component.offPage)
    ).toMatchObject([
      { component: "input", label: "Website", actions: ["setValue", "clear"] },
    ])
    const outcome = await agent.act({
      steps: [{ ref: "Website", action: "clear" }],
    })
    expect(outcome.error).toBeUndefined()
    expect(el.value).toBe("")
  })

  test("shown hides it from the agent while it returns false", () => {
    const agent = createAgent()
    mount(
      sizes({ shown: (state) => (state as { visible: boolean }).visible }),
      { visible: false }
    )
    expect(
      agent.snapshot().filter((component) => !component.offPage)
    ).toHaveLength(0)
  })

  test("a separator on the page is never listed, since it has nothing to read or change", () => {
    const agent = createAgent()
    const instance = separator({ id: "rule" })
    const el = document.createElement("hr")
    document.body.append(el)
    cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
    expect(
      agent.snapshot().map((component) => component.component)
    ).not.toContain("separator")
  })

  test("a toast region is listed only while it holds a toast", () => {
    const agent = createAgent()
    const toast = createToaster({ overlays: createOverlays() })
    const instance = toastRegion({ id: "toasts", toaster: toast })
    const el = document.createElement("div")
    document.body.append(el)
    cleanups.push(bind(instance.part("region"), el), () => instance.destroy())
    const listed = () =>
      agent.snapshot().map((component) => component.component)
    expect(listed()).not.toContain("toast")
    toast("Saved")
    expect(listed()).toContain("toast")
  })
})

describe("agent source", () => {
  test("names where the app writes a component, from the nearest stamped element", () => {
    const agent = createAgent()
    const wrapper = document.createElement("div")
    wrapper.setAttribute("data-review-loc", "components/settings.tsx:12")
    document.body.append(wrapper)
    const instance = checkbox({ id: "notify" })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Notify me")
    wrapper.append(el)
    const unbind = bind(instance.part("root"), el)
    cleanups.push(() => {
      unbind()
      instance.destroy()
    })
    expect(agent.snapshot()[0]).toMatchObject({
      label: "Notify me",
      source: "components/settings.tsx:12",
    })
  })

  test("reads Svelte's element locations", () => {
    const agent = createAgent()
    const instance = checkbox({ id: "notify" })
    const el = document.createElement("button")
    el.setAttribute("aria-label", "Notify me")
    Object.assign(el, {
      __svelte_meta: { loc: { file: "src/lib/settings.svelte", line: 7 } },
    })
    document.body.append(el)
    const unbind = bind(instance.part("root"), el)
    cleanups.push(() => {
      unbind()
      instance.destroy()
    })
    expect(agent.snapshot()[0].source).toBe("src/lib/settings.svelte:7")
  })

  test("leaves it out when nothing says where", () => {
    const agent = createAgent()
    mountCheckbox({ id: "terms" })
    expect(agent.snapshot()[0]).not.toHaveProperty("source")
  })
})
