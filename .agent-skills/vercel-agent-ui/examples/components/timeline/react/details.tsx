"use client"

import {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@ui-sdk/react/timeline"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"

const releases = [
  {
    title: "Version 2.4",
    dateTime: "2026-10-28",
    time: "October 28",
    description: "Faster search and resumable uploads.",
    changes: [
      "Search now matches file contents, not only names.",
      "Uploads resume after the connection drops.",
    ],
  },
  {
    title: "Version 2.3",
    dateTime: "2026-09-30",
    time: "September 30",
    description: "Shared links and a new sidebar.",
    changes: [
      "Shared links remember the folder they were opened from.",
      "The sidebar collapses to icons on narrow screens.",
    ],
  },
  {
    title: "Version 2.2",
    dateTime: "2026-08-26",
    time: "August 26",
    description: "Dark mode follows your system.",
    changes: ["Dark mode follows the system setting.", "Avatars are sharper."],
  },
]

function Example() {
  return (
    <Timeline aria-label="Changelog">
      {releases.map((release) => (
        <TimelineItem key={release.title}>
          <TimelineMarker />
          <TimelineConnector />
          <TimelineTitle>{release.title}</TimelineTitle>
          <TimelineTime dateTime={release.dateTime}>
            {release.time}
          </TimelineTime>
          <TimelineDescription>{release.description}</TimelineDescription>
          <Collapsible>
            <CollapsibleTrigger>
              What Changed
              <ChevronDownIcon aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <ul>
                {release.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </CollapsiblePanel>
          </Collapsible>
        </TimelineItem>
      ))}
    </Timeline>
  )
}

export { Example }
