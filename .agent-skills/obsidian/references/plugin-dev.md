# Plugin Development Reference

## ESLint Rules (27 rules from eslint-plugin-obsidianmd v0.1.9)

### Submission & Naming
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `no-obsidian-in-id` | No | Plugin ID must not contain "obsidian" |
| `no-plugin-suffix-in-id` | No | Plugin ID must not end with "-plugin" |
| `no-obsidian-in-name` | No | Plugin name must not contain "Obsidian" |
| `no-plugin-suffix-in-name` | No | Plugin name must not end with "Plugin" |
| `valid-description` | No | Description format validation |

### Memory & Lifecycle
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `prefer-register-event` | No | Use `this.registerEvent()` for automatic cleanup |
| `no-view-reference` | No | Never store direct view references |

### Type Safety
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `no-tfile-cast` | No | Use `instanceof TFile` not `as TFile` |

### UI/UX
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `sentence-case` | Yes | All UI text in sentence case |
| `no-plugin-name-in-command` | No | Commands must not repeat plugin name |
| `no-command-in-command` | No | Commands must not include "command" |
| `no-default-hotkey` | No | Do not define default hotkeys |
| `no-manual-headings` | No | Use `setHeading()`, not manual HTML |

### API Best Practices
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `no-global-app` | No | Use `this.app`, not global `app` |
| `prefer-request-url` | No | Use `requestUrl()`, not `fetch()` |
| `no-console-log` | No | Remove `console.log` before submission |
| `prefer-abstract-input-suggest` | No | Use `AbstractInputSuggest` |

### Styling
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `no-inline-styles` | No | Use CSS classes; no inline `style` attributes |
| `prefer-css-variables` | No | Use Obsidian CSS variables |
| `scope-plugin-styles` | No | Scope all CSS to plugin ID selector |

### Accessibility (MANDATORY)
| Rule | Auto-fix | Description |
|------|----------|-------------|
| `require-aria-label` | No | Icon buttons must have `aria-label` |
| `require-keyboard-nav` | No | All interactions must be keyboard accessible |
| `require-focus-visible` | No | Use `:focus-visible` CSS |

## Code Patterns

### Memory-safe event registration
```typescript
// ✅ Correct — auto-cleaned on plugin unload
this.registerEvent(
  this.app.vault.on('create', (file) => this.handleCreate(file))
);
// ❌ Wrong — leaks memory
this.app.vault.on('create', (file) => this.handleCreate(file));
```

### Type-safe file access
```typescript
// ✅ Correct
const file = this.app.workspace.getActiveFile();
if (file instanceof TFile) {
  await this.app.vault.read(file);
}
// ❌ Wrong
const file = this.app.workspace.getActiveFile() as TFile;
```

### Accessibility — ARIA on icon buttons
```typescript
// ✅ Correct
const btn = containerEl.createEl('button', { cls: 'clickable-icon' });
btn.setAttribute('aria-label', 'Delete note');
setIcon(btn, 'trash');
```

### CSS with Obsidian variables
```css
/* ✅ Correct — theme-compatible */
.my-plugin-button {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  border-radius: var(--radius-m);
}
```

## Plugin Naming Rules

| Field | Rule |
|-------|------|
| Plugin ID | Lowercase, alphanumeric + dashes/underscores; no "obsidian"; no "plugin" suffix |
| Plugin Name | No "Obsidian"; no "Plugin" suffix; no "Obsi" prefix or "dian" suffix |
| Description | No "Obsidian"; no "This plugin"; must end with `.`, `?`, `!`, or `)` |

## Quick Reference

| Task | Command |
|------|---------|
| Generate boilerplate | `npx github:gapmiss/obsidian-plugin-skill create-plugin` |
| Install ESLint | `npm install --save-dev eslint eslint-plugin-obsidianmd` |
| Run ESLint | `npx eslint src/` |
| Auto-fix | `npx eslint src/ --fix` |
| Build | `npm run build` |
| Dev watch | `npm run dev` |
| Bump version | `npm run version` |

## Submission Checklist

1. Run `npx eslint src/` — all 27 rules must pass
2. Validate manifest.json naming rules
3. Accessibility audit (ARIA, keyboard nav, focus-visible)
4. Remove all `console.log` statements
5. Submit PR to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
