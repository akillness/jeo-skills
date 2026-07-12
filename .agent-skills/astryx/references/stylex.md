# StyleX Integration with Astryx

## What is StyleX?

[StyleX](https://stylexjs.com) is a zero-runtime CSS-in-JS library built by Meta
for styling React components with zero bundle cost. Astryx uses StyleX internally
to provide scoped, performant styles.

## StyleX Features

- **Zero runtime overhead** — all CSS is extracted at build time
- **Type-safe** — CSS properties are typed in TypeScript
- **Scoped by default** — no class name collisions or specificity wars
- **CSS variables support** — integrates with Astryx theming
- **No build plugin required in Astryx** — styles ship pre-compiled

## Using StyleX in Astryx Components

### Basic StyleX usage

```typescript
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 200ms ease-in-out',
  },
  buttonPrimary: {
    backgroundColor: '#6741d9',
    color: '#ffffff',
  },
  buttonHover: {
    ':hover': {
      backgroundColor: '#5b3ec9',
    },
  },
})

export function Button({ variant = 'primary' }) {
  return (
    <button
      {...stylex.props(
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        styles.buttonHover
      )}
    >
      Click me
    </button>
  )
}
```

### Dynamic StyleX with CSS variables

```typescript
import * as stylex from '@stylexjs/stylex'
import { useTheme } from '@astryxdesign/core'

const styles = stylex.create({
  button: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-text)',
    padding: '8px 16px',
  },
})

export function ThemedButton() {
  const theme = useTheme()
  
  return (
    <button {...stylex.props(styles.button)}>
      Themed Button
    </button>
  )
}
```

### Responsive styles

```typescript
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 768px)': '1fr 1fr',
      '@media (min-width: 1024px)': '1fr 1fr 1fr 1fr',
    },
    gap: '16px',
  },
})
```

## Astryx + StyleX Best Practices

1. **Prefer Astryx components over raw StyleX** — Astryx components are already
   styled and accessible

2. **Use CSS variables for theming** — StyleX's CSS variable support integrates
   perfectly with Astryx themes

3. **Create style constants at module level** — `stylex.create()` should be at the
   top level, not inside components

4. **Combine Astryx and custom StyleX** — mix Astryx components with your own
   StyleX styles:

   ```typescript
   import { Button } from '@astryxdesign/core'
   import * as stylex from '@stylexjs/stylex'

   const customStyles = stylex.create({
     wrapper: {
       padding: '20px',
       backgroundColor: '#f5f5f5',
     },
   })

   export function MyButton() {
     return (
       <div {...stylex.props(customStyles.wrapper)}>
         <Button>Click me</Button>
       </div>
     )
   }
   ```

5. **Avoid mixing with other CSS-in-JS** — don't combine StyleX with emotion,
   styled-components, or Tailwind classes in the same component

## Swizzling and StyleX

When you swizzle a component, its StyleX styles are included:

```bash
astryx swizzle Button
```

The ejected `Button.tsx` will include its original StyleX definitions. You can now:

1. Modify the StyleX `create()` object
2. Change color tokens
3. Add responsive variants
4. Adjust spacing and sizing

Your customizations override the library version entirely.

## Theme CSS Variables in StyleX

Astryx exports CSS variables that StyleX can consume:

```typescript
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  card: {
    backgroundColor: 'var(--astryx-background-primary)',
    borderColor: 'var(--astryx-border-primary)',
    color: 'var(--astryx-text-primary)',
    padding: 'var(--astryx-spacing-md)',
  },
})
```

Available variables:
- `--astryx-color-primary`
- `--astryx-color-secondary`
- `--astryx-background-primary`
- `--astryx-text-primary`
- `--astryx-border-primary`
- `--astryx-spacing-xs`, `sm`, `md`, `lg`, `xl`

## Performance Considerations

- **Zero runtime cost** — StyleX extracts all CSS at build time
- **Automatic critical CSS** — used styles are inlined in HTML
- **Lazy loading** — unused styles are split into separate chunks
- **No class name clashes** — scoped styling prevents cascading issues

No performance trade-off between Astryx + StyleX and vanilla CSS.
