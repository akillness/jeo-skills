import "@ui-sdk/web/field"
import type { UiPopoverElement } from "@ui-sdk/web/popover"
import "@ui-sdk/web/popover"
import { log } from "../../../shared/web/log"

type Member = { name: string; role: string }

const roles = ["Admin", "Editor", "Viewer"]

let count = 0

function mount(root: HTMLElement) {
  const id = `member-editor-${++count}`
  const members: Member[] = [
    { name: "Hollis Grant", role: "Owner" },
    { name: "Inès Moreau", role: "Editor" },
    { name: "Kofi Mensah", role: "Viewer" },
    { name: "Wren Takahashi", role: "Viewer" },
  ]
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Edit Newest Member</button>
      </div>
      <ul data-slot="list"></ul>
      <ui-popover id="${id}">
        <ui-popover-content align="end" side-offset="8">
          <ui-popover-title></ui-popover-title>
          <ui-popover-description>Roles decide what they can change.</ui-popover-description>
          <form data-slot="stack" method="dialog">
            <ui-field>
              <ui-field-label>Role</ui-field-label>
              <select name="role">
                ${roles.map((role) => `<option>${role}</option>`).join("")}
              </select>
            </ui-field>
            <div data-slot="row">
              <button type="submit" value="cancel" formnovalidate>Cancel</button>
              <button type="submit" value="save" data-variant="solid">Save</button>
            </div>
          </form>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
  const popover = root.querySelector<UiPopoverElement<Member>>("ui-popover")!
  const form = root.querySelector("form")!
  const list = root.querySelector("ul")!

  const rows = new Map<Member, HTMLElement>()
  for (const member of members) {
    const item = document.createElement("li")
    item.dataset.slot = "row"
    item.innerHTML = `${member.name}<span data-slot="hint">${member.role}</span>`
    const trigger = Object.assign(
      document.createElement("ui-popover-trigger"),
      { payload: member }
    )
    trigger.setAttribute("for", id)
    trigger.toggleAttribute("disabled", member.role === "Owner")
    trigger.innerHTML = `<button aria-label="Edit ${member.name}" data-size="sm" data-variant="ghost">Edit</button>`
    item.append(trigger)
    rows.set(member, item)
    list.append(item)
  }

  const show = (member?: Member) => {
    root.querySelector("ui-popover-title")!.textContent = member?.name ?? ""
    form.querySelector("select")!.value = member?.role ?? ""
  }
  popover.addEventListener("payloadchange", (event) => {
    const member = event.detail.value
    show(member)
    if (member) {
      log(root, `Editing ${member.name}`)
    }
  })
  popover.addEventListener("openchange", (event) => {
    if (event.detail.value) {
      show(popover.api.getPayload())
    }
  })
  form.addEventListener("submit", (event) => {
    const member = popover.api.getPayload()
    if ((event.submitter as HTMLButtonElement).value !== "save" || !member) {
      return
    }
    member.role = String(new FormData(form).get("role"))
    rows.get(member)!.querySelector("span")!.textContent = member.role
  })

  const opener = root.querySelector<HTMLButtonElement>(
    "[data-slot=controls] button"
  )!
  opener.addEventListener("click", async () => {
    const result = await popover.api.open({
      payload: members[members.length - 1],
      anchor: opener,
    })
    log(
      root,
      `Closed (${result.reason}), returned ${result.returnValue ?? "nothing"}`
    )
  })
}

export { mount }
