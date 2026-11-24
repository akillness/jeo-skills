// @vitest-environment node
import { renderToString } from "react-dom/server"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectTrigger,
} from "../src/select"

const plans = [
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
]

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a select", () => {
  test("a data select renders its label, its value's label and a hidden input that submits it", () => {
    const html = renderToString(
      <Select
        items={plans}
        name="plan"
        defaultValue="pro"
        placeholder="Choose a plan"
      >
        <SelectLabel>Plan</SelectLabel>
        <SelectTrigger />
      </Select>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
    expect(html).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
    // The list isn't in the page while closed.
    expect(html).not.toContain('role="listbox"')
  })

  test("a select with nothing chosen shows the placeholder", () => {
    const html = renderToString(
      <Select items={plans} placeholder="Choose a plan" required name="plan">
        <SelectTrigger />
      </Select>
    )
    expect(html).toContain("data-placeholder")
    expect(html).toContain("Choose a plan")
    expect(html).toMatch(/<textarea[^>]*required/)
  })

  test("several values render one hidden input each", () => {
    const html = renderToString(
      <Select
        items={plans}
        name="plan"
        multiple
        defaultValue={["basic", "pro"]}
      >
        <SelectTrigger />
      </Select>
    )
    expect(html.match(/type="hidden"[^>]*name="plan"/g)).toHaveLength(2)
    expect(html).toContain("Basic, Pro")
  })
})

describe("server rendering a select with composed items, before they mount", () => {
  test("the value shows its item's label", () => {
    const html = renderToString(
      <Select name="plan" defaultValue="pro">
        <SelectTrigger />
        <SelectContent>
          <SelectItem value="basic" label="Basic" />
          <SelectItem value="pro" label="Pro" />
        </SelectContent>
      </Select>
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })

  test("the value shows its item's text, without the indicator", () => {
    const html = renderToString(
      <Select defaultValue="pro">
        <SelectTrigger />
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem key={plan.value} value={plan.value}>
              <SelectItemText>{plan.label}</SelectItemText>
              <SelectItemIndicator>✓</SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })

  test("items in a component of your own show their label when it takes the value and label", () => {
    const Plan = ({ value, label }: { value: string; label: string }) => (
      <SelectItem value={value}>
        <SelectItemText>{label}</SelectItemText>
      </SelectItem>
    )
    const html = renderToString(
      <Select multiple defaultValue={["basic", "pro"]}>
        <SelectTrigger />
        <SelectContent>
          {plans.map((plan) => (
            <Plan key={plan.value} {...plan} />
          ))}
        </SelectContent>
      </Select>
    )
    expect(html).toContain("Basic, Pro")
  })

  test("an element with its own value, like an input, isn't taken for an item", () => {
    const objects = plans.map((plan) => ({ id: plan.value, name: plan.label }))
    const html = renderToString(
      <Select
        defaultValue={objects[1]}
        itemToValue={(plan) => plan.id.toString()}
      >
        <SelectTrigger />
        <SelectContent>
          <input value="pro" readOnly />
          {objects.map((plan) => (
            <SelectItem key={plan.id} value={plan}>
              {plan.name}
            </SelectItem>
          ))}
          <data value="pro">Pro, $10</data>
        </SelectContent>
      </Select>
    )
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })
})

describe("server rendering a combobox", () => {
  test("the input holds the value's label", () => {
    const html = renderToString(
      <Combobox items={plans} name="plan" defaultValue="pro">
        <ComboboxLabel>Plan</ComboboxLabel>
        <ComboboxInput />
        <ComboboxContent />
      </Combobox>
    )
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="Pro"/)
    expect(html).toContain('aria-autocomplete="list"')
    expect(html).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
  })

  test("the input holds the label of a composed item, before it mounts", () => {
    const html = renderToString(
      <Combobox name="plan" defaultValue="pro">
        <ComboboxInput />
        <ComboboxContent>
          <ComboboxList>
            {plans.map((plan) => (
              <ComboboxItem key={plan.value} value={plan.value}>
                {plan.label}
                <ComboboxItemIndicator>✓</ComboboxItemIndicator>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*value="Pro"/)
  })

  test("chips render from the value", () => {
    const html = renderToString(
      <Combobox items={plans} multiple defaultValue={["basic", "pro"]}>
        <ComboboxChips>
          <ComboboxValue>
            {({ value }) =>
              (value as string[]).map((item) => (
                <ComboboxChip key={item} value={item} />
              ))
            }
          </ComboboxValue>
          <ComboboxInput />
        </ComboboxChips>
      </Combobox>
    )
    expect(html.match(/data-slot="combobox-chip"/g)).toHaveLength(2)
    expect(html).toContain(">Basic<")
  })
})
