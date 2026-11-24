import "@ui-sdk/web/tabs"

const pages = [
  {
    value: "overview",
    href: "#project-overview",
    label: "Overview",
    content:
      "Hollis Grant started this project in March. It has 14 open issues.",
  },
  {
    value: "activity",
    href: "#project-activity",
    label: "Activity",
    content:
      "Wren Takahashi merged 3 pull requests and closed 5 issues this week.",
  },
  {
    value: "members",
    href: "#project-members",
    label: "Members",
    content:
      "Hollis Grant owns the project. Wren Takahashi and 3 others can edit it.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="overview">
      <ui-tabs-list aria-label="Project">
        ${pages
          .map(
            (page) => `
              <ui-tabs-tab value="${page.value}">
                <a href="${page.href}">${page.label}</a>
              </ui-tabs-tab>`
          )
          .join("")}
        <ui-tabs-indicator></ui-tabs-indicator>
      </ui-tabs-list>
      ${pages.map((page) => `<ui-tabs-panel value="${page.value}">${page.content}</ui-tabs-panel>`).join("")}
    </ui-tabs>
  `
}

export { mount }
