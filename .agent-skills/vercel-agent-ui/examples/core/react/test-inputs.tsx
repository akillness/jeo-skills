import * as React from "react"
import { mount } from "@ui-sdk/core/testing"
import { searchField } from "./search-field"
import { seats } from "./seats"
import { subscribe } from "./subscribe-form"

type Check = { label: string; ok: boolean }

async function test() {
  const checks: Check[] = []
  const expect = (label: string, ok: boolean) => checks.push({ label, ok })

  const search = mount(
    searchField,
    {},
    `<root><input aria-label="Search"></input><clear>Clear</clear></root>`
  )
  try {
    search.part("input")!.focus()
    await search.type("pear")
    expect("Typing sets the query", search.state.query === "pear")
    await search.keys("Escape")
    expect("Escape clears it", search.state.query === "")
  } finally {
    search.unmount()
  }

  const map = mount(
    seats,
    {},
    `<root><seat value="A1"></seat><seat value="A2"></seat></root>`
  )
  try {
    await map.hover(map.part("seat", "A2")!)
    expect(
      "Hovering a seat marks it",
      map.part("seat", "A2")!.hasAttribute("data-hovered")
    )
  } finally {
    map.unmount()
  }

  const form = mount(
    subscribe,
    {},
    `<root as="form"><input as="input"></input><button type="submit">Subscribe</button><error></error></root>`
  )
  try {
    await form.click(form.root.querySelector("button")!)
    await form.settle()
    expect(
      "An empty email is announced",
      form.announced.includes("Enter an email address")
    )
  } finally {
    form.unmount()
  }
  return checks
}

function Example() {
  const [checks, setChecks] = React.useState<Check[] | null>(null)
  return (
    <div data-slot="stack">
      <button
        type="button"
        data-variant="solid"
        onClick={async () => setChecks(await test())}
      >
        Run the Tests
      </button>
      {checks && (
        <ul aria-label="Results" data-slot="list">
          {checks.map((check) => (
            <li key={check.label} data-slot="test-result" data-ok={check.ok}>
              {check.ok ? "✓" : "✗"} {check.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { Example }
