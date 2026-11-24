import "@ui-sdk/web/tabs"

const policies = [
  {
    value: "shipping",
    label: "Shipping",
    text: "Orders leave our warehouse within two working days. Express delivery arrives the next morning.",
  },
  {
    value: "returns",
    label: "Returns",
    text: "Send anything back within 30 days. Opened electronics carry a restocking fee of 10 percent.",
  },
  {
    value: "warranty",
    label: "Warranty",
    text: "Every product has a two-year warranty. Batteries are covered for one year from delivery.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="shipping" hidden-until-found>
      <ui-tabs-list aria-label="Policies">
        ${policies
          .map(
            (policy) => `
              <ui-tabs-tab value="${policy.value}">
                <button type="button">${policy.label}</button>
              </ui-tabs-tab>`
          )
          .join("")}
      </ui-tabs-list>
      ${policies
        .map(
          (policy, index) =>
            `<ui-tabs-panel value="${policy.value}"${index > 0 ? ' hidden="until-found"' : ""}>${policy.text}</ui-tabs-panel>`
        )
        .join("")}
    </ui-tabs>
  `
}

export { mount }
