import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"

const profiles = [
  { value: "hollis", label: "Hollis" },
  { value: "ines", label: "Inès" },
  { value: "kofi", label: "Kofi" },
]

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-menubar>
        <ui-menu>
          <ui-menu-trigger>
            <button>Profiles</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-radio-group default-value="ines">
              ${profiles
                .map(
                  (profile) => `
                    <ui-menu-radio-item value="${profile.value}">
                      <ui-menu-item-indicator>
                      </ui-menu-item-indicator>
                      ${profile.label}
                    </ui-menu-radio-item>
                  `
                )
                .join("")}
            </ui-menu-radio-group>
          </ui-menu-content>
        </ui-menu>
        <ui-menu>
          <ui-menu-trigger>
            <button>Theme</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-radio-group name="theme" value="system">
              ${themes
                .map(
                  (option) => `
                    <ui-menu-radio-item value="${option.value}">
                      <ui-menu-item-indicator>
                      </ui-menu-item-indicator>
                      ${option.label}
                    </ui-menu-radio-item>
                  `
                )
                .join("")}
            </ui-menu-radio-group>
          </ui-menu-content>
        </ui-menu>
      </ui-menubar>
      <output data-slot="output">Theme: system</output>
    </div>
  `
  const theme = root.querySelector("ui-menu-radio-group[name=theme]")!
  theme.addEventListener("valuechange", (event) => {
    const { value } = (event as CustomEvent<{ value: string }>).detail
    theme.setAttribute("value", value)
    root.querySelector("output")!.textContent = `Theme: ${value}`
  })
}
