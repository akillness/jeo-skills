"use client"

import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"

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
            {swatches.map((swatch) => (
              <li key={swatch.name}>
                <div data-slot="swatch" style={{ background: swatch.color }} />
                {swatch.name}
              </li>
            ))}
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
