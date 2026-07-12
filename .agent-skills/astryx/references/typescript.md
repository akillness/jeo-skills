# TypeScript Configuration for Astryx

## tsconfig.json Setup

Astryx requires TypeScript 5.0+ with proper module resolution:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "module": "ESNext",
    "jsx": "react-jsx",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## Import Patterns

### ✅ Correct: Direct component imports

```typescript
import { Button } from '@astryxdesign/core'
import TextField from '@astryxdesign/core/TextField'
import { Stack } from '@astryxdesign/core/Stack'
```

### ❌ Avoid: Re-exporting barrels

```typescript
// Slow in development, breaks tree-shaking
import * as Astryx from '@astryxdesign/core'
```

## Type Definitions

Astryx provides full TypeScript support for all components:

```typescript
import { Button, ButtonProps } from '@astryxdesign/core'

// Extend component types
interface MyButtonProps extends ButtonProps {
  customProp?: string
}

export function MyButton(props: MyButtonProps) {
  return <Button {...props} />
}
```

## Common Type Patterns

### Component Props

```typescript
import { ComponentProps } from 'react'
import { Button } from '@astryxdesign/core'

type ButtonProps = ComponentProps<typeof Button>

export function CustomButton(props: ButtonProps) {
  return <Button {...props} />
}
```

### Variant Props (CVA)

```typescript
import { cva } from '@astryxdesign/core'

const buttonVariants = cva('button', {
  variants: {
    intent: {
      primary: 'bg-blue-500',
      secondary: 'bg-gray-500',
    },
    size: {
      sm: 'text-sm',
      md: 'text-base',
    },
  },
})

type ButtonVariants = Parameters<typeof buttonVariants>[0]
```

## Theme Type Definitions

```typescript
import { ThemeConfig } from '@astryxdesign/core'

const myTheme: ThemeConfig = {
  colors: {
    primary: '#6741d9',
    secondary: '#ec4899',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
  },
}
```
