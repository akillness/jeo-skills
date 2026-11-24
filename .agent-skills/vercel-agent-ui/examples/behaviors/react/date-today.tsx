import * as React from "react"
import { formatDate, todayDate } from "@ui-sdk/core/date"

const zones = [
  ["Pacific/Auckland", "Auckland"],
  ["Asia/Tokyo", "Tokyo"],
  ["Europe/London", "London"],
  ["America/Los_Angeles", "Los Angeles"],
]

function Example() {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return (
    <ul aria-label="Today" data-slot="list">
      {zones.map(([zone, city]) => (
        <li key={zone} data-slot="row">
          {city}
          <span data-slot="hint" data-zone={zone}>
            {mounted
              ? formatDate(todayDate(zone), "en-US", { dateStyle: "medium" })
              : ""}
          </span>
        </li>
      ))}
      <li data-slot="row">
        Here
        <span data-slot="hint" data-zone="here">
          {mounted
            ? formatDate(todayDate(), "en-US", { dateStyle: "medium" })
            : ""}
        </span>
      </li>
    </ul>
  )
}

export { Example }
