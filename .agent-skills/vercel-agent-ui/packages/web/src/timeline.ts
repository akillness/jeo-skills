import { timeline } from "@ui-sdk/core/timeline"
import { createParts } from "./define-element"

// <ui-timeline> and its parts. Every part inside an item is optional, and
// <ui-timeline-time> wraps a <time datetime>. `feed` makes the events a
// feed of articles, and `busy` sets `aria-busy` on it.
function defineTimelineElements() {
  createParts(timeline, {
    root: {
      tag: "ui-timeline",
      display: "block",
      defaults: { loop: true },
      api: ["focus"],
    },
    item: { tag: "ui-timeline-item", display: "block" },
    marker: { tag: "ui-timeline-marker", display: "block" },
    connector: { tag: "ui-timeline-connector", display: "block" },
    // Binds to the `<time>` inside it, so its `datetime` stays machine readable.
    time: {
      tag: "ui-timeline-time",
      display: "block",
      target: (el) => el.querySelector<HTMLElement>(":scope > time") ?? el,
    },
    title: { tag: "ui-timeline-title", display: "block" },
    description: { tag: "ui-timeline-description", display: "block" },
  })
}

export { defineTimelineElements }
