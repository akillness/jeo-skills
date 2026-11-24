// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectTrigger,
} from "../src"

const plans = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
]

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering", () => {
  test("a data select renders its value's label and a hidden input that submits it", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Select, { items: plans, name: "plan", defaultValue: "pro" }, () => [
            h(SelectLabel, null, () => "Plan"),
            h(SelectTrigger),
          ]),
      })
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="combobox"')
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
    expect(html).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
  })

  test("a combobox's input holds the value's label", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            Combobox,
            { items: plans, name: "plan", defaultValue: "pro" },
            () => [h(ComboboxInput), h(ComboboxContent)]
          ),
      })
    )
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="Pro"/)
  })

  test("a select with composed items shows its item's label before they mount", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Select, { name: "plan", defaultValue: "pro" }, () => [
            h(SelectTrigger),
            h(SelectContent, null, () =>
              plans.map((plan) => h(SelectItem, { key: plan.value, ...plan }))
            ),
          ]),
      })
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })

  test("a select with composed items shows its item's text, without the indicator", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Select, { defaultValue: "pro" }, () => [
            h(SelectTrigger),
            h(SelectContent, null, () =>
              plans.map((plan) =>
                h(SelectItem, { key: plan.value, value: plan.value }, () => [
                  h(SelectItemText, null, () => plan.label),
                  h(SelectItemIndicator, null, () => "✓"),
                ])
              )
            ),
          ]),
      })
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })

  test("a combobox's input holds the label of a composed item before it mounts", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Combobox, { name: "plan", defaultValue: "pro" }, () => [
            h(ComboboxInput),
            h(ComboboxContent, null, () =>
              h(ComboboxList, null, () =>
                plans.map((plan) =>
                  h(
                    ComboboxItem,
                    { key: plan.value, value: plan.value },
                    () => [
                      plan.label,
                      h(ComboboxItemIndicator, null, () => "✓"),
                    ]
                  )
                )
              )
            ),
          ]),
      })
    )
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="Pro"/)
  })

  test("an element with its own value, like an input, isn't taken for an item", async () => {
    const objects = plans.map((plan) => ({ id: plan.value, name: plan.label }))
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            Select,
            {
              defaultValue: objects[1],
              itemToValue: (plan: { id: string }) => plan.id.toString(),
            },
            () => [
              h(SelectTrigger),
              h(SelectContent, null, () => [
                h("input", { value: "pro", readonly: true }),
                ...objects.map((plan) =>
                  h(SelectItem, { key: plan.id, value: plan }, () => plan.name)
                ),
                h("data", { value: "pro" }, "Pro, $10"),
              ]),
            ]
          ),
      })
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })
})
