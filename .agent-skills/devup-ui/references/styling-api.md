# Styling API

Devup UI gives you two equivalent surfaces, both compiled away at build time:
prop-based styling on `Box` / `css`, and the styled-components-compatible `styled()`
factory. Every value is statically analyzed; dynamic values become CSS variables.

## Prop-based styling

```tsx
import { Box } from '@devup-ui/react'

<Box
  bg="white"          // background-color
  color="text"        // theme token
  p={4}               // padding: 16px  (numeric * 4px spacing scale)
  px={6}              // padding-inline: 24px
  borderRadius="8px"
  _hover={{ bg: 'gray.100' }}   // pseudo selector
/>
```

### Spacing scale

Numeric shorthand props (`p`, `m`, `px`, `py`, `gap`, …) multiply by `4px`:
`p={4}` → `16px`. Use a string for raw values: `p="13px"`.

### Responsive arrays

Array values map to breakpoints, smallest first:

```tsx
<Box
  fontSize={[14, 16, 20]}        // base / md / lg
  flexDirection={['column', 'row']}
/>
```

### Pseudo selectors

`_hover`, `_focus`, `_active`, `_disabled`, `_first`, `_last`, `_dark`, etc. take a
nested style object. They can be combined with responsive arrays inside the nested
object.

```tsx
<Box
  bg="white"
  _hover={{ bg: 'gray.100', transform: 'translateY(-2px)' }}
/>
```

## `styled()` API (styled-components / Emotion compatible)

```tsx
import { styled } from '@devup-ui/react'

const Card = styled('div', {
  bg: 'white',
  p: 4,
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  _hover: { boxShadow: '0 10px 15px rgba(0,0,0,0.1)' },
})

const Button = styled('button', {
  px: 4,   // 16px
  py: 2,   // 8px
  borderRadius: '4px',
  cursor: 'pointer',
})

// Usage
<Card>Content</Card>
<Button>Click me</Button>
```

## Dynamic values become CSS variables

A value the compiler cannot freeze (e.g. a runtime variable) is emitted as a CSS
custom property, so there is still no runtime style recomputation:

```tsx
// You write
<Box bg={dynamicColor} />
// Compiles to a class using var(--…), with the variable set inline
```

## How it compiles (mental model)

- Static styles → atomic classes with base-37 names (`a`, `b`, … `aa`, `ab`)
- Dynamic styles → `var(--x)` custom properties
- Responsive arrays → one class per breakpoint
- No styled-engine ships to the client; the CSS is a flat stylesheet

Keep styles statically analyzable where possible — inline literals and theme tokens
extract best; threading values through deep runtime indirection forces CSS variables.
