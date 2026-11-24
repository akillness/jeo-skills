// What the after-mount test renders for each primitive: its markup, the
// options it starts with, the parts whose props it changes, and values for
// options and props no shared name covers. `skip` says why one isn't tried.
import { accordion } from "../src/components/accordion/accordion"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { avatar } from "../src/components/avatar/avatar"
import { button } from "../src/components/button/button"
import { calendar } from "../src/components/calendar/calendar"
import { carousel } from "../src/components/carousel/carousel"
import { checkbox } from "../src/components/checkbox/checkbox"
import { checkboxGroup } from "../src/components/checkbox/checkbox-group"
import { collapsible } from "../src/components/collapsible/collapsible"
import { combobox } from "../src/components/combobox/combobox"
import { command } from "../src/components/command/command"
import { datePicker } from "../src/components/date-picker/date-picker"
import { alertDialog } from "../src/components/dialog/alert-dialog"
import { dialog } from "../src/components/dialog/dialog"
import { drawer } from "../src/components/drawer/drawer"
import { field } from "../src/components/field/field"
import { fileInput } from "../src/components/file-input/file-input"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { input, textarea } from "../src/components/input/input"
import { listbox } from "../src/components/listbox/listbox-root"
import { menu } from "../src/components/menu/menu"
import { menubar } from "../src/components/menubar/menubar"
import { meter } from "../src/components/meter/meter"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { numberInput } from "../src/components/number-input/number-input"
import { otpInput } from "../src/components/otp-input/otp-input"
import { pagination } from "../src/components/pagination/pagination"
import { passwordInput } from "../src/components/password-input/password-input"
import { popover } from "../src/components/popover/popover"
import { progress } from "../src/components/progress/progress"
import { radioGroup } from "../src/components/radio/radio"
import { resizable } from "../src/components/resizable/resizable"
import { scrollArea } from "../src/components/scroll-area/scroll-area"
import { select } from "../src/components/select/select"
import { separator } from "../src/components/separator/separator"
import { slider } from "../src/components/slider/slider"
import { switchPrimitive } from "../src/components/switch/switch"
import { toastRegion } from "../src/components/toast/toast"
import { tokenInput } from "../src/components/token-input/token-input"
import { tabs } from "../src/components/tabs/tabs"
import { toggle } from "../src/components/toggle/toggle"
import { toggleGroup } from "../src/components/toggle/toggle-group"
import { toolbar } from "../src/components/toolbar/toolbar"
import { tooltip } from "../src/components/tooltip/tooltip"
import { tree } from "../src/components/tree/tree"

type Case = {
  name: string
  primitive: unknown
  markup: string
  options?: Record<string, unknown>
  /** Parts whose props change, by slot, then by the part's value or id, with values to try per prop. */
  parts?: Record<string, Record<string, Record<string, readonly unknown[]>>>
  /** Values to try, by option name or `slot.prop`. */
  values?: Record<string, readonly unknown[]>
  /**
   * State keys, and `[attributes]`, that depend on what happened before, so a change may leave them elsewhere than a first
   * render. `stop` is the tab stop; `initial`, what a form reset goes back to, is the first value.
   */
  history?: readonly string[]
  /** What must hold of the history after a change, as a problem when it doesn't. */
  check?: (state: any) => string | undefined
  /** Options, props and single changes, by their test's title, left out, with why. */
  skip?: Record<string, string>
}

// What every popup takes.
const popups = {
  open: [true, false],
  "trigger.disabled": [false, true],
  "trigger.shortcut": ["mod+k", "mod+j"],
  "close.value": ["save", "cancel"],
}
const dialogs = {
  dismissible: [true, false],
  pendingAnnouncement: ["Saving", "Sending"],
  closeOnOutsidePress: [true, false],
}
// Where a placed popup's content sits.
const placed = {
  "content.side": ["bottom", "top"],
  "content.align": ["center", "start"],
  "content.sideOffset": [0, 8],
  "content.alignOffset": [0, 4],
  "content.collisionPadding": [0, 8],
  "content.arrowPadding": [0, 8],
}
const inlineSkip =
  "Read when the content binds, and adapters render it again when it changes."
const popupSkips = {
  presentation:
    "Decided each time it opens, so an open one keeps how it presents.",
  container: "An element, which markup can't name.",
  "content.container": "An element, which markup can't name.",
  "content.anchor":
    "Names an element to place against, which markup can't follow.",
  "content.initialFocus": "Read when the popup opens and moves focus.",
  "content.finalFocus": "Read when the popup closes and moves focus.",
  "trigger.payload": "Handed to the popup when this trigger opens it.",
  persistentElements: "Read when a press lands outside.",
  "shortcut.shortcut":
    "Shown from its own trigger's shortcut, tried as `trigger.shortcut`.",
}

// What every list of options takes.
const lists = {
  dismissible: [true, false],
  query: ["", "a"],
  status: ["idle", "loading"],
  name: ["fruit", "snack"],
  form: ["one", "two"],
  "item.label": ["Banana", "Plantain"],
  "item.keywords": [[], ["yellow"]],
  "item-text.text": ["Banana", "Plantain"],
  "content.keepMounted": [false, true],
}
const listSkips = {
  emptyItems: "Data shown with no query, which the list tests change.",
  filter: "A function, called when the query changes.",
  itemToValue: "Read with `items`, which the markup stands in for.",
  itemToLabel: "Read with `items`, which the markup stands in for.",
  isItemEqualToValue: "A function, called when a value is compared.",
  announcement: "Read each time it announces, and never shown.",
  "item.index": "The renderer's count of where the item is.",
  "item-text.write": "Set once by the web components adapter.",
  "empty.stash": "Set once by the web components adapter.",
  "value.getMoreLabel": "A function, called for the text it shows.",
  "value-input.value": "Set by the form input, never by people.",
}
// What every calendar takes.
const dates = {
  month: ["2026-10", "2026-11"],
  min: ["2026-01-01", "2026-10-10"],
  max: ["2026-12-31", "2026-10-20"],
  unavailable: [[], ["2026-10-14"]],
  months: [1, 2],
  pageBy: ["month", "page"],
  locale: ["en-US", "de-DE"],
  weekStartsOn: [0, 1],
  weekdayFormat: ["short", "narrow"],
  monthFormat: ["short", "narrow"],
  fixedWeeks: [false, true],
  showOutsideDays: [true, false],
  today: ["2026-10-16", "2026-10-20"],
  timeZone: ["UTC", "America/New_York"],
  minDays: [1, 2],
  maxDays: [7, 3],
  allowUnavailable: [false, true],
  "day.value": ["2026-10-05", "2026-10-06"],
}

const cases: Case[] = [
  {
    name: "tabs",
    primitive: tabs,
    options: { defaultValue: "a" },
    markup: `<root>
      <list aria-label="Settings">
        <tab value="a">Account</tab>
        <tab value="b">Password</tab>
      </list>
      <panel value="a">Account panel</panel>
      <panel value="b">Password panel</panel>
    </root>`,
    parts: { tab: { b: {} } },
    history: ["stop"],
    values: { value: ["a", "b"] },
  },
  {
    name: "toolbar",
    primitive: toolbar,
    markup: `<root aria-label="Format">
      <button id="bold">Bold</button>
      <button id="italic">Italic</button>
    </root>`,
    parts: { button: { bold: {}, italic: {} } },
    history: ["stop"],
    skip: { 'button "bold" disabled: false to true': "Fixed in #140." },
  },
  {
    name: "slider",
    primitive: slider,
    options: { defaultValue: 30 },
    history: ["initial"],
    markup: `<root aria-label="Volume">
      <control><track><indicator></indicator><thumb><thumb-input aria-label="Volume"></thumb-input></thumb></track></control>
    </root>`,
    values: {
      value: [30, 60],
      min: [0, 20],
      max: [100, 50],
      step: [1, 5],
      largeStep: [10, 20],
      minStepsBetweenThumbs: [0, 1],
      name: ["volume", "level"],
      form: ["one", "two"],
      locale: ["en-US", "de-DE"],
      thumbInputId: ["volume", "level"],
    },
    skip: {
      format:
        "A function's change shows in the text it formats, which the format tests cover.",
    },
  },
  {
    name: "resizable",
    primitive: resizable,
    markup: `<root>
      <panel id="left">Left</panel>
      <handle aria-label="Resize"></handle>
      <panel id="right">Right</panel>
    </root>`,
    parts: { panel: { left: {} } },
    // Panels keep their sizes while those fit the new bounds.
    history: ["layout", "sizes", "handleValues", "[aria-valuenow]", "[style]"],
    check: (state: {
      layout: number[]
      constraints: { min: number; max: number }[]
    }) =>
      state.layout
        .map((size, index) => [size, state.constraints[index]] as const)
        .map(([size, { min, max }]) =>
          size < min || size > max
            ? `a panel at ${size} is outside ${min} to ${max}`
            : ""
        )
        .find(Boolean),
    values: {
      layout: [
        [50, 50],
        [30, 70],
      ],
      step: [1, 5],
      largeStep: [10, 20],
      "panel.minSize": [0, 60],
      "panel.maxSize": [100, 40],
      "panel.collapsible": [false, true],
      "panel.collapsedSize": [0, 5],
    },
    skip: {
      'panel "left" minSize: 0 to 60': "Fixed in #138.",
      'panel "left" minSize: 60 to 0': "Fixed in #138.",
      'panel "left" maxSize: 100 to 40': "Fixed in #138.",
      'panel "left" maxSize: 40 to 100': "Fixed in #138.",
      'panel "left" collapsible: false to true': "Fixed in #138.",
      'panel "left" collapsible: true to false': "Fixed in #138.",
      autoSaveId: "Read once to restore a saved layout, like a default.",
      storage: "Read once to restore a saved layout, like a default.",
    },
  },
  {
    name: "accordion",
    primitive: accordion,
    markup: `<root>
      <item value="a"><header><trigger>Shipping</trigger></header><panel>Ships in a day.</panel></item>
      <item value="b"><header><trigger>Returns</trigger></header><panel>Within a month.</panel></item>
    </root>`,
    parts: { item: { a: {} }, trigger: { "": {} }, panel: { "": {} } },
    values: { value: [["a"], ["b"]], collapsible: [false, true] },
  },
  {
    name: "avatar",
    primitive: avatar,
    markup: `<root><image src="/ada.png" alt="Ada"></image><fallback>AL</fallback></root>`,
    parts: { fallback: { "": { delay: [0, 500] } } },
    values: { fallbackDelay: [0, 500] },
  },
  {
    name: "button",
    primitive: button,
    markup: `<root>Save</root>`,
    values: {
      type: ["button", "submit"],
      pendingAnnouncement: ["Saving", "Sending"],
    },
  },
  {
    name: "checkbox",
    primitive: checkbox,
    history: ["initial", "[checked]"],
    markup: `<root aria-label="Accept"><indicator></indicator></root><input>`,
    parts: { indicator: { "": {} } },
    values: {
      checked: [false, true, "indeterminate"],
      parent: [false, true],
      name: ["terms", "consent"],
      value: ["on", "yes"],
      form: ["one", "two"],
    },
    skip: { group: "A group's controller, handed over like `controller`." },
  },
  {
    name: "checkbox group",
    primitive: checkboxGroup,
    history: ["initial", "[checked]"],
    markup: `<group aria-label="Toppings"></group><group-input></group-input>`,
    values: {
      value: [[], ["cheese"]],
      allValues: [["cheese"], ["cheese", "ham"]],
      name: ["toppings", "extras"],
      form: ["one", "two"],
    },
  },
  {
    name: "collapsible",
    primitive: collapsible,
    markup: `<root><trigger>Details</trigger><panel>More about it.</panel></root>`,
    parts: { panel: { "": {} } },
    values: { open: [false, true] },
  },
  {
    name: "field",
    primitive: field,
    markup: `<root><label>Email</label><control></control><description>We never share it.</description><error>Required</error></root>`,
    parts: { label: { "": {} }, description: { "": {} }, control: { "": {} } },
    values: {
      name: ["email", "contact"],
      invalid: [false, true],
      "label.id": ["email-label", "contact-label"],
      "description.id": ["email-hint", "contact-hint"],
      "control.id": ["email", "contact"],
      "control.describedBy": ["note", "help"],
    },
    skip: { "error.match": "A function, called when validity changes." },
  },
  {
    name: "input",
    primitive: input,
    markup: `<root as="input" aria-label="Name"></root>`,
    parts: { root: { "": {} } },
    values: { value: ["Ada", "Grace"] },
  },
  {
    name: "textarea",
    primitive: textarea,
    markup: `<root as="textarea" aria-label="Notes"></root>`,
    parts: { root: { "": {} } },
    values: {
      value: ["Ada", "Grace"],
      autoResize: [false, true],
      submitShortcut: ["enter", "mod+enter"],
    },
  },
  {
    name: "listbox",
    primitive: listbox,
    markup: `<root aria-label="Fruit">
      <item value="apple">Apple</item>
      <item value="banana">Banana</item>
    </root>`,
    parts: { item: { banana: {} } },
    history: ["stop"],
    values: {
      value: ["apple", "banana"],
      deselectable: [false, true],
      keepInView: [true, false],
      virtualFocus: [false, true],
      name: ["fruit", "snack"],
      form: ["one", "two"],
      "item.label": ["Banana", "Plantain"],
    },
    skip: {
      items: "The markup names the items.",
      itemToValue: "Read with `items`, which the markup stands in for.",
      isItemEqualToValue: "A function, called when a value is compared.",
      "item.index": "The renderer's count of where the item is.",
    },
  },
  {
    name: "menubar",
    primitive: menubar,
    markup: `<root aria-label="App"></root>`,
    values: { modal: [true, false] },
  },
  {
    name: "meter",
    primitive: meter,
    markup: `<root aria-label="Battery"><track><indicator></indicator></track><label>Battery</label><value></value></root>`,
    options: { value: 40 },
    values: {
      value: [40, 60],
      min: [0, 20],
      max: [100, 80],
      locale: ["en-US", "de-DE"],
    },
    skip: {
      format: "A formatter, called for the text it shows.",
      getValueLabel: "A function, called for the text it shows.",
    },
  },
  {
    name: "progress",
    primitive: progress,
    markup: `<root aria-label="Upload"><track><indicator></indicator></track><label>Upload</label><value></value></root>`,
    options: { value: 40 },
    values: {
      value: [40, 60],
      min: [0, 20],
      max: [100, 80],
      locale: ["en-US", "de-DE"],
    },
    skip: {
      format: "A formatter, called for the text it shows.",
      getValueLabel: "A function, called for the text it shows.",
    },
  },
  {
    name: "number input",
    primitive: numberInput,
    options: { defaultValue: 5 },
    history: ["initial"],
    markup: `<root><group><decrement>Less</decrement><control aria-label="Quantity"></control><increment>More</increment></group><scrub-area><scrub-area-cursor></scrub-area-cursor></scrub-area><hidden-input></hidden-input></root>`,
    parts: {
      increment: { "": {} },
      decrement: { "": {} },
      "scrub-area": { "": {} },
    },
    values: {
      value: [5, 7],
      min: [0, 6],
      max: [10, 4],
      step: [1, 2],
      largeStep: [10, 5],
      smallStep: [0.1, 0.5],
      locale: ["en-US", "de-DE"],
      wheel: [false, true],
      name: ["quantity", "count"],
      form: ["one", "two"],
      controlId: ["quantity", "count"],
      "scrub-area.pixelsPerStep": [4, 8],
    },
    skip: { format: "A formatter, called for the text it shows." },
  },
  {
    name: "otp input",
    primitive: otpInput,
    markup: `<root><control aria-label="Code"></control><group><slot index="0"></slot><slot index="1"></slot><slot index="2"></slot><slot index="3"></slot></group></root>`,
    options: { maxLength: 4 },
    values: {
      value: ["12", "34"],
      maxLength: [4, 6],
      pattern: ["digits", "alphanumeric"],
      inputMode: ["numeric", "text"],
      textAlign: ["start", "center"],
      autoComplete: ["one-time-code", "off"],
      name: ["code", "pin"],
      form: ["one", "two"],
    },
  },
  {
    name: "pagination",
    primitive: pagination,
    options: { pageCount: 5 },
    markup: `<root><list>
      <item><previous>Previous</previous></item>
      <item><link page="1">1</link></item>
      <item><link page="2">2</link></item>
      <item><next>Next</next></item>
    </list></root>`,
    values: {
      page: [1, 3],
      pageCount: [5, 10],
      siblings: [1, 2],
      boundaries: [1, 2],
    },
    skip: {
      total:
        "With `pageSize`, another way to say `pageCount`; the next case tries them.",
      pageSize:
        "With `total`, another way to say `pageCount`; the next case tries them.",
      getHref: "A function, called for each link.",
    },
  },
  {
    name: "pagination by total",
    primitive: pagination,
    options: { total: 50, pageSize: 10 },
    markup: `<root><list><item><link page="1">1</link></item><item><next>Next</next></item></list></root>`,
    values: {
      page: [1, 3],
      total: [50, 100],
      pageSize: [10, 20],
      siblings: [1, 2],
      boundaries: [1, 2],
    },
    skip: {
      pageCount: "The case before tries it.",
      getHref: "A function, called for each link.",
    },
  },
  {
    name: "password input",
    primitive: passwordInput,
    markup: `<root><control aria-label="Password"></control><toggle>Show</toggle></root>`,
    parts: { control: { "": {} } },
    values: {
      value: ["secret", "hunter2"],
      visible: [false, true],
      autoComplete: ["current-password", "new-password"],
      name: ["password", "pin"],
      form: ["one", "two"],
      controlId: ["password", "pin"],
      "control.id": ["password", "pin"],
    },
  },
  {
    name: "radio group",
    primitive: radioGroup,
    options: { defaultValue: "s" },
    history: ["initial", "stop"],
    markup: `<group aria-label="Size">
      <root value="s">Small</root>
      <root value="m">Medium</root>
    </group>`,
    parts: { root: { m: {} } },
    values: { value: ["s", "m"], name: ["size", "fit"], form: ["one", "two"] },
  },
  {
    name: "scroll area",
    primitive: scrollArea,
    markup: `<root><viewport><content>Text</content></viewport><scrollbar><thumb></thumb></scrollbar><corner></corner></root>`,
    parts: { scrollbar: { "": {} } },
    values: {
      type: ["hover", "always"],
      scrollHideDelay: [600, 1000],
      stickToEnd: [false, true],
    },
    skip: {
      'type: "always" to "hover"':
        "Its scrollbars hide after `scrollHideDelay`, as when the pointer leaves.",
    },
  },
  {
    name: "separator",
    primitive: separator,
    markup: `<root></root>`,
    values: { decorative: [false, true] },
  },
  {
    name: "switch",
    primitive: switchPrimitive,
    history: ["initial", "[checked]"],
    markup: `<root aria-label="Wi-Fi"><thumb></thumb></root>`,
    values: {
      checked: [false, true],
      name: ["wifi", "radio"],
      value: ["on", "yes"],
      form: ["one", "two"],
    },
  },
  {
    name: "toggle",
    primitive: toggle,
    markup: `<root aria-label="Bold">B</root>`,
    values: { pressed: [false, true], value: ["bold", "strong"] },
    skip: {
      group: "A group's controller, handed over like `controller`.",
      toolbar: "A toolbar's controller, handed over like `controller`.",
    },
  },
  {
    name: "toggle group",
    primitive: toggleGroup,
    markup: `<group aria-label="Align"></group>`,
    values: { value: [[], ["left"]], deselectable: [false, true] },
    skip: { toolbar: "A toolbar's controller, handed over like `controller`." },
  },
  {
    name: "tree",
    primitive: tree,
    markup: `<root aria-label="Files">
      <item value="src" branch>
        <label>src</label>
        <group>
          <item value="index"><label>index.ts</label></item>
        </group>
      </item>
      <item value="docs"><label>docs</label></item>
    </root>`,
    parts: { item: { docs: {} }, group: { "": {} } },
    // Counts of the times items came and went.
    history: ["stop", "version", "siblings"],
    values: {
      pendingAnnouncement: ["Loading", "Saving"],
      mode: ["single", "multiple"],
      value: ["docs", "index"],
      expanded: [[], ["src"]],
      expandOnPress: [false, true],
      checkable: [false, true],
      checked: [[], ["docs"]],
      checkStrategy: ["leaf", "independent"],
      // Top level: markup renders only open branches, so a current item inside
      // a closed one can be revealed only from data.
      current: ["docs", "src"],
      "item.branch": [false, true],
      "item.label": ["docs", "Documents"],
    },
    skip: {
      items: "The markup names the items.",
      paths: "Read with `items`, which the markup stands in for.",
      loadChildren: "A function, called when a branch opens.",
      announcement: "Read each time it announces, and never shown.",
    },
  },
  {
    name: "dialog",
    primitive: dialog,
    options: { defaultOpen: true },
    history: ["titled"],
    markup: `<div>
      <trigger>Open</trigger>
      <backdrop></backdrop>
      <content><title>Settings</title><description>Change them.</description><button>Save</button><close>Close</close></content>
    </div>`,
    parts: { trigger: { "": {} }, content: { "": {} }, close: { "": {} } },
    values: { ...popups, ...dialogs },
    skip: { ...popupSkips, "content.inline": inlineSkip },
  },
  {
    name: "alert dialog",
    primitive: alertDialog,
    options: { defaultOpen: true },
    history: ["titled"],
    markup: `<div>
      <trigger>Delete</trigger>
      <backdrop></backdrop>
      <content><title>Delete the file?</title><description>It can't be undone.</description><close>Cancel</close></content>
    </div>`,
    parts: { trigger: { "": {} }, content: { "": {} }, close: { "": {} } },
    values: { ...popups, ...dialogs },
    skip: { ...popupSkips, "content.inline": inlineSkip },
  },
  {
    name: "drawer",
    primitive: drawer,
    options: { defaultOpen: true },
    history: ["titled", "snapIndex"],
    markup: `<div>
      <trigger>Open</trigger>
      <backdrop></backdrop>
      <viewport><content><handle></handle><title>Filters</title><description>Narrow the list.</description><close>Done</close></content></viewport>
    </div>`,
    parts: { trigger: { "": {} }, content: { "": {} }, close: { "": {} } },
    values: {
      ...popups,
      ...dialogs,
      side: ["bottom", "right"],
      snapPoints: [[1], [0.5, 1]],
      snapPoint: [1, 0.5],
      driver: ["pointer", "scroll-snap"],
      expandOnScroll: [false, true],
      themeColor: [false, true],
      preventEdgeSwipe: [false, true],
    },
    skip: {
      ...popupSkips,
      modalAbove: "Applies once the drawer comes to rest, which needs a drag.",
      "snapPoints: [1] to [0.5,1]":
        "An open drawer stays at its snap point while that point remains.",
      "open: false to true":
        "A DOM made for tests gives the drawer no height, so a rise from closed ends where it started.",
      physics: "Read when the drawer moves, which needs a drag.",
      "outlet.keyframes": "Read when the drawer moves, which needs a drag.",
    },
  },
  {
    name: "popover",
    primitive: popover,
    options: { defaultOpen: true },
    history: ["titled"],
    markup: `<div>
      <trigger>Share</trigger>
      <content><arrow></arrow><title>Share</title><description>Send a link.</description><button>Copy link</button><close>Close</close></content>
    </div>`,
    parts: { trigger: { "": {} }, content: { "": {} } },
    values: {
      ...popups,
      ...placed,
      openOnHover: [false, true],
      delay: [0, 300],
      closeDelay: [0, 300],
      dismissible: [true, false],
    },
    skip: { ...popupSkips, "content.inline": inlineSkip },
  },
  {
    name: "hover card",
    primitive: hoverCard,
    options: { defaultOpen: true },
    history: ["titled"],
    markup: `<div><trigger href="/ada">Ada</trigger><content><arrow></arrow>Ada Lovelace</content></div>`,
    parts: { content: { "": {} } },
    values: { ...popups, ...placed, delay: [0, 300], closeDelay: [0, 300] },
    skip: popupSkips,
  },
  {
    name: "tooltip",
    primitive: tooltip,
    options: { defaultOpen: true },
    history: ["titled", "instant", "[data-instant]"],
    markup: `<div><trigger>Save</trigger><content><arrow></arrow>Save the file<shortcut></shortcut></content></div>`,
    parts: { content: { "": {} } },
    values: {
      ...popups,
      ...placed,
      delay: [0, 300],
      closeDelay: [0, 300],
      toggleable: [false, true],
      closeOnPress: [true, false],
      type: ["label", "description"],
      shortcut: ["mod+s", "mod+shift+s"],
    },
    skip: {
      ...popupSkips,
      "open: true to false":
        "Closed, its content keeps the place it last had, hidden.",
    },
  },
  {
    name: "menu",
    primitive: menu,
    options: { defaultOpen: true },
    markup: `<div>
      <trigger>Edit</trigger>
      <content>
        <item id="cut">Cut<shortcut></shortcut></item>
        <item id="copy">Copy</item>
        <separator></separator>
        <group id="more"><group-label>More</group-label><item id="paste">Paste</item></group>
      </content>
    </div>`,
    parts: { trigger: { "": {} }, content: { "": {} }, item: { cut: {} } },
    history: ["stop", "titled"],
    values: {
      pendingAnnouncement: ["Loading", "Saving"],
      ...popups,
      ...placed,
      itemShortcuts: [true, false],
      delay: [0, 300],
      dismissible: [true, false],
      "item.value": ["cut", "trim"],
      "item.label": ["Cut", "Trim"],
      "item.destructive": [false, true],
      "item.shortcut": ["mod+x", "mod+shift+x"],
      "item.closeOnSelect": [true, false],
    },
    skip: {
      ...popupSkips,
      items: "The markup names the items.",
      parent: "A parent menu's controller, handed over like `controller`.",
      menubar: "A menubar's controller, handed over like `controller`.",
      "group-label.group": "Names its group, which the markup sets once.",
    },
  },
  {
    name: "select",
    primitive: select,
    options: { defaultOpen: true },
    markup: `<root>
      <label>Fruit</label>
      <trigger><value></value></trigger>
      <content><list>
        <item value="apple"><item-text text="Apple">Apple</item-text><item-indicator></item-indicator></item>
        <item value="banana"><item-text text="Banana">Banana</item-text></item>
      </list></content>
      <form-input></form-input>
    </root>`,
    parts: {
      trigger: { "": {} },
      value: { "": {} },
      content: { "": {} },
      item: { banana: {} },
      "item-text": { "": {} },
    },
    history: ["stop", "titled"],
    values: {
      ...lists,
      open: [true, false],
      value: ["apple", "banana"],
      placeholder: ["Pick one", "Choose"],
      autoComplete: ["off", "country"],
      "value.placeholder": ["Pick one", "Choose"],
      "value.maxLabels": [1, 2],
      "value.text": [false, true],
      "content.alignItemWithTrigger": [true, false],
      virtualFocus: [false, true],
      ...placed,
    },
    skip: {
      "open: false to true":
        "Opened after it renders, it highlights its first item, as opening it by hand does.",
      ...popupSkips,
      ...listSkips,
      "open: true to false":
        "Once opened, the list stays rendered, closed, so its items can name the value.",
      items: "The markup names the items.",
      "trigger.named": "Whether a field names it, which the field tells it.",
    },
  },
  {
    name: "combobox",
    primitive: combobox,
    options: { items: ["Apple", "Banana"], defaultOpen: true },
    history: ["labels", "mounts"],
    markup: `<root>
      <label>Fruit</label>
      <input>
      <trigger>Show</trigger>
      <clear>Clear</clear>
      <content><list>
        <item value="Apple"><item-text text="Apple">Apple</item-text><item-indicator></item-indicator></item>
        <item value="Banana"><item-text text="Banana">Banana</item-text></item>
      </list><empty>None</empty></content>
      <form-input></form-input>
    </root>`,
    parts: {
      content: { "": {} },
      item: { Banana: {} },
      "item-text": { "": {} },
      clear: { "": {} },
    },
    values: {
      pendingAnnouncement: ["Loading", "Saving"],
      ...lists,
      open: [true, false],
      value: ["Apple", "Banana"],
      maxSelected: [2, 1],
      autoHighlight: [false, true],
      keepQuery: [false, true],
      allowCustomValue: [false, true],
      ...placed,
    },
    skip: {
      ...popupSkips,
      ...listSkips,
      items: "Changing the data is the list tests' job.",
    },
  },
  {
    name: "autocomplete",
    primitive: autocomplete,
    options: { items: ["Apple", "Banana"], defaultOpen: true },
    history: ["labels", "mounts"],
    markup: `<div>
      <label>Fruit</label>
      <input>
      <trigger>Show</trigger>
      <clear>Clear</clear>
      <content><list>
        <item value="Apple"><item-text text="Apple">Apple</item-text></item>
        <item value="Banana"><item-text text="Banana">Banana</item-text></item>
      </list><empty>None</empty></content>
    </div>`,
    parts: {
      content: { "": {} },
      item: { Banana: {} },
      "item-text": { "": {} },
      clear: { "": {} },
    },
    values: {
      ...lists,
      open: [true, false],
      value: ["", "Ap"],
      inlineComplete: [false, true],
      autoHighlight: [false, true],
      openOnFocus: [false, true],
      submitOnSelect: [false, true],
      ...placed,
    },
    skip: {
      ...popupSkips,
      ...listSkips,
      items: "Changing the data is the list tests' job.",
    },
  },
  {
    name: "command",
    primitive: command,
    markup: `<root>
      <input aria-label="Search">
      <list>
        <item value="new"><item-text text="New file">New file</item-text><shortcut></shortcut></item>
        <item value="open"><item-text text="Open file">Open file</item-text></item>
      </list>
      <empty>Nothing found</empty>
    </root>`,
    parts: { item: { open: {} }, "item-text": { "": {} } },
    values: {
      pendingAnnouncement: ["Loading", "Saving"],
      ...lists,
      value: ["new", "open"],
      pages: [[], ["settings"]],
      autoHighlight: [true, false],
      "item.shortcut": ["mod+o", "mod+shift+o"],
      "item.page": ["", "settings"],
    },
    skip: {
      ...listSkips,
      items: "The markup names the items.",
      "item.data": "Whether data or markup made the item.",
      "autoHighlight: true to false":
        "Turned off, the highlight it showed stays.",
    },
  },
  {
    name: "navigation menu",
    primitive: navigationMenu,
    options: { defaultValue: "learn" },
    markup: `<root aria-label="Main"><list>
      <item value="learn"><trigger>Learn</trigger><content><link href="/docs">Docs</link></content></item>
      <item value="about"><link href="/about">About</link></item>
    </list><viewport></viewport><indicator></indicator></root>`,
    parts: { trigger: { "": {} }, content: { "": {} }, link: { "": {} } },
    values: {
      value: ["learn", null],
      delay: [0, 300],
      closeDelay: [0, 300],
      openOnHover: [true, false],
      closeOnSelect: [true, false],
      "link.current": [false, true],
      "link.closeOnSelect": [true, false],
      ...placed,
    },
    skip: {
      ...popupSkips,
      parent: "A parent menu's controller, handed over like `controller`.",
      "viewport.container": "An element, which markup can't name.",
      "viewport.anchor":
        "Names an element to place against, which markup can't follow.",
      'value: "learn" to null':
        "A closed menu keeps the item it showed last, so the indicator leaves from there.",
    },
  },
  {
    name: "calendar",
    primitive: calendar,
    options: { defaultMonth: "2026-10", today: "2026-10-16" },
    markup: `<root aria-label="Dates"><heading></heading><previous>Previous</previous><next>Next</next><grid></grid></root>`,
    parts: { grid: { "": {} } },
    values: {
      ...dates,
      mode: ["single", "range"],
      value: [[], ["2026-10-05"]],
      deselectable: [false, true],
      "grid.offset": [0, 1],
    },
  },
  {
    name: "date picker",
    primitive: datePicker,
    options: {
      defaultMonth: "2026-10",
      today: "2026-10-16",
      defaultOpen: true,
    },
    markup: `<root>
      <input aria-label="Date"></input>
      <trigger>Pick</trigger>
      <hidden-input></hidden-input>
      <content><heading></heading><previous>Previous</previous><next>Next</next><grid></grid><clear>Clear</clear></content>
    </root>`,
    parts: { content: { "": {} }, input: { "": {} } },
    values: {
      ...dates,
      mode: ["single", "range"],
      value: [[], ["2026-10-05"]],
      open: [true, false],
      closeOnSelect: [true, false],
      dismissible: [true, false],
      name: ["date", "day"],
      form: ["one", "two"],
      startName: ["from", "start"],
      endName: ["to", "end"],
      "input.end": [false, true],
      ...placed,
    },
    skip: { ...popupSkips },
  },
  {
    name: "carousel",
    primitive: carousel,
    markup: `<root aria-label="Photos">
      <viewport><content><item id="one">One</item><item id="two">Two</item></content></viewport>
      <previous>Previous</previous><next>Next</next>
      <indicator-group><indicator page="0"></indicator><indicator page="1"></indicator></indicator-group>
      <play-toggle>Play</play-toggle>
    </root>`,
    values: {
      page: [0, 1],
      playing: [false, true],
      interval: [4000, 6000],
      align: ["start", "center"],
      slidesPerPage: [1, 2],
      skipSnaps: [false, true],
      dragFree: [false, true],
      drag: [true, false],
    },
    skip: { "indicator.page": "Names its page, which the markup sets once." },
  },
  {
    name: "file input",
    primitive: fileInput,
    markup: `<root><input></input><trigger>Choose</trigger><dropzone>Drop here</dropzone><list></list></root>`,
    parts: { dropzone: { "": {} } },
    values: {
      accept: ["image/*", ".pdf"],
      maxFiles: [1, 3],
      maxSize: [1000, 2000],
      minSize: [0, 10],
      directory: [false, true],
      capture: ["user", "environment"],
      name: ["files", "uploads"],
      form: ["one", "two"],
      "dropzone.target": ["self", "page"],
    },
    skip: {
      value: "Files can't be made in markup; the file input tests change them.",
      validate: "A function, called when files arrive.",
      announcement: "Read each time it announces, and never shown.",
      "dropzone.pasteTarget": "Read when something is pasted.",
    },
  },
  {
    name: "token input",
    primitive: tokenInput,
    markup: `<root><editor aria-label="To"></editor><form-input></form-input></root>`,
    parts: { editor: { "": {} } },
    values: {
      value: [[], ["ada@example.com"]],
      submitShortcut: ["enter", "mod+enter"],
      tokenDeletion: ["whole", "select"],
      copy: ["codec", "label"],
      name: ["to", "cc"],
      form: ["one", "two"],
      "editor.placeholder": ["Add people", "Add more"],
    },
    skip: {
      codec: "Reads and writes the text, which the codec tests cover.",
      getTokenDescription: "A function, called for each token's name.",
      history: "Read when an edit is undone.",
    },
  },
  {
    name: "toast region",
    primitive: toastRegion,
    markup: `<region><list></list></region>`,
    values: {
      side: ["bottom", "top"],
      align: ["end", "start"],
      maxVisible: [3, 5],
      expanded: [false, true],
      shortcut: ["F6", "alt+t"],
      pendingAnnouncement: ["Loading", "Saving"],
      placed: [false, true],
      label: ["Notifications", "Alerts"],
    },
    skip: { toaster: "A queue, handed over like `controller`." },
  },
]

export { cases, type Case }
