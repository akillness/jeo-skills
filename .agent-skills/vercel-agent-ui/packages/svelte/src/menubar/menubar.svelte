<!--
@component
A row of menus, like a desktop app's: one tab stop, arrow keys between the
triggers and between open menus. Each `Menu` inside joins it.
@stable
-->
<script lang="ts">
  import {
    menubar as menubarPrimitive,
    type MenubarController,
    type MenubarOrientation,
    type MenubarState,
  } from "@ui-sdk/core/menubar"
  import { setContext } from "svelte"
  import { MenubarKey, type MenubarContext } from "../menubar-context"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    orientation,
    loop,
    disabled,
    modal,
    controller,
    debug,
    ...rest
  }: PartProps<"div", MenubarState> & {
    /** Which arrow keys move between menus: left and right, or up and down. A vertical menubar opens its menus to the side. */
    orientation?: MenubarOrientation
    /** Whether arrow keys wrap from the last menu to the first, between triggers and between open menus. */
    loop?: boolean
    /** Stops every menu from opening. Triggers stay focusable with `aria-disabled`, so the menubar keeps its tab stop. */
    disabled?: boolean
    /** The `modal` setting of every menu in the menubar that doesn't set its own. */
    modal?: boolean | "pointer"
    /** Opens, closes and focuses the menubar from anywhere. Create one with `createMenubarController()`. */
    controller?: MenubarController
    /** Logs every state change. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const menubar = usePrimitive(menubarPrimitive, () => ({
    id,
    orientation,
    loop,
    disabled,
    modal,
    controller,
    debug,
  }))
  setContext<MenubarContext>(MenubarKey, menubar)
  const root = useHandlePart(menubar, "root")
</script>

<Part tag="div" part={root} props={rest} />
