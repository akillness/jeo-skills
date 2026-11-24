import { renderToString } from "@solidjs/web"
import { For } from "solid-js"
import { describe, expect, test } from "vitest"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "../src/combobox"

// Runs with no DOM: any access to window or document during render throws.
// Solid writes attributes in the order the core lists them, so a match
// finds the input first and checks its attributes one by one.

const plans = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
]

const inputs = (html: string) => html.match(/<input[^>]*>/g) ?? []
const field = (html: string) =>
  inputs(html).find((input) => input.includes('role="combobox"'))!

describe("server rendering a combobox", () => {
  test("the input holds the value's label", () => {
    const html = renderToString(() => (
      <Combobox items={plans} name="plan" defaultValue="pro">
        <ComboboxLabel>Plan</ComboboxLabel>
        <ComboboxInput />
        <ComboboxContent />
      </Combobox>
    ))
    expect(typeof window).toBe("undefined")
    expect(field(html)).toContain('value="Pro"')
    expect(field(html)).toContain('aria-autocomplete="list"')
    expect(html).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
    // The list isn't in the page while closed.
    expect(html).not.toContain('role="listbox"')
  })

  test("composed items give the input its label through itemToLabel, since Solid can't read items before they render", () => {
    const labels = new Map(plans.map((plan) => [plan.value, plan.label]))
    const html = renderToString(() => (
      <Combobox
        name="plan"
        defaultValue="pro"
        itemToLabel={(value) => labels.get(value) ?? value}
      >
        <ComboboxInput />
        <ComboboxContent>
          <ComboboxList>
            <For each={plans}>
              {(plan) => (
                <ComboboxItem value={plan.value}>
                  {plan.label}
                  <ComboboxItemIndicator>✓</ComboboxItemIndicator>
                </ComboboxItem>
              )}
            </For>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ))
    expect(field(html)).toContain('value="Pro"')
  })

  test("composed items without itemToLabel show the value until the items mount", () => {
    const html = renderToString(() => (
      <Combobox name="plan" defaultValue="pro">
        <ComboboxInput />
        <ComboboxContent>
          <ComboboxList>
            <For each={plans}>
              {(plan) => (
                <ComboboxItem value={plan.value}>{plan.label}</ComboboxItem>
              )}
            </For>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ))
    expect(field(html)).toContain('value="pro"')
  })

  test("chips render from the value", () => {
    const html = renderToString(() => (
      <Combobox items={plans} multiple defaultValue={["basic", "pro"]}>
        <ComboboxChips>
          <ComboboxValue>
            {(state) => (
              <For each={state.value as string[]}>
                {(item) => <ComboboxChip value={item} />}
              </For>
            )}
          </ComboboxValue>
          <ComboboxInput />
        </ComboboxChips>
      </Combobox>
    ))
    expect(html.match(/data-slot="combobox-chip"/g)).toHaveLength(2)
    expect(html).toContain(">Basic<")
  })
})
