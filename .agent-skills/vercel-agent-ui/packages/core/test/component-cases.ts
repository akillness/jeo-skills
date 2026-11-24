// One case per component, for tests that check a rule across every component:
// the primitive, the smallest markup that renders its interactive parts, and
// the options it starts with.
import type { Primitive } from "../src/foundation/kernel/primitive-types"
import { accordion } from "../src/components/accordion/accordion"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { button } from "../src/components/button/button"
import { calendar } from "../src/components/calendar/calendar"
import { checkbox } from "../src/components/checkbox/checkbox"
import { collapsible } from "../src/components/collapsible/collapsible"
import { combobox } from "../src/components/combobox/combobox"
import { datePicker } from "../src/components/date-picker/date-picker"
import { fileInput } from "../src/components/file-input/file-input"
import { listbox } from "../src/components/listbox/listbox-root"
import { numberInput } from "../src/components/number-input/number-input"
import { otpInput } from "../src/components/otp-input/otp-input"
import { passwordInput } from "../src/components/password-input/password-input"
import { radioGroup } from "../src/components/radio/radio"
import { resizable } from "../src/components/resizable/resizable"
import { select } from "../src/components/select/select"
import { slider } from "../src/components/slider/slider"
import { switchPrimitive } from "../src/components/switch/switch"
import { toggle } from "../src/components/toggle/toggle"
import { tokenInput } from "../src/components/token-input/token-input"
import { toolbar } from "../src/components/toolbar/toolbar"
import { tree } from "../src/components/tree/tree"

type ComponentCase = {
  name: string
  primitive: Primitive
  markup: string
  options?: Record<string, unknown>
}

const componentCases: ComponentCase[] = [
  {
    name: "accordion",
    primitive: accordion,
    markup: `<root><item value="a"><header><trigger>A</trigger></header><panel>A</panel></item></root>`,
  },
  {
    name: "autocomplete",
    primitive: autocomplete,
    markup: `<div><input as="input" aria-label="Fruit"></input><trigger>Open</trigger><content><list><item value="apple">Apple</item></list></content></div>`,
  },
  { name: "button", primitive: button, markup: `<root>Save</root>` },
  {
    name: "calendar",
    primitive: calendar,
    markup: `<root><heading></heading><previous>Previous</previous><next>Next</next></root>`,
  },
  {
    name: "checkbox",
    primitive: checkbox,
    markup: `<root aria-label="Accept"><indicator></indicator></root><input></input>`,
  },
  {
    name: "collapsible",
    primitive: collapsible,
    markup: `<root><trigger>Details</trigger><panel>More</panel></root>`,
  },
  {
    name: "combobox",
    primitive: combobox,
    markup: `<root><input as="input" aria-label="Fruit"></input><trigger>Open</trigger><content><list><item value="apple">Apple</item></list></content><form-input></form-input></root>`,
  },
  {
    name: "date picker",
    primitive: datePicker,
    markup: `<root><input as="input" aria-label="Date"></input><trigger>Open</trigger><hidden-input></hidden-input></root>`,
  },
  {
    name: "file input",
    primitive: fileInput,
    markup: `<root><input></input><trigger>Choose</trigger><dropzone>Drop files</dropzone></root>`,
  },
  {
    name: "listbox",
    primitive: listbox,
    markup: `<root aria-label="Fruit"><item value="apple">Apple</item><item value="pear">Pear</item><form-input></form-input></root>`,
  },
  {
    name: "number input",
    primitive: numberInput,
    markup: `<root><group><decrement>Less</decrement><control as="input" aria-label="Quantity"></control><increment>More</increment></group><hidden-input></hidden-input></root>`,
  },
  {
    name: "otp input",
    primitive: otpInput,
    markup: `<root><control as="input" aria-label="Code"></control></root>`,
  },
  {
    name: "password input",
    primitive: passwordInput,
    markup: `<root><control as="input" aria-label="Password"></control><toggle>Show</toggle></root>`,
  },
  {
    name: "radio group",
    primitive: radioGroup,
    markup: `<group aria-label="Size"><root value="s">Small<input></input></root><root value="m">Medium<input></input></root></group>`,
  },
  {
    name: "resizable",
    primitive: resizable,
    markup: `<root><panel id="start"></panel><handle aria-label="Resize"></handle><panel id="end"></panel></root>`,
  },
  {
    name: "select",
    primitive: select,
    markup: `<root><trigger aria-label="Fruit"><value></value></trigger><content><list><item value="apple">Apple</item></list></content><form-input></form-input></root>`,
  },
  {
    name: "slider",
    primitive: slider,
    markup: `<root aria-label="Volume"><control><track><indicator></indicator></track><thumb><thumb-input></thumb-input></thumb></control><input></input></root>`,
  },
  {
    name: "switch",
    primitive: switchPrimitive,
    markup: `<root aria-label="Wi-Fi"><thumb></thumb></root><input></input>`,
  },
  {
    name: "toggle",
    primitive: toggle,
    markup: `<root aria-label="Bold">B</root>`,
  },
  {
    name: "token input",
    primitive: tokenInput,
    markup: `<root><editor aria-label="Tags"></editor><form-input></form-input></root>`,
  },
  {
    name: "toolbar",
    primitive: toolbar,
    markup: `<root aria-label="Format"><button value="bold">Bold</button><input as="input" value="size" aria-label="Size"></input></root>`,
  },
  {
    name: "tree",
    primitive: tree,
    markup: `<root aria-label="Files"><item value="a"><label>Docs</label></item></root>`,
  },
]

export { componentCases, type ComponentCase }
