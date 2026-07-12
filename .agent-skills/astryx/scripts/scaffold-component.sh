#!/bin/bash
# Scaffold a new Astryx component

set -e

COMPONENT_NAME=${1:-"MyComponent"}
COMPONENT_PATH=${2:-"src/components"}
TEMPLATE=${3:-"base"}

# Validate component name
if [ -z "$COMPONENT_NAME" ]; then
  echo "Usage: $0 <ComponentName> [path] [template]"
  echo ""
  echo "Examples:"
  echo "  $0 MyButton"
  echo "  $0 MyCard src/ui/cards"
  echo "  $0 MyForm src/components form"
  echo ""
  echo "Templates: base (default), form, card, modal, dialog"
  exit 1
fi

# Ensure component name starts with uppercase
COMPONENT_NAME=$(echo "$COMPONENT_NAME" | sed 's/^\([a-z]\)/\U\1/')

FULL_PATH="$COMPONENT_PATH/$COMPONENT_NAME"

echo "=== Scaffolding Astryx Component ==="
echo "Component: $COMPONENT_NAME"
echo "Path: $FULL_PATH"
echo "Template: $TEMPLATE"

# Create directory
mkdir -p "$FULL_PATH"
echo "✅ Created directory: $FULL_PATH"

# Scaffold index.tsx based on template
case "$TEMPLATE" in
  form)
    cat > "$FULL_PATH/index.tsx" << EOF
import * as React from 'react'
import * as stylex from '@stylexjs/stylex'
import { TextField, Button, FormField, Stack } from '@astryxdesign/core'

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '500px',
  },
})

export interface $COMPONENT_NAME Props
  extends React.FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (data: Record<string, string>) => void
}

export const $COMPONENT_NAME = React.forwardRef<
  HTMLFormElement,
  $COMPONENT_NAME Props
>(function $COMPONENT_NAME ({ onSubmit, ...props }, ref) {
  const [formData, setFormData] = React.useState<Record<string, string>>({})

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit?.(formData)
  }

  return (
    <form ref={ref} {...stylex.props(styles.form)} onSubmit={handleSubmit} {...props}>
      <FormField label="Name" required>
        <TextField
          name="name"
          placeholder="Enter your name"
          value={formData.name || ''}
          onChange={handleChange}
        />
      </FormField>
      <FormField label="Email" required>
        <TextField
          type="email"
          name="email"
          placeholder="Enter your email"
          value={formData.email || ''}
          onChange={handleChange}
        />
      </FormField>
      <Button type="submit" variant="primary">
        Submit
      </Button>
    </form>
  )
})

$COMPONENT_NAME.displayName = '$COMPONENT_NAME'
EOF
    ;;

  card)
    cat > "$FULL_PATH/index.tsx" << EOF
import * as React from 'react'
import * as stylex from '@stylexjs/stylex'
import { Card } from '@astryxdesign/core'

const styles = stylex.create({
  cardWrapper: {
    padding: '20px',
    borderRadius: '8px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  content: {
    fontSize: '14px',
    lineHeight: '1.5',
  },
})

export interface $COMPONENT_NAME Props {
  title: string
  children: React.ReactNode
  onClick?: () => void
}

export function $COMPONENT_NAME ({ title, children, onClick }: $COMPONENT_NAME Props) {
  return (
    <Card onClick={onClick} {...stylex.props(styles.cardWrapper)}>
      <div {...stylex.props(styles.title)}>{title}</div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </Card>
  )
}
EOF
    ;;

  modal)
    cat > "$FULL_PATH/index.tsx" << EOF
import * as React from 'react'
import * as stylex from '@stylexjs/stylex'
import { Button, Stack } from '@astryxdesign/core'

const styles = stylex.create({
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
    justifyContent: 'flex-end',
  },
})

export interface $COMPONENT_NAME Props {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  onConfirm?: () => void
  confirmText?: string
  cancelText?: string
}

export function $COMPONENT_NAME ({
  isOpen,
  title,
  children,
  onClose,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}: $COMPONENT_NAME Props) {
  if (!isOpen) return null

  return (
    <div {...stylex.props(styles.modalOverlay)} onClick={onClose}>
      <div
        {...stylex.props(styles.modalContent)}
        onClick={e => e.stopPropagation()}
      >
        <div {...stylex.props(styles.title)}>{title}</div>
        <div>{children}</div>
        <div {...stylex.props(styles.actions)}>
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          {onConfirm && (
            <Button variant="primary" onClick={onConfirm}>
              {confirmText}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
EOF
    ;;

  *)
    # Default template
    cat > "$FULL_PATH/index.tsx" << EOF
import * as React from 'react'
import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  container: {
    padding: '16px',
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
  },
})

export interface $COMPONENT_NAME Props {
  children?: React.ReactNode
  className?: string
}

export const $COMPONENT_NAME = React.forwardRef<
  HTMLDivElement,
  $COMPONENT_NAME Props
>(function $COMPONENT_NAME ({ children, ...props }, ref) {
  return (
    <div ref={ref} {...stylex.props(styles.container)} {...props}>
      {children}
    </div>
  )
})

$COMPONENT_NAME.displayName = '$COMPONENT_NAME'
EOF
    ;;
esac

echo "✅ Created $FULL_PATH/index.tsx"

# Create TypeScript types file (optional)
cat > "$FULL_PATH/types.ts" << EOF
/**
 * Types for $COMPONENT_NAME component
 * Add shared types, interfaces, or enums here
 */

export interface $COMPONENT_NAME Config {
  variant?: string
  size?: 'sm' | 'md' | 'lg'
}
EOF

echo "✅ Created $FULL_PATH/types.ts"

# Create test file
cat > "$FULL_PATH/$COMPONENT_NAME.test.tsx" << EOF
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { $COMPONENT_NAME } from './index'

describe('$COMPONENT_NAME', () => {
  it('renders correctly', () => {
    const { container } = render(<$COMPONENT_NAME>Test content</$COMPONENT_NAME>)
    expect(container).toBeInTheDocument()
  })

  it('accepts children', () => {
    const { getByText } = render(
      <$COMPONENT_NAME>Hello World</$COMPONENT_NAME>
    )
    expect(getByText('Hello World')).toBeInTheDocument()
  })
})
EOF

echo "✅ Created $FULL_PATH/$COMPONENT_NAME.test.tsx"

# Create Storybook story (optional)
cat > "$FULL_PATH/$COMPONENT_NAME.stories.tsx" << EOF
import type { Meta, StoryObj } from '@storybook/react'
import { $COMPONENT_NAME } from './index'

const meta = {
  title: 'Components/$COMPONENT_NAME',
  component: $COMPONENT_NAME,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
    },
  },
} satisfies Meta<typeof $COMPONENT_NAME>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: '$COMPONENT_NAME content',
  },
}

export const WithContent: Story = {
  args: {
    children: 'This is a sample $COMPONENT_NAME with content',
  },
}
EOF

echo "✅ Created $FULL_PATH/$COMPONENT_NAME.stories.tsx"

# Create an index file for exporting
cat > "$FULL_PATH/__index.ts" << EOF
// Export the component and types
export { $COMPONENT_NAME } from './index'
export type { $COMPONENT_NAME Props } from './index'
export type { $COMPONENT_NAME Config } from './types'
EOF

echo "✅ Created $FULL_PATH/__index.ts"

echo ""
echo "=== Component Scaffolding Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit $FULL_PATH/index.tsx to implement your component"
echo "  2. Add tests to $FULL_PATH/$COMPONENT_NAME.test.tsx"
echo "  3. Add Storybook stories to $FULL_PATH/$COMPONENT_NAME.stories.tsx"
echo "  4. Export from your main components index:"
echo "     export { $COMPONENT_NAME } from './components/$COMPONENT_NAME'"
echo ""
echo "Component ready at: $FULL_PATH"
echo ""
