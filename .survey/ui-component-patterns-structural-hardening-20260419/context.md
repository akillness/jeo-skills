# Context: ui-component-patterns structural hardening

## Workflow Context
Reusable component architecture pain shows up when teams move from app-local widgets to shared primitives that must survive routing, slots, variant growth, refs, and TypeScript contracts. Radix's composition guide centers `asChild` for alternative element types and custom React components, but explicitly warns that consumers must keep the result accessible and functional and that custom leaf components must spread props and forward refs ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)). MUI's composition guide documents similar pressure through wrapper components, `muiName`, forwarded props, and merged slot props ([MUI Composition](https://mui.com/material-ui/guides/composition/)). The same pain appears in shadcn/ui's local-ownership model, where teams copy component code into the repo and then maintain their own variants and wrappers instead of consuming a versioned package ([shadcn/ui Docs](https://ui.shadcn.com/docs)).

Browser-rendered primary-page evidence used in this run:
- Radix page title: **"Composition – Radix Primitives"**; visible guidance says to use `asChild` to compose Radix functionality onto alternative element types or custom React components and shows the requirement to keep the result accessible.
- MUI page title: **"Composition - Material UI"**; visible guidance highlights wrapping components, forwarding props, and forwarding slot props.
- shadcn page title: **"Introduction - shadcn/ui"**; visible docs show a large catalog of locally owned components and primitives.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Design-system / component-library maintainer | Define reusable primitives, variant rules, slot anatomy, and integration constraints | Advanced frontend / platform |
| Product frontend engineer | Integrate primitives with routing, forms, analytics, and local product wrappers | Intermediate to advanced |
| TypeScript-heavy React maintainer | Preserve prop inference, refs, and safe wrapper patterns across shared APIs | Advanced |
| Local-ownership / shadcn-style app team | Copy, adapt, and maintain primitives inside the app repo | Intermediate |

## Current Workarounds
1. **Polymorphic roots and slotting** — teams use `asChild`, `component`, or slot props to avoid duplicating primitives across links, buttons, dialogs, and wrappers ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition), [MUI Composition](https://mui.com/material-ui/guides/composition/)).
2. **Leaf-component discipline** — custom leaf components are expected to spread props and forward refs so vendor or design-system behavior can attach safely later ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)).
3. **Copy-and-own component layers** — shadcn/ui-style adoption pushes teams toward app-local `components/ui` layers and per-app wrapper stacks rather than a centrally versioned package ([shadcn/ui Docs](https://ui.shadcn.com/docs)).
4. **Storybook plus side-channel docs** — stories and demos help discovery, but teams still rely on README / design docs / issue comments for usage rules and edge cases because Storybook alone is not a governance surface ([Storybook Docs](https://storybook.js.org/docs)).

## Adjacent Problems
- **Design-system governance** — naming, tokens, primitive policy, and contribution rules belong to `design-system`, not to the reusable-component router itself.
- **Accessibility remediation** — changing the rendered element shifts keyboard/focus/semantic responsibility and can expose accessibility bugs later; this is adjacent but not identical to component API ownership ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)).
- **Responsive layout behavior** — container or viewport adaptation often surfaces in the same components, but layout strategy should still route to `responsive-design` when it is the primary decision.
- **State ownership and performance** — controlled/uncontrolled boundaries touch `state-management`, while render/hydration issues belong with `react-best-practices`.

## User Voices
- “Components used with `asChild` should only accept a single child” — repeated request to make Radix's slottable-child constraints explicit at the type level ([radix-ui/primitives#1979](https://github.com/radix-ui/primitives/issues/1979)).
- “Prop types for children of slottable (`asChild`) components” — repeated request for clearer typing/contracts around slotted children ([radix-ui/primitives#895](https://github.com/radix-ui/primitives/issues/895)).
- Radix docs themselves highlight the common integration failure: custom leaf components must spread received props and forward refs or composition breaks ([Radix Composition](https://www.radix-ui.com/primitives/docs/guides/composition)).
