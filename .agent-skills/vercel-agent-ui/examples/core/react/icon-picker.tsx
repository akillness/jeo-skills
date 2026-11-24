import * as React from "react"
import {
  announce,
  createChange,
  createPopup,
  createRovingFocus,
  definePrimitive,
  popupContent,
  popupState,
  popupTrigger,
  selects,
  spatialMove,
  type ChangeDetails,
} from "@ui-sdk/core"
import {
  popoverPreset,
  type PopoverOpenChangeReason,
} from "@ui-sdk/core/popover"
import { fuzzyScore } from "@ui-sdk/core/text-match"
import { createParts } from "@ui-sdk/react/primitive"
import {
  BellIcon,
  BookIcon,
  BugIcon,
  CakeIcon,
  CalendarIcon,
  CameraIcon,
  CloudIcon,
  CodeIcon,
  CoffeeIcon,
  FlagIcon,
  FlameIcon,
  FlaskConicalIcon,
  FolderIcon,
  GiftIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  LeafIcon,
  LightbulbIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  MoonIcon,
  MountainIcon,
  MusicIcon,
  PaletteIcon,
  PencilIcon,
  PizzaIcon,
  PlaneIcon,
  RocketIcon,
  SparklesIcon,
  StarIcon,
  SunIcon,
  TargetIcon,
  TerminalIcon,
  TrophyIcon,
  WavesIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

type IconPickerPickReason = "item-press" | "search-enter"

type IconPickerOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<PopoverOpenChangeReason | "item-press">
  ) => void
  value?: string
  defaultValue?: string
  onValueChange?: (
    value: string,
    details: ChangeDetails<IconPickerPickReason>
  ) => void
}

type IconPickerState = ReturnType<typeof popupState> & {
  value: string | null
  query: string
  stop: string | null
  focused: string | null
  hovered: string | null
  highlighted: string | null
}

type IconProps = { value: string }

const iconPicker = definePrimitive({
  name: "icon-picker",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
  },
  state: (options: IconPickerOptions): IconPickerState => ({
    ...popupState(options),
    value: options.value ?? options.defaultValue ?? null,
    query: "",
    stop: null,
    focused: null,
    hovered: null,
    highlighted: null,
  }),
  sync: (options) => ({
    ...(options.open === undefined ? {} : { open: options.open }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: (context) => {
    const { store } = context
    const popup = createPopup(context, { preset: popoverPreset })
    const change = createChange(context)
    let searched = false
    const highlightBest = () =>
      store.set({
        highlighted: store.get().query.trim()
          ? (roving.items()[0]?.key ?? null)
          : null,
      })
    const roving = createRovingFocus<IconPickerState, IconProps>(context, {
      slot: "icon",
      key: "stop",
      move: spatialMove(),
      onItemsChange: () => {
        if (!searched) {
          return
        }
        const items = roving.items()
        highlightBest()
        announce(
          items.length === 0
            ? "No icons found"
            : items.length === 1
              ? "1 icon"
              : `${items.length} icons`
        )
      },
    })

    let wasOpen = store.get().open
    store.subscribe(() => {
      const { open, value } = store.get()
      if (open === wasOpen) {
        return
      }
      wasOpen = open
      if (!open) {
        return
      }
      searched = false
      store.set({ query: "", stop: value, hovered: null, highlighted: null })
    })

    const api = {
      ...popup,
      roving,
      setHovered: (icon: string | null) => store.set({ hovered: icon }),
      setFocused: (icon: string | null) => store.set({ focused: icon }),
      search(query: string) {
        searched = true
        store.set({ query })
        requestAnimationFrame(highlightBest)
      },
      pick(icon: string, reason: IconPickerPickReason, event?: Event) {
        change("value", icon, { reason, event })
        popup.close({ reason: "item-press", event })
      },
      searchKeydown(event: KeyboardEvent) {
        const first = roving.items()[0]
        if (event.key === "ArrowDown" && first) {
          event.preventDefault()
          roving.focus(first.key)
        } else if (event.key === "Enter" && first && store.get().query.trim()) {
          event.preventDefault()
          api.pick(first.key, "search-enter", event)
        }
      },
      iconKeydown(event: KeyboardEvent, el: HTMLElement) {
        const search = context.element("search") as HTMLInputElement | null
        const typing =
          event.key.length === 1 &&
          event.key !== " " &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "a"
        ) {
          event.preventDefault()
          search?.focus()
          search?.select()
        } else if (typing) {
          search?.focus()
        } else {
          roving.keydown(event, el)
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    trigger: popupTrigger(slot),
    content: popupContent(slot),
    search: slot({
      attrs: (state) => ({
        type: "search",
        value: state.query,
        autocomplete: "off",
      }),
      on: {
        input: (event, { api }) =>
          api.search((event.target as HTMLInputElement).value),
        keydown: (event, { api }) => api.searchKeydown(event),
      },
    }),
    grid: slot<{}, { query: string }>({
      attrs: () => ({ role: "group" }),
      state: (state) => ({ query: state.query }),
      on: { pointerleave: (_event, { api }) => api.setHovered(null) },
    }),
    icon: slot<IconProps>({
      props: { value: "string" },
      selects: selects({ stop: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        type: "button",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-pressed": String(state.value === part.key),
        "data-highlighted":
          state.focused === null && state.highlighted === part.key
            ? ""
            : undefined,
      }),
      press: ({ api, key }, event) => api.pick(key, "item-press", event),
      on: {
        keydown: (event, { el, api }) => api.iconKeydown(event, el!),
        pointerenter: (_event, { api, key }) => api.setHovered(key),
        focus: (_event, { api, key }) => api.setFocused(key),
        blur: (_event, { api }) => api.setFocused(null),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    preview: slot<{}, { active: string | null }>({
      state: (state) => ({
        active:
          state.hovered ?? state.focused ?? state.highlighted ?? state.value,
      }),
    }),
  }),
})

const parts = createParts(iconPicker, {
  trigger: "button",
  content: "div",
  search: "input",
  grid: "div",
  icon: "button",
  preview: "div",
})

const IconPicker = parts.Root

const IconPickerTrigger = parts.Trigger

const IconPickerContent = parts.Content

const IconPickerSearch = parts.Search

const IconPickerGrid = parts.Grid

const IconPickerIcon = parts.Icon

const IconPickerPreview = parts.Preview

type Entry = { name: string; icon: LucideIcon; keywords: string }

const icons: Entry[] = [
  { name: "Rocket", icon: RocketIcon, keywords: "launch ship fast" },
  { name: "Star", icon: StarIcon, keywords: "favorite rating" },
  { name: "Heart", icon: HeartIcon, keywords: "love like" },
  { name: "Flag", icon: FlagIcon, keywords: "goal milestone report" },
  { name: "Zap", icon: ZapIcon, keywords: "lightning fast energy" },
  { name: "Flame", icon: FlameIcon, keywords: "fire hot trending" },
  { name: "Sparkles", icon: SparklesIcon, keywords: "magic new shiny" },
  { name: "Sun", icon: SunIcon, keywords: "day light weather" },
  { name: "Moon", icon: MoonIcon, keywords: "night dark sleep" },
  { name: "Cloud", icon: CloudIcon, keywords: "weather sky upload" },
  { name: "Leaf", icon: LeafIcon, keywords: "nature plant green" },
  { name: "Mountain", icon: MountainIcon, keywords: "hike peak outdoors" },
  { name: "Waves", icon: WavesIcon, keywords: "ocean sea water beach" },
  { name: "Coffee", icon: CoffeeIcon, keywords: "cafe drink morning break" },
  { name: "Pizza", icon: PizzaIcon, keywords: "food lunch" },
  { name: "Cake", icon: CakeIcon, keywords: "birthday party celebrate" },
  { name: "Gift", icon: GiftIcon, keywords: "present birthday" },
  { name: "Music", icon: MusicIcon, keywords: "song audio playlist" },
  { name: "Camera", icon: CameraIcon, keywords: "photo picture" },
  { name: "Book", icon: BookIcon, keywords: "read docs library" },
  { name: "Pencil", icon: PencilIcon, keywords: "edit write draft" },
  { name: "Palette", icon: PaletteIcon, keywords: "design color paint" },
  { name: "Code", icon: CodeIcon, keywords: "developer programming" },
  { name: "Terminal", icon: TerminalIcon, keywords: "console command shell" },
  { name: "Bug", icon: BugIcon, keywords: "issue error insect" },
  {
    name: "Flask",
    icon: FlaskConicalIcon,
    keywords: "experiment lab science test",
  },
  { name: "Lightbulb", icon: LightbulbIcon, keywords: "idea tip" },
  { name: "Wrench", icon: WrenchIcon, keywords: "settings tools fix" },
  { name: "Folder", icon: FolderIcon, keywords: "files directory project" },
  { name: "Mail", icon: MailIcon, keywords: "email letter" },
  { name: "Message", icon: MessageCircleIcon, keywords: "chat comment bubble" },
  { name: "Bell", icon: BellIcon, keywords: "notification alert" },
  { name: "Calendar", icon: CalendarIcon, keywords: "date schedule event" },
  { name: "Globe", icon: GlobeIcon, keywords: "world web internet" },
  { name: "Pin", icon: MapPinIcon, keywords: "location place map" },
  { name: "Plane", icon: PlaneIcon, keywords: "travel flight trip" },
  { name: "House", icon: HouseIcon, keywords: "home" },
  { name: "Trophy", icon: TrophyIcon, keywords: "win award prize" },
  { name: "Target", icon: TargetIcon, keywords: "goal aim focus" },
  { name: "Lock", icon: LockIcon, keywords: "secure private password" },
]

const byName = new Map(icons.map((entry) => [entry.name, entry]))

function search(query: string) {
  if (!query.trim()) {
    return icons
  }
  return icons
    .map((entry) => ({
      entry,
      score: Math.max(
        fuzzyScore(entry.name, query),
        fuzzyScore(entry.keywords, query) * 0.9
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

function Example() {
  const [value, setValue] = React.useState<string | null>(null)
  const Picked = value ? byName.get(value)!.icon : null
  return (
    <IconPicker
      value={value ?? undefined}
      onValueChange={(next: string) => setValue(next)}
    >
      <IconPickerTrigger>
        {Picked ? (
          <>
            <Picked />
            {value}
          </>
        ) : (
          "Pick an Icon"
        )}
      </IconPickerTrigger>
      <IconPickerContent sideOffset={6} aria-label="Choose an icon">
        <IconPickerSearch
          aria-label="Search icons"
          placeholder="Search icons…"
        />
        <IconPickerGrid aria-label="Icons">
          {({ query }) => {
            const results = search(query)
            if (results.length === 0) {
              return <p data-slot="hint">No icons found.</p>
            }
            return results.map(({ name, icon: Icon }) => (
              <IconPickerIcon key={name} value={name} aria-label={name}>
                <Icon />
              </IconPickerIcon>
            ))
          }}
        </IconPickerGrid>
        <IconPickerPreview>
          {({ active }) => {
            const entry = active ? byName.get(active) : undefined
            if (!entry) {
              return "Pick an icon"
            }
            const Icon = entry.icon
            return (
              <>
                <Icon />
                <span>{entry.name}</span>
              </>
            )
          }}
        </IconPickerPreview>
      </IconPickerContent>
    </IconPicker>
  )
}

export {
  Example,
  iconPicker,
  IconPicker,
  IconPickerContent,
  IconPickerGrid,
  IconPickerIcon,
  type IconPickerOptions,
  IconPickerPreview,
  IconPickerSearch,
  type IconPickerState,
  IconPickerTrigger,
  type IconProps,
}
