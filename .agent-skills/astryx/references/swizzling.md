# Component Swizzling Guide

## What is Swizzling?

Swizzling is the process of **ejecting a component's full source code** into your
project so you can customize it without forking the library. Your custom version
overrides the library component entirely, and your customizations survive library
upgrades.

## When to Swizzle

✅ **Swizzle when:**
- You need deep customization that props can't provide
- Component behavior needs to change fundamentally
- Design requirements diverge significantly from the library default
- You need component internals to support a specific use case

❌ **Don't swizzle when:**
- Props can solve your problem (prefer props first)
- You only need visual tweaks (use theme customization)
- You need styling changes (use CSS overrides or component composition)
- You want to avoid maintenance burden

## How to Swizzle

### Step 1: Swizzle the component

```bash
astryx swizzle Button

# Or with options
astryx swizzle Button --path src/components/Button
astryx swizzle Button --force  # Overwrite if already swizzled
```

The component's full source is now in `src/components/Button/index.tsx`.

### Step 2: Customize

Edit the ejected component:

```typescript
// src/components/Button/index.tsx
import * as React from 'react'
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    // Your customizations here
  },
})

export interface CustomButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  CustomButtonProps
>(function CustomButton({ variant = 'primary', size = 'md', ...props }, ref) {
  return (
    <button
      ref={ref}
      {...stylex.props(styles.button)}
      {...props}
    />
  )
})

Button.displayName = 'CustomButton'
```

### Step 3: Import from your local version

Once swizzled, all imports of that component automatically use your local version:

```typescript
// This now imports src/components/Button, not @astryxdesign/core
import { Button } from '@astryxdesign/core'
```

You can configure your build tool to resolve local overrides:

**Next.js `next.config.js`:**
```javascript
module.exports = {
  webpack: (config, options) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@astryxdesign/core/Button': path.resolve(__dirname, 'src/components/Button'),
    }
    return config
  },
}
```

**Vite `vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@astryxdesign/core/Button': '/src/components/Button',
    },
  },
})
```

## Common Swizzle Patterns

### Pattern 1: Modify component behavior

```typescript
// Swizzled Button with custom click handler
export const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(function CustomButton({ onClick, ...props }, ref) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('Button clicked!')
    onClick?.(e)
  }

  return <button ref={ref} onClick={handleClick} {...props} />
})
```

### Pattern 2: Add new props

```typescript
interface ExtendedButtonProps extends ButtonProps {
  // New custom prop
  loading?: boolean
  loadingText?: string
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  ExtendedButtonProps
>(function CustomButton(
  { loading, loadingText = 'Loading...', children, ...props },
  ref
) {
  return (
    <button ref={ref} disabled={loading || props.disabled} {...props}>
      {loading ? loadingText : children}
    </button>
  )
})
```

### Pattern 3: Change styling

```typescript
const styles = stylex.create({
  button: {
    // Override the default button styles
    padding: '12px 24px',  // Larger padding
    borderRadius: '8px',   // More rounded
    fontSize: '16px',      // Bigger text
    fontWeight: 'bold',
    transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  primary: {
    backgroundColor: '#ff6b6b',  // Brand red instead of default
    color: '#ffffff',
  },
})
```

### Pattern 4: Add new variants

```typescript
interface ExtendedButtonProps extends ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

const styles = stylex.create({
  button: {
    // ...base styles
  },
  danger: {
    backgroundColor: '#ff6b6b',
    color: '#ffffff',
    ':hover': {
      backgroundColor: '#ff5252',
    },
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#6741d9',
    border: '1px solid #6741d9',
  },
})

export const Button = React.forwardRef<HTMLButtonElement, ExtendedButtonProps>(
  function CustomButton({ variant = 'primary', ...props }, ref) {
    return (
      <button
        ref={ref}
        {...stylex.props(
          styles.button,
          variant === 'danger' && styles.danger,
          variant === 'ghost' && styles.ghost
        )}
        {...props}
      />
    )
  }
)
```

## Managing Swizzled Components

### List all swizzled components

```bash
astryx swizzle --list
# or
find src/components -name 'index.tsx' | head -20
```

### Track upstream changes

After swizzling, check the [GitHub releases](https://github.com/facebook/astryx/releases)
for updates to components you've customized:

```bash
# See what changed in the upstream component
git log --oneline @astryxdesign/core -- Button
```

### Backport critical fixes

If the upstream component gets an important security fix or bug fix, review it:

1. Read the changelog entry
2. Decide if the fix applies to your customization
3. Merge relevant changes into your local copy
4. Test thoroughly

## Maintenance Best Practices

1. **Document customizations** — add comments explaining why you swizzled

   ```typescript
   // SWIZZLE: Custom loading state for async form submissions
   // See: https://github.com/facebook/astryx/issues/1234
   export const Button = React.forwardRef<HTMLButtonElement, ExtendedButtonProps>(
     function CustomButton({ loading, ...props }, ref) {
       // ...
     }
   )
   ```

2. **Keep swizzled components simple** — don't add too much logic; consider
   wrapping the library component instead

3. **Test swizzled components** — create comprehensive tests for customizations

   ```typescript
   describe('CustomButton', () => {
     it('shows loading state', () => {
       const { getByText } = render(<Button loading loadingText="Please wait..." />)
       expect(getByText('Please wait...')).toBeInTheDocument()
     })
   })
   ```

4. **Review before upgrading** — when upgrading Astryx, check if swizzled
   components need updating

5. **Consider deprecation** — if you're swizzling heavily, consider if a
   different library might fit better

## Reverting a Swizzle

To stop using a swizzled component and return to the library version:

```bash
# Remove the swizzled component
rm -rf src/components/Button

# Remove any build tool aliases you created
# (in next.config.js, vite.config.ts, etc.)

# Imports will now resolve to @astryxdesign/core
```

## Advanced: Component Composition Instead of Swizzling

Before swizzling, consider wrapping the library component:

```typescript
import { Button as AstryxButton } from '@astryxdesign/core'

interface CustomButtonProps {
  loading?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  children: React.ReactNode
}

export function CustomButton({ loading, ...props }: CustomButtonProps) {
  return (
    <AstryxButton disabled={loading} {...props}>
      {loading ? '...' : props.children}
    </AstryxButton>
  )
}
```

This is lighter than swizzling and easier to maintain. Only swizzle when
composition can't meet your needs.
