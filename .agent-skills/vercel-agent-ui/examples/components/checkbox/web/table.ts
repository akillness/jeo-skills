import "@ui-sdk/web/checkbox"
import { Check, createElement, Minus } from "lucide"
import { log } from "../../../shared/web/log"

const people = [
  {
    id: "hollis",
    name: "Hollis Grant",
    email: "hollis@example.com",
    role: "Owner",
  },
  {
    id: "ines",
    name: "Inès Moreau",
    email: "ines@example.com",
    role: "Editor",
  },
  {
    id: "kofi",
    name: "Kofi Mensah",
    email: "kofi@example.com",
    role: "Viewer",
  },
  {
    id: "wren",
    name: "Wren Takahashi",
    email: "wren@example.com",
    role: "Editor",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-checkbox-group aria-label="Team members" default-value="hollis" all-values="${people.map((person) => person.id).join(",")}">
      <table>
        <caption data-slot="visually-hidden">Team members</caption>
        <thead>
          <tr>
            <th>
              <ui-checkbox aria-label="Select all" parent>
                <ui-checkbox-indicator>
                  ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                  ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
                </ui-checkbox-indicator>
              </ui-checkbox>
            </th>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          ${people
            .map(
              (person) => `
                <tr>
                  <td>
                    <ui-checkbox value="${person.id}" aria-label="Select ${person.name}">
                      <ui-checkbox-indicator>
                        ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                      </ui-checkbox-indicator>
                    </ui-checkbox>
                  </td>
                  <td>${person.name}</td>
                  <td>${person.email}</td>
                  <td>${person.role}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </ui-checkbox-group>
  `
  root
    .querySelector("ui-checkbox-group")!
    .addEventListener("valuechange", (event) => {
      log(root, `${event.detail.value.length} of ${people.length} selected`)
    })
}

export { mount }
