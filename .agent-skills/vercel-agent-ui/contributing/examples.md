# Styling the Examples

Every docs example is plain markup: the component's parts, a few layout elements and its data. Their stylesheets live beside them in `examples/`, one per component, and every rule is scoped to `[data-example]`, the element each preview renders into, so none of it reaches the rest of the site.

The result is that an example shows only what it teaches. Someone copying it, or an agent reading it, gets the parts and their props without a wall of styling, and the look stays consistent because it lives in one place.

## Rules

- **No class names and no inline styles.** No `className`, `class`, `:class` or `classList`, and no class helpers. Inline `style` is only for values computed at runtime, such as a position, a size or a color from the example's data. Pass those as CSS custom properties (`style={{ "--x": `${x}px` }}`) when the stylesheet reads them.
- **Layout comes from slots.** Put `data-slot` on the elements an example owns: `stack` (a column), `row` (a wrapping row), `controls` (the buttons or inputs that drive the demo), `grid` (two columns), `card`, `label`, `hint` (secondary text), `output` (a status or result line), `list` (a bordered list), `log` (a scrolling event log), `scroll`, `kbd`, `badge`, `swatch`, `tile`, `media`, `grip` and `spinner`. Plain `button`, `input`, `textarea`, `select`, `a`, `table`, `dl`, `fieldset` and `h3` already have a look.
- **Controls go first, in `controls`.** When an example has its own buttons, toggles, links or a search field that change the demo, put them in one `data-slot="controls"` row before the component. The preview then pins to the top, so the controls never move while the demo grows or shrinks.
- **Parts bring their own slot.** Every part sets `data-slot` to its component and part name, such as `menu-item` or `select-trigger`. A primitive defined in an example gets `<primitive>-<slot>`, such as `cart-trigger`, and an author's `data-slot` can't replace it. Style parts by those names.
- **Name a shape when a demo needs one.** When the layout slots don't fit, such as a board column, a photo or a canvas, add a small slot named for the demo: `kanban-column`, `lasso-photo`. Reuse the same name for the same shape across an example's files.
- **Style state from the attributes parts already set.** `data-open`, `data-highlighted`, `data-selected`, `data-checked`, `data-pressed`, `data-disabled`, `data-invalid`, `data-dragging`, `aria-pressed`, `aria-expanded` and the rest. Each component's docs page lists them. Don't add attributes to style state a part already exposes.
- **Variants and revealed content are attributes too.** Buttons take `data-variant="solid" | "secondary" | "ghost" | "outline" | "link" | "destructive"`, `data-size="sm" | "lg"` and `data-shape="round"`. Layout slots can take a `data-variant` when a demo needs a second look, such as `data-variant="dots"` on a row. Content that only shows in one state carries `data-show="<state>"`, and the component's section shows it when its part has that state.
- **Stable layout.** Keep controls in place when state changes or results disappear. Reserve space for output that changes.
- **Compose with our components.** An example can use any of our components, not only the one it documents. A label and a field use `Field`, `FieldLabel` and `FieldControl`, not a hand-built label. Don't put decorative icons inside inputs.
- **Grow, don't scroll.** An example grows the preview instead of scrolling inside it, unless scrolling is what it shows.
- **Log events to the console pane.** When a demo needs to show events, call `log("…")` from `useLog()` in `examples/shared/react/log`. The docs preview shows a fixed-height console under the example, so nothing in the demo moves. Copied code logs to the browser console. Don't render readouts inside the example.
- **Button labels are title case**, such as Delete Project or Review Changes. Dialog titles, descriptions and messages stay in sentence case.
- **Demos are centered** in the preview. Their own content stays start-aligned.
- **No readouts that repeat the UI.** Don't add a status line or `output` that restates what the caption or the component already shows.
- **No motion unless it's the demo.** Only an example about animation animates. Hover and press feedback is fine.
- **Self-contained files.** An example imports only `@ui-sdk/*`, its framework, lucide icons and helpers from `examples/shared/<framework>/`. The Code tab shows a shared helper as a second file, imported from the same folder, so copying both files works. The data it needs, such as a list of fruits or people, sits in the file as a `const` at the top or inline in the markup. Copy the same data into each framework's file so they all show the same items.
- **Icons come from lucide**, imported by name: `lucide-react` in React, `@lucide/vue` in Vue, `@lucide/svelte` in Svelte and `lucide` in web components, where `createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML` puts an icon in a template. Pass `aria-hidden`, since `createElement` doesn't add it. Use the same icon in every framework. The stylesheet sizes icons.
- **Keep what the example teaches.** Restyling never removes a prop or a behavior. Examples have no comments; the docs page around an example explains it.

## The Stylesheets

```text
examples/
  styles/tokens.css                 the tokens
  styles/base.css                   bare elements, layout slots, shared fields and controls
  components/<name>/<name>.css      one component, shared by all five frameworks
  components/<name>/{react,vue,svelte,solid,web}/
  behaviors/ core/ experiments/     demo groups for the Core pages
```

Each file wraps its rules in `@scope ([data-example])`. `pnpm --filter examples build` builds each into its own file, and a docs page loads only the ones its examples need: tokens and base first, then the example's folder's, those of the components bundled into it and those its own primitives are named after, in alphabetical order. So a date picker example gets Calendar's styles too, and a page with no examples gets none.

- **Use only the tokens.** Colors, lines, shadows and radii come from `styles/tokens.css`. Colors use `light-dark()`, so they follow the page's color scheme.
- **A component styles only its own slots,** in its own file, since a page loads that file only for examples that use the component. Styles several components share go in base. If a demo needs a shared part to look different, scope the rule under the demo's slot.
- **Keep selectors flat:** one attribute selector, with `&` for states and children.

## Checks

- `grep -rnE 'className|class=|:class|classList' examples/components/<component>` finds nothing.
- `pnpm --filter examples build`, then `pnpm format`, `pnpm lint` and the docs specs for the component (`tests/docs/<component>.spec.ts`, and `tests/docs/core/` for Core pages).
- Check the example in light and dark, and in right to left where it has an RTL example.
