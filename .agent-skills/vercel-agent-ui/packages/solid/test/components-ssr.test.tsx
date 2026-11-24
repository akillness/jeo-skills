import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { Checkbox, CheckboxGroup, CheckboxIndicator } from "../src/checkbox"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../src/field"
import { Input } from "../src/input"
import {
  createPopoverController,
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
} from "../src/popover"
import { Radio, RadioGroup } from "../src/radio"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "../src/select"
import { Switch } from "../src/switch"

// Runs with no DOM: any access to window or document during render throws.
// Solid renders boolean attributes bare, like `checked`, and marks elements
// with hydration keys, so matches allow attributes between.

describe("server rendering a collapsible", () => {
  test("renders an open panel with its content", () => {
    const html = renderToString(() => (
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/aria-expanded="true"[^>]*data-open[^>]*>Details/)
    expect(html).toContain("Panel")
    expect(html).not.toMatch(/<div[^>]*hidden[^>]*>Panel/)
  })

  test("leaves a closed panel out, or renders it hidden when kept", () => {
    const closed = renderToString(() => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    expect(closed).not.toContain("Panel")
    const kept = renderToString(() => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel keepMounted>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    expect(kept).toMatch(/<div[^>]*\shidden[\s>][^>]*>Panel/)
  })

  test("renders a findable panel as hidden until found, which Solid can write on the server", () => {
    const html = renderToString(() => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel hiddenUntilFound>Panel</CollapsiblePanel>
      </Collapsible>
    ))
    expect(html).toMatch(/<div[^>]*hidden="until-found"[^>]*>Panel/)
  })
})

describe("server rendering form controls", () => {
  const inputs = (html: string) => html.match(/<input[^>]*>/g) ?? []

  test("a checkbox renders a hidden native input that submits before hydration", () => {
    const html = renderToString(() => (
      <Checkbox name="terms" value="yes" defaultChecked required>
        <CheckboxIndicator />
      </Checkbox>
    ))
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('aria-checked="true"')
    const [input] = inputs(html)
    for (const attribute of [
      'type="checkbox"',
      'name="terms"',
      'value="yes"',
      " checked",
      " required",
    ]) {
      expect(input).toContain(attribute)
    }
    expect(html).toContain('data-slot="checkbox-indicator"')
  })

  test("a switch renders its role and hidden input", () => {
    const html = renderToString(() => <Switch name="wifi" defaultChecked />)
    expect(html).toContain('role="switch"')
    expect(html).toMatch(/<input[^>]*name="wifi"[^>]*checked/)
  })

  test("a radio group renders one tab stop and a named radio per item", () => {
    const html = renderToString(() => (
      <RadioGroup name="plan" required>
        <Radio value="free" disabled />
        <Radio value="pro" />
        <Radio value="team" />
      </RadioGroup>
    ))
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/type="radio"[^>]*name="plan"/g)).toHaveLength(3)
  })

  test("a checkbox group names its checkboxes and checks its default values", () => {
    const html = renderToString(() => (
      <CheckboxGroup
        name="toppings"
        defaultValue={["cheese"]}
        allValues={["cheese", "olives"]}
      >
        <Checkbox parent />
        <Checkbox value="cheese" />
        <Checkbox value="olives" />
      </CheckboxGroup>
    ))
    expect(html).toContain('aria-checked="mixed"')
    const cheese = inputs(html).find((input) =>
      input.includes('value="cheese"')
    )!
    expect(cheese).toContain('name="toppings"')
    expect(cheese).toMatch(/\schecked[\s>]/)
    expect(html.match(/name="toppings"/g)).toHaveLength(2)
  })

  test("a field ties its label to the control", () => {
    const html = renderToString(() => (
      <Field>
        <FieldLabel>Email</FieldLabel>
        <FieldControl type="email" required />
        <FieldDescription>We never share it.</FieldDescription>
        <FieldError />
      </Field>
    ))
    const [, id] = html.match(/<input[^>]*id="([^"]+)"/)!
    expect(html).toContain(`for="${id}"`)
    expect(html).not.toContain('data-slot="field-error"')
  })

  test.each([
    [[true]],
    [["valueMissing", true]],
    [[true, true]],
    [[undefined, true]],
  ] as const)(
    "errors shown on a server keep their own ids, and the first is described (%j)",
    (matches) => {
      const html = renderToString(() => (
        <Field invalid>
          <FieldLabel>Handle</FieldLabel>
          <FieldControl />
          {matches.map((match, index) => (
            <FieldError match={match}>Error {index}</FieldError>
          ))}
        </Field>
      ))
      const { errors: ids, described } = errorIds(html)
      expect(new Set(ids).size).toBe(ids.length)
      expect(described).toContain(ids[0])
    }
  )
})

// Opening tags, and an attribute of one.
const tags = (html: string) => html.match(/<[a-z][^>]*>/g) ?? []
const attribute = (tag: string | undefined, name: string) =>
  tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

// Before hydration, the parts register nothing, so the server's HTML has to
// carry the relationships the hydrated page has, wherever the parts render.
describe.each(["before", "after"])(
  "server rendering a field with its description %s the control",
  (order) => {
    test.each(["input", "select"])(
      "its label names the %s and its description describes it",
      (kind) => {
        const html = renderToString(() => (
          <Field>
            <FieldLabel>Fruit</FieldLabel>
            {order === "before" && (
              <FieldDescription>Pick one.</FieldDescription>
            )}
            {kind === "input" ? (
              <Input />
            ) : (
              <Select>
                <SelectTrigger />
              </Select>
            )}
            {order === "after" && (
              <FieldDescription>Pick one.</FieldDescription>
            )}
          </Field>
        ))
        const label = tags(html).find((tag) => tag.startsWith("<label"))
        const element = tags(html).find(
          (tag) => attribute(tag, "id") === attribute(label, "for")
        )
        expect(element).toMatch(
          kind === "input" ? /^<input/ : /^<button[^>]*role="combobox"/
        )
        expect(attribute(element, "aria-labelledby")).toBe(
          attribute(label, "id")
        )
        const text = tags(html).find((tag) =>
          tag.includes('data-slot="field-description"')
        )
        expect(attribute(element, "aria-describedby")).toBe(
          attribute(text, "id")
        )
      }
    )
  }
)

describe("server rendering a popover", () => {
  const popover = (open: boolean) => (
    <Popover defaultOpen={open}>
      <PopoverTrigger shortcut="mod+i">
        Profile <PopoverShortcut />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverTitle>Edit profile</PopoverTitle>
        <PopoverDescription>
          Your name appears on your posts.
        </PopoverDescription>
        <PopoverClose>Close</PopoverClose>
      </PopoverContent>
    </Popover>
  )

  test("a closed popover renders its trigger only", () => {
    const html = renderToString(() => popover(false))
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="dialog"')
  })

  test("an open popover renders its content in place", () => {
    const html = renderToString(() => popover(true))
    expect(html).toContain('role="dialog"')
    // Added on the client, so the browser doesn't hide the content until then.
    expect(html).not.toContain("popover=")
    expect(html).toContain("<h2")
  })

  test("the shortcut renders the same on the server and the first client render", () => {
    const html = renderToString(() => popover(false))
    // Neutral names until the client knows its platform, so hydration never mismatches.
    expect(html).toContain('aria-keyshortcuts="Control+I"')
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>⁦Ctrl\+I⁩<\/span>/)
  })

  test("a shortcut renders inside a trigger connected through a controller", () => {
    const share = createPopoverController()
    const html = renderToString(() => (
      <>
        <PopoverTrigger controller={share} shortcut="mod+i">
          Share <PopoverShortcut />
        </PopoverTrigger>
        <Popover controller={share}>
          <PopoverContent>
            <PopoverTitle>Share</PopoverTitle>
          </PopoverContent>
        </Popover>
      </>
    ))
    expect(html).toContain("Share")
  })
})

describe("server rendering a select", () => {
  const plans = [
    { value: "basic", label: "Basic" },
    { value: "pro", label: "Pro" },
  ]

  test("a data select renders its label, its value's label and a hidden input that submits it", () => {
    const html = renderToString(() => (
      <Select
        items={plans}
        name="plan"
        defaultValue="pro"
        placeholder="Choose a plan"
      >
        <SelectLabel>Plan</SelectLabel>
        <SelectTrigger />
      </Select>
    ))
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
    expect(html).toMatch(/<textarea[^>]*name="plan"[^>]*>pro<\/textarea>/)
    // The list isn't in the page while closed.
    expect(html).not.toContain('role="listbox"')
  })

  test("a select with nothing chosen shows the placeholder", () => {
    const html = renderToString(() => (
      <Select items={plans} placeholder="Choose a plan" required name="plan">
        <SelectTrigger />
      </Select>
    ))
    expect(html).toContain("data-placeholder")
    expect(html).toContain("Choose a plan")
    expect(html).toMatch(/<textarea[^>]*required/)
  })

  test("several values render one hidden input each", () => {
    const html = renderToString(() => (
      <Select
        items={plans}
        name="plan"
        multiple
        defaultValue={["basic", "pro"]}
      >
        <SelectTrigger />
      </Select>
    ))
    expect(html.match(/type="hidden"[^>]*name="plan"/g)).toHaveLength(2)
    expect(html).toContain("Basic, Pro")
  })

  test("composed items give the value its label through itemToLabel, since Solid can't read items before they render", () => {
    const labels = new Map(plans.map((plan) => [plan.value, plan.label]))
    const html = renderToString(() => (
      <Select
        name="plan"
        defaultValue="pro"
        itemToLabel={(value) => labels.get(value) ?? value}
      >
        <SelectTrigger />
        <SelectContent>
          <SelectItem value="basic" label="Basic" />
          <SelectItem value="pro" label="Pro" />
        </SelectContent>
      </Select>
    ))
    expect(html).toMatch(/data-slot="select-value"[^>]*>Pro</)
  })

  test("composed items without itemToLabel show the value until the items mount", () => {
    const html = renderToString(() => (
      <Select name="plan" defaultValue="pro">
        <SelectTrigger />
        <SelectContent>
          <SelectItem value="basic" label="Basic" />
          <SelectItem value="pro" label="Pro" />
        </SelectContent>
      </Select>
    ))
    expect(html).toMatch(/data-slot="select-value"[^>]*>pro</)
  })
})

// The ids of the field's errors and of what its control's description names.
const errorIds = (html: string) => ({
  errors: [...html.matchAll(/<[^>]*data-slot="field-error"[^>]*>/g)].map(
    ([tag]) => tag.match(/\sid="([^"]+)"/)![1]
  ),
  described: html.match(/<input[^>]*aria-describedby="([^"]+)"/)![1].split(" "),
})
