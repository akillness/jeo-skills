import { menu as bareMenu } from "../src/components/menu/menu"
import {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "../src/components/menu/menu-parts"

// A menu whose optional parts are all registered, as on a page that renders
// them. Tests read their slots without an adapter, which would register them.
function menu(options: Parameters<typeof bareMenu>[0]) {
  const instance = bareMenu(options)
  for (const feature of [menuCheckable, menuContextTrigger, menuItemIcons]) {
    instance.use(feature)
  }
  return instance
}

export { menu }
