import { render } from "@solidjs/web"
import { createSignal, flush, type JSX } from "solid-js"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  Combobox,
  ComboboxContent,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSelectAll,
} from "../src/combobox"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../src/command"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSelectAll,
  SelectTrigger,
} from "../src/select"

type GroupProps = { group: { class: string }; children: JSX.Element }

let warn: ReturnType<typeof vi.spyOn>
let root: HTMLElement
let dispose = () => {}

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  root = document.body.appendChild(document.createElement("div"))
})

afterEach(() => {
  dispose()
  root.remove()
  warn.mockRestore()
})

function mount(view: () => JSX.Element) {
  dispose = render(view, root)
  flush()
}

test("a command in a group given spread props reads its group where Solid tracks it", () => {
  const Group = (props: GroupProps) => (
    <CommandGroup {...props.group}>{props.children}</CommandGroup>
  )
  mount(() => (
    <Command>
      <CommandInput aria-label="Search" />
      <CommandList>
        <Group group={{ class: "group" }}>
          <CommandItem value="a" label="Alpha" />
        </Group>
      </CommandList>
    </Command>
  ))
  expect(document.querySelectorAll(".group [role=option]").length).toBe(1)
  expect(warn).not.toHaveBeenCalled()
})

test("a select's select-all in a group given spread props reads its group where Solid tracks it", () => {
  const Group = (props: GroupProps) => (
    <SelectGroup {...props.group}>{props.children}</SelectGroup>
  )
  mount(() => (
    <Select multiple defaultOpen>
      <SelectTrigger aria-label="Fruit" />
      <SelectContent>
        <Group group={{ class: "group" }}>
          <SelectSelectAll>All</SelectSelectAll>
          <SelectItem value="a">Apple</SelectItem>
        </Group>
      </SelectContent>
    </Select>
  ))
  expect(document.querySelectorAll(".group [role=option]").length).toBe(2)
  expect(warn).not.toHaveBeenCalled()
})

test("a combobox's select-all in a group given spread props reads its group where Solid tracks it", () => {
  const Group = (props: GroupProps) => (
    <ComboboxGroup {...props.group}>{props.children}</ComboboxGroup>
  )
  mount(() => (
    <Combobox multiple defaultOpen>
      <ComboboxInput aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxList>
          <Group group={{ class: "group" }}>
            <ComboboxSelectAll>All</ComboboxSelectAll>
            <ComboboxItem value="a">Apple</ComboboxItem>
          </Group>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ))
  expect(document.querySelectorAll(".group [role=option]").length).toBe(2)
  expect(warn).not.toHaveBeenCalled()
})

test("a command keeps up with a group whose id changes", () => {
  const [id, setId] = createSignal("first")
  mount(() => (
    <Command>
      <CommandInput aria-label="Search" />
      <CommandList>
        <CommandGroup id={id()}>
          <CommandItem value="apple" label="Apple" />
        </CommandGroup>
      </CommandList>
    </Command>
  ))
  setId("second")
  flush()
  const input = root.querySelector("input")!
  input.value = "ap"
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
  flush()
  expect(root.querySelector<HTMLElement>("[role=group]")!.hidden).toBe(false)
})
