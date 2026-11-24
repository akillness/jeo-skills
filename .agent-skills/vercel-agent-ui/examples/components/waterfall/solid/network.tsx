import {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallMark,
  WaterfallRow,
  WaterfallRowHeader,
  type WaterfallData,
} from "@ui-sdk/solid/waterfall"
import { For } from "solid-js"

const requests: WaterfallData = [
  { value: "document", label: "/", start: 0, duration: 182 },
  { value: "styles", label: "app.css", start: 190, duration: 96 },
  { value: "script", label: "app.js", start: 192, duration: 410 },
  { value: "font", label: "inter.woff2", start: 300, duration: 220 },
  { value: "user", label: "api/user", start: 610, duration: 240 },
  { value: "avatar", label: "avatar.png", start: 860, duration: 150 },
]

const sizes: Record<string, string> = {
  document: "14 kB",
  styles: "8 kB",
  script: "212 kB",
  font: "48 kB",
  user: "1 kB",
  avatar: "36 kB",
}

function Example() {
  return (
    <Waterfall
      aria-label="Network requests"
      items={requests}
      getBarLabel={(request, { start, duration }) =>
        `${sizes[request.value]}, starts at ${start}, takes ${duration}`
      }
    >
      <WaterfallHeaderRow>
        <WaterfallColumnHeader>Name</WaterfallColumnHeader>
        <WaterfallColumnHeader>Size</WaterfallColumnHeader>
        <WaterfallColumnHeader aria-label="Timeline">
          <WaterfallAxis maxTicks={5} />
          <WaterfallMark time={620}>DOMContentLoaded</WaterfallMark>
        </WaterfallColumnHeader>
      </WaterfallHeaderRow>
      <For each={requests}>
        {(request) => (
          <WaterfallRow value={request.value}>
            <WaterfallRowHeader>{request.label}</WaterfallRowHeader>
            <WaterfallCell>{sizes[request.value]}</WaterfallCell>
            <WaterfallBar />
          </WaterfallRow>
        )}
      </For>
    </Waterfall>
  )
}

export { Example }
