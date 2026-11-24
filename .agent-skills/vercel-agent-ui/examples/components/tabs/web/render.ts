import "@ui-sdk/web/tabs"

const folders = [
  {
    value: "inbox",
    label: "Inbox",
    count: 12,
    content: "12 conversations, 3 of them unread.",
  },
  {
    value: "unread",
    label: "Unread",
    count: 3,
    content: "Hollis Grant, Inès Moreau and Kofi Mensah wrote to you.",
  },
  {
    value: "archived",
    label: "Archived",
    count: 0,
    content: "Nothing archived yet. Archived mail stays searchable.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="inbox">
      <ui-tabs-list aria-label="Mail">
        ${folders
          .map(
            (folder) => `
              <ui-tabs-tab value="${folder.value}">
                <button type="button">
                  ${folder.label}
                  ${folder.count > 0 ? `<span data-slot="badge">${folder.count}</span>` : ""}
                </button>
              </ui-tabs-tab>`
          )
          .join("")}
      </ui-tabs-list>
      ${folders.map((folder) => `<ui-tabs-panel value="${folder.value}">${folder.content}</ui-tabs-panel>`).join("")}
    </ui-tabs>
  `
}

export { mount }
