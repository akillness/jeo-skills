"use client"

import {
  HoverCard,
  HoverCardArrow,
  HoverCardContent,
  HoverCardTrigger,
} from "@ui-sdk/react/hover-card"

function Example() {
  return (
    <div dir="rtl">
      <HoverCard>
        <HoverCardTrigger href="https://example.com/people/hollis">
          هوليس غرانت
        </HoverCardTrigger>
        <HoverCardContent align="start" sideOffset={10}>
          <HoverCardArrow />
          <p>هوليس غرانت</p>
          <p>مهندس تصميم في فريق المدفوعات.</p>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}

export { Example }
