// @vitest-environment jsdom
// A kept, closed panel follows `hiddenUntilFound` after mount both ways:
// findable once it's turned on, plainly hidden once it's off again.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test } from "vitest"
import { idle } from "../../core/test/after-mount"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "../src/accordion"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "../src/navigation-menu"
import { Tabs, TabsList, TabsPanel, TabsTab } from "../src/tabs"
import { Tree, TreeGroup, TreeItem, TreeItemLabel } from "../src/tree"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

type Case = {
  name: string
  slot: string
  ui: (findable: boolean) => React.ReactNode
}

const cases: Case[] = [
  {
    name: "collapsible panel",
    slot: "collapsible-panel",
    ui: (findable) => (
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel keepMounted hiddenUntilFound={findable}>
          More
        </CollapsiblePanel>
      </Collapsible>
    ),
  },
  {
    name: "accordion panel",
    slot: "accordion-panel",
    ui: (findable) => (
      <Accordion>
        <AccordionItem value="a">
          <AccordionHeader>
            <AccordionTrigger>A</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel keepMounted hiddenUntilFound={findable}>
            Body
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    ),
  },
  {
    name: "tree group",
    slot: "tree-group",
    ui: (findable) => (
      <Tree aria-label="Files">
        <TreeItem value="src" branch>
          <TreeItemLabel>src</TreeItemLabel>
          <TreeGroup keepMounted hiddenUntilFound={findable}>
            <TreeItem value="index">
              <TreeItemLabel>index.ts</TreeItemLabel>
            </TreeItem>
          </TreeGroup>
        </TreeItem>
      </Tree>
    ),
  },
  {
    name: "tabs panel",
    slot: "tabs-panel",
    ui: (findable) => (
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">First</TabsPanel>
        <TabsPanel value="b" keepMounted hiddenUntilFound={findable}>
          Second
        </TabsPanel>
      </Tabs>
    ),
  },
  {
    name: "tabs, through the root",
    slot: "tabs-panel",
    ui: (findable) => (
      <Tabs defaultValue="a" hiddenUntilFound={findable}>
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">First</TabsPanel>
        <TabsPanel value="b" keepMounted>
          Second
        </TabsPanel>
      </Tabs>
    ),
  },
  {
    name: "navigation menu content",
    slot: "navigation-menu-content",
    ui: (findable) => (
      <NavigationMenu aria-label="Main">
        <NavigationMenuList>
          <NavigationMenuItem value="learn">
            <NavigationMenuTrigger>Learn</NavigationMenuTrigger>
            <NavigationMenuContent keepMounted hiddenUntilFound={findable}>
              <NavigationMenuLink href="/docs">Docs</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
        <NavigationMenuViewport />
      </NavigationMenu>
    ),
  },
]

async function hiddenAcross({ slot, ui }: Case, steps: boolean[]) {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  const seen: (string | null)[] = []
  for (const findable of steps) {
    await React.act(async () => root!.render(ui(findable)))
    await React.act(idle)
    const panels = [...document.querySelectorAll(`[data-slot="${slot}"]`)]
    seen.push(panels.at(-1)?.getAttribute("hidden") ?? "missing")
  }
  return seen
}

describe.each(cases)("$name", (entry) => {
  test("turned on after mount, it becomes findable", async () => {
    expect(await hiddenAcross(entry, [false, true])).toEqual([
      "",
      "until-found",
    ])
  })

  test("turned on and off again, it's plainly hidden", async () => {
    expect(await hiddenAcross(entry, [false, true, false])).toEqual([
      "",
      "until-found",
      "",
    ])
  })

  test("on from the start and turned off, it's plainly hidden", async () => {
    expect(await hiddenAcross(entry, [true, false])).toEqual([
      "until-found",
      "",
    ])
  })
})
