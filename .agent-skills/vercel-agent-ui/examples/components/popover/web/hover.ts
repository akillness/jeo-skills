import "@ui-sdk/web/popover"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-popover open-on-hover delay="200" close-delay="150">
      <ui-popover-trigger>
        <button>@kofi</button>
      </ui-popover-trigger>
      <ui-popover-content side-offset="8">
        <ui-popover-arrow></ui-popover-arrow>
        <ui-popover-title>Kofi Mensah</ui-popover-title>
        <ui-popover-description>Engineering manager, platform team.</ui-popover-description>
        <div data-slot="row">
          <button type="button" data-size="sm" data-variant="solid">Follow</button>
        </div>
      </ui-popover-content>
    </ui-popover>
  `
  root
    .querySelector("ui-popover-content button")!
    .addEventListener("click", () => log(root, "Followed @kofi"))
}

export { mount }
