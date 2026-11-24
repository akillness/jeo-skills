import { dev, warn } from "#dev"
import { checkName } from "#name-check"
import { bindHold } from "../../foundation/direct-manipulation/hold"
import { isPromise } from "../../foundation/kernel/action"
import { keyWhileBound } from "../../foundation/kernel/bound-keys"
import {
  buttonElement,
  buttonElementAttrs,
  opensElsewhere,
} from "../../foundation/platform/button"
import { isRTL } from "../../foundation/platform/env"
import { ariaKeyshortcuts } from "../../foundation/platform/platform"
import {
  popupContentAttrs,
  popupTriggerAttrs,
} from "../../foundation/popups/popup"
import { registerPopupElement } from "../../foundation/popups/popup-elements"
import { placementOptions } from "../../foundation/popups/popup-features"
import { animateIn } from "../../foundation/motion/presence"
import { labelOf } from "../../foundation/text/typeahead"
import {
  itemIconPart,
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import { checkedAttrs, idPart, openAttrs } from "../../foundation/kernel/attrs"
import { on, selectEvent } from "../../foundation/kernel/events"
import { onProps } from "../../foundation/kernel/part"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import { adoptPlatform } from "../../foundation/shortcuts/shortcut-slot"
import { shortcuts as shortcutManager } from "../../foundation/shortcuts/shortcuts"
import { selects } from "../../foundation/kernel/selects"

import type {
  MenuCheckboxItemState,
  MenuContentState,
  MenuContextTriggerState,
  MenuItemIndicatorState,
  MenuItemState,
  MenuRadioGroupState,
  MenuRadioItemState,
  MenuTriggerState,
} from "./menu"
import {
  bindItemShortcuts,
  itemSelector,
  triggerDisabled,
  type CheckboxProps,
  type ContentProps,
  type ContextTriggerProps,
  type IndicatorProps,
  type ItemProps,
  type MenuApi,
  type MenuState,
  type RadioGroupProps,
  type RadioProps,
  type SubTriggerProps,
  type TriggerProps,
} from "./menu-api"

// A group is named by its label only while one is in the page, so an unlabeled group points at no missing id.
const menuGroupLabelledBy = (state: MenuState, id: string, group: string) =>
  state.groupLabels.includes(group) ? `${id}-label-${idPart(group)}` : undefined

// The content is named by the trigger that opened it, which a context area or
// a controller's open without a trigger isn't. A submenu's trigger always names it.
const namedByTrigger = (state: MenuState, nested: boolean) =>
  nested ||
  (state.trigger === null
    ? state.triggers.length > 0
    : state.triggers.includes(state.trigger))

const triggerElement = (state: MenuState, key: string) =>
  state.triggerElements[key] ?? "button"

// The menu's slots, which its features' slots join.
const menuSlots = (slot: SlotFactory<MenuState, MenuApi>) => ({
  trigger: slot<TriggerProps, MenuTriggerState>({
    props: {
      id: "id",
      disabled: "boolean",
      focusableWhenDisabled: "boolean",
      payload: "value",
      shortcut: "string",
    },
    selects: selects({ values: [], triggerElements: ({ key }) => [key] }),
    // A submenu's trigger is an item of its parent menu, and a menubar's an item
    // of the menubar. Any other is a button, whatever it's rendered as.
    role: (state, { api, key }) => {
      if (api.root() !== api || api.menubar()) {
        return "menuitem"
      }
      return triggerElement(state, key) === "other" ? "button" : undefined
    },
    roles: ["menuitem", "button"],
    focus: "roving",
    state: (state, { api, key, props }) => ({
      open:
        state.open &&
        (api.root() !== api || state.trigger === null || state.trigger === key),
      disabled: triggerDisabled(state, props),
    }),
    attrs: (state, { id, key, api, props }) => {
      if (api.root() !== api) {
        return {
          ...popupTriggerAttrs({ ...state, trigger: null }, id, "menu"),
          tabindex: "-1",
          "aria-disabled": props.disabled ? "true" : undefined,
          "data-disabled": props.disabled ? "" : undefined,
        }
      }
      // A menubar's triggers are its items: one tab stop between them, and
      // disabled ones stay focusable, as the APG menubar asks.
      if (api.menubar()) {
        const disabled = triggerDisabled(state, props)
        const stop =
          state.barStop ?? api.menubar()!.internal.isStop(id, !disabled)
        return {
          ...popupTriggerAttrs(state, id, "menu", key),
          type: "button",
          tabindex: stop ? "0" : "-1",
          "aria-disabled": disabled ? "true" : undefined,
          "data-disabled": disabled ? "" : undefined,
          "aria-keyshortcuts": props.shortcut
            ? ariaKeyshortcuts(props.shortcut, state.apple)
            : undefined,
        }
      }
      return {
        ...popupTriggerAttrs(state, id, "menu", key),
        ...buttonElementAttrs(triggerElement(state, key), {
          type: "button",
          disabled: !!props.disabled,
          focusable: !!props.focusableWhenDisabled,
        }),
        "data-disabled": props.disabled ? "" : undefined,
        "aria-keyshortcuts": props.shortcut
          ? ariaKeyshortcuts(props.shortcut, state.apple)
          : undefined,
      }
    },
    on: {
      keydown(event, { api, el, key, props }) {
        if (api.root() !== api) {
          return
        }
        if (api.menubar()) {
          return api.internal.barKeydown(event, el!, key, props)
        }
        if (props.disabled) {
          return
        }
        const native = el!.tagName === "BUTTON"
        const payload = props.payload
        if (
          event.key === "ArrowDown" ||
          (!native && (event.key === "Enter" || event.key === " "))
        ) {
          event.preventDefault()
          api.show({ focus: "first", event, trigger: key, payload })
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          api.show({ focus: "last", event, trigger: key, payload })
        }
      },
      pointerdown(event, { api, el, key, props, store }) {
        if (
          api.root() !== api ||
          event.button !== 0 ||
          event.pointerType === "touch"
        ) {
          return
        }
        if (triggerDisabled(store.get(), props)) {
          return
        }
        // Mouse and pen open on press, like native menus. The click that follows is ignored.
        api.internal.pointerPress(el!, event, key, props.payload)
      },
      pointermove(event, { api, el, id }) {
        api.parentMenu()?.internal.hoverItem(el!, event)
        api.menubar()?.internal.hoverMove(id, event)
      },
      pointerenter(event, { api, id }) {
        api.menubar()?.internal.hover(id, event)
      },
      pointerleave(event, { api, id }) {
        if (event.pointerType === "touch") {
          return
        }
        const popup = api.popupElement()
        api.menubar()?.internal.leave(id, event, popup)
        if (api.isOpen() && popup) {
          api
            .parentMenu()
            ?.internal.safeArea.start(
              { x: event.clientX, y: event.clientY },
              popup
            )
        } else {
          api.parentMenu()?.internal.cancelHoverOpen()
        }
      },
    },
    press({ api, key, props, el, store }, event) {
      if (api.root() !== api) {
        if (props.disabled || el?.getAttribute("aria-disabled") === "true") {
          return
        }
        if (!api.isOpen()) {
          api.show({
            focus:
              (event as MouseEvent | undefined)?.detail === 0
                ? "first"
                : "none",
            event,
            reason: "trigger-press",
          })
          return
        }
        // In a sheet, the trigger stays above its submenu as the row that goes back.
        if (api.presentation() !== "sheet") {
          return
        }
        api.hide({ reason: "trigger-press", event, focus: false })
        api.focusTriggerItem()
        return
      }
      if (
        triggerDisabled(store.get(), props) ||
        api.internal.consumePressClick()
      ) {
        return
      }
      // Another trigger takes the open menu over, with its own payload.
      const active = store.get().trigger
      if (api.isOpen() && active !== null && active !== key) {
        return api.internal.takeOver({
          trigger: key,
          payload: props.payload,
          reason: "trigger-press",
          event,
        })
      }
      // A click with no press before it came from the keyboard or a screen reader.
      if (api.isOpen()) {
        api.hide({ reason: "trigger-press", event })
      } else {
        api.show({
          focus: "first",
          event,
          reason: "trigger-press",
          trigger: key,
          payload: props.payload,
        })
      }
    },
    bind(el, { api, store, key, id }) {
      // The client knows its platform now. Vue binds refs mid-hydration, so
      // the switch waits a microtask, which still lands before paint.
      adoptPlatform(store)
      checkName(el, "The trigger", { component: "menu", id })
      const parentMenu = api.parentMenu()
      const cleanups: (() => void)[] = []
      if (parentMenu) {
        cleanups.push(
          parentMenu.internal.register(el, {
            key: el.id,
            kind: "submenu",
            label: () => labelOf(el),
            disabled: () =>
              !!api.itemProps<SubTriggerProps>("trigger", key)?.disabled ||
              el.getAttribute("aria-disabled") === "true",
            activate: (event) =>
              api.show({ focus: "first", event, reason: "trigger-press" }),
            openSubmenu: (focus, reason, event) =>
              api.show({ focus, reason, event }),
          })
        )
      }
      // The first trigger is the one focus returns to until another opens the menu.
      if (!parentMenu && store.get().trigger === null) {
        store.set({ trigger: key })
      }
      if (!parentMenu) {
        cleanups.push(keyWhileBound(store, "triggers", key))
      }
      const menubar = api.menubar()
      const element = buttonElement(el)
      if (
        !parentMenu &&
        !menubar &&
        triggerElement(store.get(), key) !== element
      ) {
        store.set({
          triggerElements: { ...store.get().triggerElements, [key]: element },
        })
      }
      if (menubar) {
        const latest = () => api.itemProps<TriggerProps>("trigger", key) ?? {}
        // The menubar's tab stop and disabled state render on this trigger.
        const follow = () => {
          const stop = menubar.internal.stop()
          store.set({
            barStop: stop === null ? store.get().barStop : stop === id,
            barDisabled: menubar.internal.disabled(),
          })
        }
        cleanups.push(
          menubar.internal.join(id, el, {
            isOpen: api.isOpen,
            disabled: () => triggerDisabled(store.get(), latest()),
            open: (options) =>
              api.show({ ...options, trigger: key, payload: latest().payload }),
            close: (options) => api.hide(options),
          }),
          menubar.internal.subscribe(follow)
        )
        follow()
      }
      // A root trigger's shortcut opens the menu with its first item focused, or closes it.
      if (!parentMenu) {
        cleanups.push(
          shortcutManager.register(
            () => api.itemProps<TriggerProps>("trigger", key)?.shortcut,
            (event) => {
              const props = api.itemProps<TriggerProps>("trigger", key) ?? {}
              // A disabled menubar disables its triggers' shortcuts too.
              if (triggerDisabled(store.get(), props)) {
                return
              }
              if (api.isOpen()) {
                api.hide({ reason: "shortcut", event })
              } else {
                api.show({
                  focus: "first",
                  event,
                  trigger: key,
                  payload: props.payload,
                  reason: "shortcut",
                })
              }
            },
            { layer: el }
          )
        )
      }
      // Data menus run their items' shortcuts while closed.
      if (!parentMenu) {
        cleanups.push(bindItemShortcuts(store, el, api.runAction), () => {
          if (store.get().trigger === key && !store.get().open) {
            store.set({ trigger: null })
          }
          // The trigger that opened the menu left, like a row a filter hid, so nothing updates its
          // payload anymore. A task later, so a rebind an adapter queues as a microtask lands first.
          setTimeout(() => {
            if (
              store.get().trigger === key &&
              api.isOpen() &&
              api.popupElement() &&
              !api.triggerElement()
            ) {
              api.hide({ reason: "imperative" })
            }
          })
        })
      }
      return () => cleanups.forEach((cleanup) => cleanup())
    },
  }),

  // An area that opens the menu at the pointer on a right-click or a long
  // press, and at the focused element on Shift+F10 or the context menu key.
  content: slot<ContentProps, MenuContentState>({
    props: {
      side: "string",
      align: "string",
      sideOffset: "number",
      alignOffset: "number",
      collisionPadding: "number",
      arrowPadding: "number",
      container: "value",
      anchor: "string",
      finalFocus: "string",
      keepMounted: "boolean",
    },
    selects: selects({ values: [] }),
    connect: registerPopupElement,
    role: "menu",
    keys: [
      "ArrowDown",
      "ArrowUp",
      "ArrowRight",
      "ArrowLeft",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Enter",
      " ",
      "Escape",
      "Tab",
      "typeahead",
    ],
    state: (state, { api }) => ({
      open: state.open,
      nested: api.root() !== api,
      presentation: state.presentation,
      // Submenus show the payload their root menu opened with.
      payload: api.root() === api ? state.payload : api.root().getPayload(),
    }),
    present: (state, { props }) => state.mounted || !!props.keepMounted,
    attrs: (state, { id, api }) => ({
      ...popupContentAttrs(state, id),
      "aria-labelledby": namedByTrigger(state, api.root() !== api)
        ? `${id}-trigger`
        : undefined,
      "data-presentation": state.presentation,
      "data-nested": api.root() === api ? undefined : "",
    }),
    on: {
      keydown: (event, { api }) => api.internal.onKeyDown(event),
      focusin(event, { api, store }) {
        const entry = api.internal.entryOf(event.target as HTMLElement)
        if (entry && store.get().highlighted !== entry.key) {
          store.set({ highlighted: entry.key })
        }
      },
      // Moves over separators and gaps count, so coming back to the same item reads as a move.
      pointermove: (event, { api }) => api.internal.trackPointer(event),
      pointerenter(event, { api }) {
        api.parentMenu()?.internal.safeArea.stop()
        api.menubar()?.internal.enterMenu()
      },
      pointerleave(event, { api, store, el }) {
        if (event.pointerType === "touch") {
          return
        }
        const target = event.relatedTarget as Node | null
        // Moving into a submenu keeps the trigger highlighted.
        if (target && el!.contains(target)) {
          return
        }
        if (
          api.internal.children.size &&
          [...api.internal.children].some((child) => child.isOpen())
        ) {
          return
        }
        if (store.get().highlighted !== null) {
          api.internal.highlight(null)
        }
      },
    },
    bind(el, part) {
      const { api, key, props: initial } = part
      const parentMenu = api.parentMenu()
      // Read on every check, so the popup follows prop changes while open.
      const props = () => api.itemProps<ContentProps>("content", key) ?? initial
      let firstItem: number | undefined
      return api.internal.presentation.bind(el, {
        anchor: () => api.anchor(el, props().anchor),
        position: () => {
          const trigger = api.triggerElement()
          firstItem ??= parentMenu ? firstItemOffset(el) : 0
          const latest = props()
          return placementOptions(latest, {
            // Submenus and the menus of a vertical menubar open to the side.
            side:
              latest.side ??
              (parentMenu ||
              api.menubar()?.internal.orientation() === "vertical"
                ? isRTL(trigger)
                  ? "left"
                  : "right"
                : "bottom"),
            align: "start",
            sideOffset: parentMenu ? 0 : 4,
            alignOffset: -firstItem,
          })
        },
        rendered: (listener) => onProps(part, listener),
        initialFocus: api.internal.runPendingFocus,
        // In a sheet, a submenu shows in its parent's place, under its trigger.
        drillIn:
          parentMenu &&
          (() => [parentMenu.popupElement(), api.triggerElement()]),
      })
    },
  }),

  // The full-screen element a root menu presented as a sheet sits in. The
  // adapters render it around the content, which they render only while present.
  viewport: slot({
    selects: selects({ values: [] }),
    present: (state, { api }) =>
      state.presentation === "sheet" && api.root() === api,
  }),

  item: slot<ItemProps, MenuItemState>({
    props: {
      id: "id",
      value: "string",
      label: "string",
      disabled: "boolean",
      destructive: "boolean",
      shortcut: "string",
      closeOnSelect: "boolean",
      onSelect: "action",
    },
    selects: selects({
      highlighted: ({ key }) => [key],
      pending: ({ key }) => [key],
      values: [],
    }),
    role: "menuitem",
    focus: "roving",
    state: (state, { key, props }) => ({
      highlighted: state.highlighted === key,
      disabled: !!props.disabled,
      pending: state.pending.includes(key),
      error: state.error?.key === key ? state.error.reason : undefined,
    }),
    attrs: (state, { id, key, props }) => ({
      id: `${id}-item-${idPart(key)}`,
      tabindex: "-1",
      "aria-disabled":
        props.disabled || state.pending.includes(key) ? "true" : undefined,
      "aria-busy": state.pending.includes(key) ? "true" : undefined,
      "data-disabled": props.disabled ? "" : undefined,
      "data-pending": state.pending.includes(key) ? "" : undefined,
      "data-destructive": props.destructive ? "" : undefined,
      "aria-keyshortcuts": props.shortcut
        ? ariaKeyshortcuts(props.shortcut, state.apple)
        : undefined,
    }),
    on: {
      pointermove: (event, { api, el }) => api.internal.hoverItem(el!, event),
    },
    press: ({ api, key, props }, event) => activateItem(api, key, props, event),
    bind(el, { api, key, props, id }) {
      if (dev && !props.label && !labelOf(el).trim()) {
        warn("An item has no text. Pass a label so typeahead can find it.", {
          component: "menu",
          id,
        })
      }
      const current = () => api.itemProps<ItemProps>("item", key) ?? props
      const cleanups = [
        on(el, "click", (event) => linkClick(api, key, current, el, event)),
        api.internal.register(el, {
          key,
          kind: "item",
          label: () => current().label ?? labelOf(el),
          disabled: () => el.getAttribute("aria-disabled") === "true",
          activate: (event) => activateItem(api, key, current(), event),
        }),
      ]
      return () => cleanups.forEach((cleanup) => cleanup())
    },
  }),

  group: slot({
    props: { id: "id" },
    selects: selects({ values: [] }),
    role: "group",
    attrs: (state, { id, key }) => ({
      "aria-labelledby": menuGroupLabelledBy(state, id, key),
    }),
  }),

  // `group` is the id of the group or the name of the radio group it labels.
  "group-label": slot<{ group: string }>({
    // Internal: passed by renderers, the group's `id` or the radio group's `name`.
    props: { group: "string" },
    selects: selects({ values: [] }),
    attrs: (state, { id, props }) => ({
      id: `${id}-label-${idPart(props.group ?? "")}`,
    }),
    bind: (el, { store, props }) =>
      keyWhileBound(store, "groupLabels", props.group),
  }),

  separator: slot({
    selects: selects({ values: [] }),
    role: "separator",
    attrs: () => ({ "aria-orientation": "horizontal" }),
  }),

  shortcut: slot({
    selects: selects({ values: [] }),
    attrs: () => ({ "aria-hidden": "true", translate: "no" }),
  }),
})

// Parts a menu ships only once a page renders them. Each part registers its
// feature with `use` before it reads a slot. In functions, since bundlers keep
// the arguments of a pure call that isn't one.
const menuSlot: SlotFactory<MenuState, MenuApi> = (definition) => definition

/**
 * An area that opens the menu at the pointer on right-click or a long press,
 * or at itself with Shift+F10.
 */
const menuContextTrigger = /* @__PURE__ */ (() => ({
  slots: {
    "context-trigger": menuSlot<ContextTriggerProps, MenuContextTriggerState>({
      props: { id: "id", disabled: "boolean", payload: "value" },
      selects: selects({ values: [] }),
      state: (state, { key, props }) => ({
        open: state.open && state.trigger === key,
        disabled: !!props.disabled,
      }),
      attrs: (state, { key, props }) => ({
        ...openAttrs(state.open && state.trigger === key),
        "data-disabled": props.disabled ? "" : undefined,
      }),
      on: {
        contextmenu(event, { api, key, props }) {
          if (props.disabled) {
            return
          }
          event.preventDefault()
          const pointer = (event as PointerEvent).pointerType
          // Shift+F10 and the context menu key fire this with no pointer. A
          // Control-click on macOS fires it with the main button.
          const keyboard =
            event.button !== 2 &&
            !(event as MouseEvent).ctrlKey &&
            pointer !== "touch" &&
            pointer !== "pen"
          const target = event.target as HTMLElement
          api.internal.contextOpen(
            keyboard ? target : { x: event.clientX, y: event.clientY },
            {
              event,
              by: keyboard
                ? "keyboard"
                : pointer === "touch"
                  ? "touch"
                  : "pointer",
              key,
              payload: props.payload,
            }
          )
        },
      },
      // iOS fires no context menu event, so a long press opens it.
      bind(el, part) {
        const { api, store, key } = part
        adoptPlatform(store)
        if (store.get().trigger === null) {
          store.set({ trigger: key })
        }
        return bindHold(el, {
          keys: [],
          disabled: () => !!part.props.disabled,
          onPress: ({ input }) => input === "touch",
          onHold: ({ event }) => {
            const { clientX: x, clientY: y } = event as PointerEvent
            api.internal.contextOpen(
              { x, y },
              { event, by: "touch", key, payload: part.props.payload }
            )
          },
        })
      },
    }),
  },
}))()

/** Checkbox and radio items, their radio groups and the check or dot inside them. */
const menuCheckable = /* @__PURE__ */ (() => ({
  slots: {
    "checkbox-item": menuSlot<CheckboxProps, MenuCheckboxItemState>({
      props: {
        value: "string",
        label: "string",
        disabled: "boolean",
        checked: "boolean",
        defaultChecked: "boolean",
        onCheckedChange: "callback",
        closeOnSelect: "boolean",
      },
      selects: selects({
        highlighted: ({ key }) => [key],
        values: ({ props }) => [props.value],
      }),
      role: "menuitemcheckbox",
      focus: "roving",
      state: (state, { key, props, api }) => ({
        highlighted: state.highlighted === key,
        disabled: !!props.disabled,
        checked: api.checkboxValue(props),
      }),
      attrs: (state, { id, key, props, api }) => {
        const checked = api.checkboxValue(props)
        return {
          id: `${id}-item-${idPart(key)}`,
          tabindex: "-1",
          "aria-checked": String(checked),
          "aria-disabled": props.disabled ? "true" : undefined,
          "data-disabled": props.disabled ? "" : undefined,
          ...checkedAttrs(checked),
        }
      },
      on: {
        pointermove: (event, { api, el }) => api.internal.hoverItem(el!, event),
      },
      press: ({ api, props }, event) => toggleCheckbox(api, props, event),
      bind(el, { api, key, props }) {
        return api.internal.register(el, {
          key,
          kind: "checkbox",
          label: () =>
            (api.itemProps<CheckboxProps>("checkbox-item", key) ?? props)
              .label ?? labelOf(el),
          disabled: () => el.getAttribute("aria-disabled") === "true",
          activate: (event) =>
            toggleCheckbox(
              api,
              api.itemProps<CheckboxProps>("checkbox-item", key) ?? props,
              event
            ),
        })
      },
    }),

    "radio-group": menuSlot<RadioGroupProps, MenuRadioGroupState>({
      props: {
        name: "id",
        value: "string",
        defaultValue: "string",
        onValueChange: "callback",
      },
      selects: selects({ values: ({ props }) => [`radio:${props.name}`] }),
      role: "group",
      state: (state, { props, api }) => ({ value: api.radioValue(props.name) }),
      attrs: (state, { id, props }) => ({
        "aria-labelledby": menuGroupLabelledBy(state, id, props.name),
      }),
    }),

    "radio-item": menuSlot<RadioProps, MenuRadioItemState>({
      props: {
        // The radio group's `name`. Renderers fill it from the group around the item.
        group: { kind: "string", from: "radio-group.name" },
        value: "string",
        label: "string",
        disabled: "boolean",
        closeOnSelect: "boolean",
      },
      // Registered under its group too, since radio groups may share values.
      selects: selects({
        highlighted: ({ key, props }) => [`${props.group}:${key}`],
        values: ({ props }) => [`radio:${props.group}`],
      }),
      role: "menuitemradio",
      focus: "roving",
      state: (state, { key, props, api }) => ({
        highlighted: state.highlighted === `${props.group}:${key}`,
        disabled: !!props.disabled,
        checked: api.radioValue(props.group!) === props.value,
      }),
      attrs: (state, { id, key, props, api }) => {
        const checked = api.radioValue(props.group!) === props.value
        return {
          id: `${id}-item-${idPart(props.group ?? "")}-${idPart(key)}`,
          tabindex: "-1",
          "aria-checked": String(checked),
          "aria-disabled": props.disabled ? "true" : undefined,
          "data-disabled": props.disabled ? "" : undefined,
          ...checkedAttrs(checked),
        }
      },
      on: {
        pointermove: (event, { api, el }) => api.internal.hoverItem(el!, event),
      },
      press: ({ api, props }, event) => selectRadio(api, props, event),
      bind(el, { api, key, props }) {
        return api.internal.register(el, {
          key: `${props.group}:${key}`,
          kind: "radio",
          label: () =>
            (api.itemProps<RadioProps>("radio-item", key) ?? props).label ??
            labelOf(el),
          disabled: () => el.getAttribute("aria-disabled") === "true",
          activate: (event) =>
            selectRadio(
              api,
              api.itemProps<RadioProps>("radio-item", key) ?? props,
              event
            ),
        })
      },
    }),

    // The check or dot inside a checkbox or radio item.
    "item-indicator": menuSlot<IndicatorProps, MenuItemIndicatorState>({
      props: {
        id: "id",
        // Internal: passed by renderers, from the checkbox or radio item it's in.
        item: "string",
        itemKey: "string",
        group: "string",
        keepMounted: "boolean",
      },
      selects: selects({
        values: ({ props, api }) => [indicatorEntry(api, props)],
      }),
      present: (state, { props, api }) =>
        !!props.keepMounted || indicatorState(api, props).checked,
      state: (state, { props, api }) => indicatorState(api, props),
      attrs: (state, { props, api }) => {
        const { checked, disabled } = indicatorState(api, props)
        return {
          "aria-hidden": "true",
          ...checkedAttrs(checked),
          "data-disabled": disabled ? "" : undefined,
        }
      },
      // Animates in when its item becomes checked.
      bind: (el, { api, props }) =>
        indicatorState(api, props).checked ? animateIn(el) : undefined,
    }),
  },
}))()

/**
 * The `item-icon` slot: an icon inside any item or submenu trigger. A feature,
 * so a menu that never renders one ships none of its code.
 */
const menuItemIcons = /* @__PURE__ */ (() => ({
  slots: {
    // An icon inside any item or submenu trigger, or a menubar's trigger.
    "item-icon": menuSlot<ItemIconProps & { item?: string }, ItemIconState>({
      ...itemIconPart<MenuState, MenuApi>({
        component: "menu",
        item: itemSelector,
        list: '[role="menu"], [role="menubar"]',
      }),
      selects: selects({ values: [] }),
    }),
  },
}))()

// The entry of `values` an indicator's item reads: a checkbox item's value,
// or its radio group's.
function indicatorEntry(api: MenuApi, props: IndicatorProps) {
  if (props.item === "checkbox-item") {
    return props.itemKey
  }
  const item = api.itemProps(props.item, props.itemKey) as
    RadioProps | undefined
  return `radio:${props.group ?? item?.group}`
}

// Whether an indicator's item is checked, from the item's latest props.
function indicatorState(api: MenuApi, props: IndicatorProps) {
  const item = api.itemProps(props.item, props.itemKey) as
    (CheckboxProps & RadioProps) | undefined
  if (!item) {
    return { checked: false, disabled: false }
  }
  const checked =
    props.item === "checkbox-item"
      ? api.checkboxValue(item)
      : api.radioValue((props.group ?? item.group)!) === item.value
  return { checked, disabled: !!item.disabled }
}

// Distance from the popup's top edge to its content, so a submenu's first item
// lines up with the item that opened it.
function firstItemOffset(el: HTMLElement) {
  const style = getComputedStyle(el)
  return (
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.borderTopWidth) || 0)
  )
}

// Clicks an item already took, so its link listener leaves them alone.
const taken = new WeakSet<Event>()

function activateItem(
  api: MenuApi,
  key: string,
  props: ItemProps,
  event?: Event,
  selection = event ?? selectEvent()
) {
  if (props.disabled || api.isPending(key)) {
    return
  }
  if (event) {
    taken.add(event)
  }
  api.clearError(key)
  const results: unknown[] = [props.onSelect?.(selection)]
  // Keeps the menu open, whether the item was clicked, pressed or chosen with a key.
  const prevented = selection.defaultPrevented
  if (!prevented && props.value !== undefined) {
    results.push(api.root().runAction(props.value, event))
  }
  const closes = !prevented && props.closeOnSelect !== false
  const pending = results.filter(isPromise)
  if (pending.length) {
    api.wait(
      key,
      Promise.all(pending),
      () => closes && api.action(undefined, event)
    )
  } else if (closes) {
    api.action(undefined, event)
  }
}

// A router can call `preventDefault()` on a link's click before the item's
// handler, which then skips it. Once the click has reached the window, after
// React's handlers too, this still selects; `onSelect` gets its own event.
function linkClick(
  api: MenuApi,
  key: string,
  props: () => ItemProps,
  el: HTMLElement,
  event: Event
) {
  if (!el.matches("a[href]") || opensElsewhere(event, el)) {
    return
  }
  const done = (last: Event) => {
    if (last === event && event.defaultPrevented && !taken.has(event)) {
      activateItem(api, key, props(), event, selectEvent())
    }
  }
  el.ownerDocument.defaultView?.addEventListener("click", done, { once: true })
}

function toggleCheckbox(api: MenuApi, props: CheckboxProps, event?: Event) {
  if (props.disabled) {
    return
  }
  if (api.setCheckbox(props, event) && props.closeOnSelect) {
    api.action(undefined, event)
  }
}

function selectRadio(api: MenuApi, props: RadioProps, event?: Event) {
  if (props.disabled) {
    return
  }
  // Choosing the selected item changes nothing, but still closes a menu that closes on select.
  // Renderers fill `group` from the radio group around the item.
  const group = props.group!
  const chosen =
    api.radioValue(group) === props.value ||
    api.setRadio(group, props.value, event)
  if (chosen && props.closeOnSelect) {
    api.action(undefined, event)
  }
}

export { menuCheckable, menuContextTrigger, menuItemIcons, menuSlots }
