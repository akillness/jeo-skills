import "@ui-sdk/web/listbox"

const sizes = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL", disabled: true },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox orientation="horizontal" loop="false" default-value="m" aria-label="Size">
      ${sizes
        .map(
          (size) => `
            <ui-listbox-item value="${size.value}"${size.disabled ? " disabled" : ""}>${size.label}</ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
}

export { mount }
