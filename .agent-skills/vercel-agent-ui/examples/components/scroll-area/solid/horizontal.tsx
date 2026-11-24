import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { For } from "solid-js"

const swatches = [
  { name: "Sand", color: "#e6d8bf" },
  { name: "Clay", color: "#c98b6b" },
  { name: "Rust", color: "#a4502f" },
  { name: "Moss", color: "#7d8b5a" },
  { name: "Sage", color: "#b5c2a3" },
  { name: "Fog", color: "#c9d1d6" },
  { name: "Slate", color: "#5b6b78" },
  { name: "Ink", color: "#2b2f36" },
]

function Example() {
  return (
    <ScrollArea type="auto">
      <ScrollAreaViewport role="region" aria-label="Palette">
        <ScrollAreaContent>
          <ul>
            <For each={swatches}>
              {(swatch) => (
                <li>
                  <div
                    data-slot="swatch"
                    style={{ background: swatch.color }}
                  />
                  {swatch.name}
                </li>
              )}
            </For>
          </ul>
        </ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="horizontal">
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
    </ScrollArea>
  )
}

export { Example }
