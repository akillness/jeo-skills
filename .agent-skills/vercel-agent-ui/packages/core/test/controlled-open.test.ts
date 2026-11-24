import { expect, test } from "vitest"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { alertDialog } from "../src/components/dialog/alert-dialog"
import { dialog } from "../src/components/dialog/dialog"
import { drawer } from "../src/components/drawer/drawer"
import { hoverCard } from "../src/components/hover-card/hover-card"
import { menu } from "../src/components/menu/menu"
import { popover } from "../src/components/popover/popover"
import { select } from "../src/components/select/select"
import { tooltip } from "../src/components/tooltip/tooltip"

const popups = {
  autocomplete,
  combobox,
  alertDialog,
  dialog,
  drawer,
  hoverCard,
  menu,
  popover,
  select,
  tooltip,
}

test.each(Object.entries(popups))(
  "%s open from its first render mounts its content",
  (name, primitive) => {
    const create = primitive as (options: { id: string; open: boolean }) => {
      get: () => object
    }
    expect(create({ id: name, open: true }).get()).toMatchObject({
      open: true,
      mounted: true,
    })
    expect(create({ id: name, open: false }).get()).toMatchObject({
      open: false,
      mounted: false,
    })
  }
)
