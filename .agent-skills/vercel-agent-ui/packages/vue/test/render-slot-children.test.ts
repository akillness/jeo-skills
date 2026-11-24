// @vitest-environment jsdom
// The `#render` slot's `children` is one component per part, so the element it
// renders stays, and it shows the part's latest content.
import { afterEach, expect, test } from "vitest"
import * as Vue from "vue"
import { compileTemplate } from "vue/compiler-sfc"
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type FunctionalComponent,
} from "vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "../src/accordion"
import { Rating, RatingItem } from "../src/rating"
import { Slider, SliderControl, SliderThumb } from "../src/slider"

Element.prototype.getAnimations ??= () => []

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(component: Parameters<typeof createApp>[0]) {
  const el = document.body.appendChild(document.createElement("div"))
  app = createApp(component)
  app.mount(el)
  return el
}

type RenderScope = {
  props: Record<string, unknown>
  children: FunctionalComponent
}

test("a #render slot's children show the part's new content from a template", async () => {
  const template = `
    <Accordion>
      <AccordionItem v-for="step in steps" :key="step.id" :value="step.id">
        <AccordionHeader>
          <AccordionTrigger>
            <template #render="{ props, children }"><button v-bind="props"><component :is="children" /></button></template>
            {{ step.label }}
          </AccordionTrigger>
        </AccordionHeader>
      </AccordionItem>
    </Accordion>`
  const { code } = compileTemplate({
    source: template,
    filename: "steps.vue",
    id: "steps",
    compilerOptions: { mode: "function" },
  })
  const render = new Function("Vue", code)(Vue)
  const steps = ref([{ id: "a", label: "Install" }])
  const el = mount({
    components: { Accordion, AccordionHeader, AccordionItem, AccordionTrigger },
    setup: () => ({ steps }),
    render,
  })
  expect(el.querySelector("button")!.textContent!.trim()).toBe("Install")
  steps.value = [{ id: "a", label: "Configure" }]
  await nextTick()
  expect(el.querySelector("button")!.textContent!.trim()).toBe("Configure")
})

test("a slider thumb rendered through #render passes a new aria-label to its input", async () => {
  const label = ref("Volume")
  const el = mount(
    defineComponent({
      setup: () => () =>
        h(Slider, { defaultValue: 50 }, () =>
          h(SliderControl, null, () =>
            h(
              SliderThumb,
              { "aria-label": label.value },
              {
                render: ({ props, children }: RenderScope) =>
                  h("span", props, h(children)),
              }
            )
          )
        ),
    })
  )
  const input = el.querySelector("input[type=range]")!
  expect(input.getAttribute("aria-label")).toBe("Volume")
  label.value = "Bass"
  await nextTick()
  expect(input.getAttribute("aria-label")).toBe("Bass")
  expect(el.querySelector("input[type=range]"), "the same input").toBe(input)
})

test("a focused input in a #render slot's children keeps focus when the content changes", async () => {
  const label = ref("Volume")
  const el = mount(
    defineComponent({
      setup: () => () =>
        h(Slider, { defaultValue: 50 }, () =>
          h(SliderControl, null, () =>
            h(
              SliderThumb,
              { "aria-label": label.value },
              {
                render: ({ props, children }: RenderScope) =>
                  h("span", props, h(children)),
              }
            )
          )
        ),
    })
  )
  const input = el.querySelector<HTMLInputElement>("input[type=range]")!
  input.focus()
  label.value = "Bass"
  await nextTick()
  expect(document.activeElement).toBe(input)
})

test("a rating star rendered through #render keeps its radios inside it", () => {
  const el = mount(
    defineComponent({
      setup: () => () =>
        h(Rating, null, () =>
          h(RatingItem, null, {
            render: ({ props, children }: RenderScope) =>
              h("span", { ...props, class: "star" }, h(children)),
          })
        ),
    })
  )
  const radios = [...el.querySelectorAll('[role="radio"]')]
  expect(radios).toHaveLength(5)
  expect(radios.every((radio) => radio.closest(".star"))).toBe(true)
})
