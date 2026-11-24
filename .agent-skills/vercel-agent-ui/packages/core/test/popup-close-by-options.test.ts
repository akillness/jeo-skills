// @vitest-environment jsdom
// A framework that renders options before it hands them over (`follow`)
// closes a popup through options its own listeners already deliver. The close
// must still take the content out of the page and report it once.
import { afterEach, expect, test } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { ref } from "../src/foundation/kernel/part"

Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

afterEach(() => document.body.replaceChildren())

const popups = { autocomplete, combobox, menu, popover, select }

test.each(Object.keys(popups))(
  "%s closed by options it follows leaves the page and reports it",
  async (name) => {
    const completed: boolean[] = []
    const onOpenChangeComplete = (open: boolean) => completed.push(open)
    const create = popups[
      name as keyof typeof popups
    ] as unknown as typeof popover
    let options = { id: name, open: false, onOpenChangeComplete }
    const instance = create(options)
    instance.follow(() => options)
    const el = document.body.appendChild(document.createElement("div"))
    ref(instance.part("content"), { by: "framework", attaches: "all" })(el)
    const hand = (open: boolean) => {
      options = { ...options, open }
      instance.setOptions(options)
    }
    hand(true)
    await new Promise((done) => setTimeout(done))
    hand(false)
    expect({
      state: instance.get(),
      closes: completed.filter((open) => !open),
    }).toMatchObject({
      state: { open: false, mounted: false },
      closes: [false],
    })
  }
)
