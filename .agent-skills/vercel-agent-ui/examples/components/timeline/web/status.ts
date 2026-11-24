import "@ui-sdk/web/timeline"
import { Check, createElement } from "lucide"

const steps = [
  {
    value: "placed",
    title: "Order placed",
    dateTime: "2026-11-01",
    time: "Nov 1",
    description: "We received your order.",
    status: "complete",
  },
  {
    value: "packed",
    title: "Packed",
    dateTime: "2026-11-02",
    time: "Nov 2",
    description: "Your items left the shelf.",
    status: "complete",
  },
  {
    value: "shipped",
    title: "Shipped",
    dateTime: "2026-11-03",
    time: "Nov 3",
    description: "On its way with the carrier.",
    status: "current",
  },
  {
    value: "delivered",
    title: "Delivered",
    dateTime: "2026-11-05",
    time: "Nov 5",
    description: "Expected by Thursday.",
    status: "upcoming",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Go to Current Step</button>
      </div>
      <ui-timeline aria-label="Order status">
        ${steps
          .map(
            (step) => `
              <ui-timeline-item value="${step.value}" status="${step.status}">
                <ui-timeline-marker>${step.status === "complete" ? createElement(Check, { "aria-hidden": "true" }).outerHTML : ""}</ui-timeline-marker>
                <ui-timeline-connector></ui-timeline-connector>
                <ui-timeline-title>${step.title}</ui-timeline-title>
                <ui-timeline-time><time datetime="${step.dateTime}">${step.time}</time></ui-timeline-time>
                <ui-timeline-description>${step.description}</ui-timeline-description>
              </ui-timeline-item>`
          )
          .join("")}
      </ui-timeline>
    </div>
  `
  const timeline = root.querySelector("ui-timeline")!
  root
    .querySelector('[data-slot="controls"] button')!
    .addEventListener("click", () => timeline.api.focus("shipped"))
}

export { mount }
