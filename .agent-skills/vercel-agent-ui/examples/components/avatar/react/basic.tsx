import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar"

const person = {
  name: "shadcn",
  src: "https://github.com/shadcn.png",
}

export function Example() {
  return (
    <div data-slot="row">
      <Avatar>
        <AvatarImage src={person.src} alt={person.name} />
        <AvatarFallback>
          <span aria-hidden="true">CN</span>
          <span data-slot="visually-hidden">shadcn</span>
        </AvatarFallback>
      </Avatar>
    </div>
  )
}
