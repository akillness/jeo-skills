<script lang="ts">
  import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/svelte/avatar"

  const person = {
    name: "shadcn",
    src: "https://github.com/shadcn.png",
  }
</script>

<div data-slot="row">
  <Avatar>
    <AvatarImage src={person.src} alt={person.name} />
    <AvatarFallback
      ><span aria-hidden="true">CN</span><span data-slot="visually-hidden"
        >shadcn</span
      ></AvatarFallback
    >
  </Avatar>
</div>
