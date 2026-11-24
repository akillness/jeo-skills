import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer"

const sides = [
  {
    side: "top",
    label: "Top",
    title: "Notifications",
    description: "You're all caught up.",
  },
  {
    side: "right",
    label: "Right",
    title: "Cart",
    description: "2 items, $84.00.",
  },
  {
    side: "bottom",
    label: "Bottom",
    title: "Share",
    description: "Send this page to your team.",
  },
  {
    side: "left",
    label: "Left",
    title: "Menu",
    description: "Jump to a section of the docs.",
  },
] as const

function Example() {
  return (
    <div data-slot="row">
      {sides.map(({ side, label, title, description }) => (
        <Drawer
          key={side}
          side={side}
          preventEdgeSwipe={side === "left" || side === "right"}
        >
          <DrawerTrigger>{label}</DrawerTrigger>
          <DrawerBackdrop />
          <DrawerContent>
            <div data-slot="stack">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
            <DrawerClose data-variant="solid">Close</DrawerClose>
          </DrawerContent>
        </Drawer>
      ))}
    </div>
  )
}

export { Example }
