import "@ui-sdk/web/timeline"

const milestones = [
  { title: "Kickoff", dateTime: "2026-01", time: "January" },
  { title: "Design review", dateTime: "2026-03", time: "March" },
  { title: "Beta", dateTime: "2026-06", time: "June" },
  { title: "Launch", dateTime: "2026-09", time: "September" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-timeline orientation="horizontal" loop="false" aria-label="Roadmap">
      ${milestones
        .map(
          (milestone) => `
            <ui-timeline-item>
              <ui-timeline-marker></ui-timeline-marker>
              <ui-timeline-connector></ui-timeline-connector>
              <ui-timeline-title>${milestone.title}</ui-timeline-title>
              <ui-timeline-time><time datetime="${milestone.dateTime}">${milestone.time}</time></ui-timeline-time>
            </ui-timeline-item>`
        )
        .join("")}
    </ui-timeline>
  `
}

export { mount }
