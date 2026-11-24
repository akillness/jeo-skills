import {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@ui-sdk/solid/timeline"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { For } from "solid-js"

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
      <For each={releases}>
        {(release) => (
          <TimelineItem>
            <TimelineMarker />
            <TimelineConnector />
            <TimelineTitle>{release.title}</TimelineTitle>
            <TimelineTime datetime={release.dateTime}>
              {release.time}
            </TimelineTime>
            <TimelineDescription>{release.description}</TimelineDescription>
            <Collapsible>
              <CollapsibleTrigger>
                What Changed
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <ul>
                  <For each={release.changes}>
                    {(change) => <li>{change}</li>}
                  </For>
                </ul>
              </CollapsiblePanel>
            </Collapsible>
          </TimelineItem>
        )}
      </For>
    </Timeline>
  )
}

export { Example }
