// Compiled by `pnpm typecheck`, never run. Every controller write takes the
// event behind it, so an app can hand its change callback the one it has.
import { createAccordionController } from "../src/components/accordion/accordion"
import { createAutocompleteController } from "../src/components/autocomplete/autocomplete"
import { createCalendarController } from "../src/components/calendar/calendar"
import { createCarouselController } from "../src/components/carousel/carousel"
import { createCheckboxController } from "../src/components/checkbox/checkbox"
import { createCheckboxGroupController } from "../src/components/checkbox/checkbox-group"
import { createCollapsibleController } from "../src/components/collapsible/collapsible"
import { createComboboxController } from "../src/components/combobox/combobox"
import { createCommandController } from "../src/components/command/command"
import { createDatePickerController } from "../src/components/date-picker/date-picker"
import { createDrawerController } from "../src/components/drawer/drawer"
import { createFileInputController } from "../src/components/file-input/file-input"
import { createInputController } from "../src/components/input/input"
import { createListboxController } from "../src/components/listbox/listbox-root"
import { createMenubarController } from "../src/components/menubar/menubar"
import { createNavigationMenuController } from "../src/components/navigation-menu/navigation-menu"
import { createNumberInputController } from "../src/components/number-input/number-input"
import { createOTPInputController } from "../src/components/otp-input/otp-input"
import { createPaginationController } from "../src/components/pagination/pagination"
import { createPasswordInputController } from "../src/components/password-input/password-input"
import { createPopoverController } from "../src/components/popover/popover"
import { createRadioGroupController } from "../src/components/radio/radio"
import { createResizableController } from "../src/components/resizable/resizable"
import { createSelectController } from "../src/components/select/select"
import { createSliderController } from "../src/components/slider/slider"
import { createSwitchController } from "../src/components/switch/switch"
import { createTabsController } from "../src/components/tabs/tabs"
import { createToggleController } from "../src/components/toggle/toggle"
import { createToggleGroupController } from "../src/components/toggle/toggle-group"
import { createTokenInputController } from "../src/components/token-input/token-input"
import { createTreeController } from "../src/components/tree/tree"
import { createTriggerMenuController } from "../src/components/trigger-menu/trigger-menu"

const event = new Event("click")

createSelectController().setValue("b", { reason: "imperative", event })
createSelectController().setOpen(true, { reason: "imperative", event })
// @ts-expect-error `setValue` reports only a select's value reasons.
createSelectController().setValue("b", { reason: "escape-key", event })

createAccordionController().setValue(["a"], { reason: "imperative", event })
createAutocompleteController().setValue("a", { reason: "imperative", event })
createCalendarController().setMonth("2026-10", { reason: "imperative", event })
createCarouselController().setPage(1, { reason: "imperative", event })
createCheckboxController().setChecked(true, { reason: "imperative", event })
createCheckboxGroupController().setValue(["a"], { reason: "imperative", event })
createCollapsibleController().setOpen(true, { reason: "imperative", event })
createComboboxController().setQuery("a", { reason: "imperative", event })
createCommandController().push("a", { reason: "imperative", event })
createDatePickerController().setValue("2026-10-16", {
  reason: "imperative",
  event,
})
createDrawerController().setSnapPoint(1, { reason: "imperative", event })
createFileInputController().clear({ reason: "imperative", event })
createInputController().setValue("a", { reason: "imperative", event })
createListboxController().setValue("a", { reason: "imperative", event })
createMenubarController().close({ reason: "imperative", event })
createNavigationMenuController().setValue("a", { reason: "imperative", event })
createNumberInputController().setValue(1, { reason: "imperative", event })
createOTPInputController().setValue("1", { reason: "imperative", event })
createPaginationController().setPage(1, { reason: "imperative", event })
createPasswordInputController().setVisible(true, {
  reason: "imperative",
  event,
})
createPopoverController().close({ reason: "imperative", event })
createRadioGroupController().setValue("a", { reason: "imperative", event })
createResizableController().setLayout([50, 50], { reason: "imperative", event })
createSliderController().setValue(1, { reason: "imperative", event })
createSwitchController().setChecked(true, { reason: "imperative", event })
createTabsController().setValue("a", { reason: "imperative", event })
createToggleController().setPressed(true, { reason: "imperative", event })
createToggleGroupController().setValue(["a"], { reason: "imperative", event })
createTokenInputController().clear({ reason: "imperative", event })
createTreeController().expand("a", { reason: "imperative", event })
createTriggerMenuController().close({ reason: "imperative", event })
