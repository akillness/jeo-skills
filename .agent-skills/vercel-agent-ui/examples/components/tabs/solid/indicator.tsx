import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/solid/tabs"
import { createSignal, For } from "solid-js"

const orientations = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
] as const

function Example() {
  const [orientation, setOrientation] = createSignal<"horizontal" | "vertical">(
    "horizontal"
  )

  return (
    <div>
      <div data-slot="controls" role="group" aria-label="Orientation">
        <For each={orientations}>
          {(option) => (
            <button
              type="button"
              data-size="sm"
              aria-pressed={orientation() === option.value ? "true" : "false"}
              onClick={() => setOrientation(option.value)}
            >
              {option.label}
            </button>
          )}
        </For>
      </div>
      <Tabs defaultValue="music" orientation={orientation()}>
        <TabsList aria-label="Library">
          <TabsTab value="music">Music</TabsTab>
          <TabsTab value="podcasts">Podcasts</TabsTab>
          <TabsTab value="audiobooks">Audiobooks</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="music">
          312 songs in 24 albums, synced to this device.
        </TabsPanel>
        <TabsPanel value="podcasts">
          8 shows you follow, with 3 new episodes.
        </TabsPanel>
        <TabsPanel value="audiobooks">
          2 books in progress, 6 hours left in total.
        </TabsPanel>
      </Tabs>
    </div>
  )
}

export { Example }
