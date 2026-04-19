# Ownership packets and route-outs

Use this note when a request looks like “state management” but actually mixes several different owners.

## Packet-first reading order
1. **URL / route packet** — Does navigation, deep-linkability, back/forward behavior, or route-native data loading already own this?
2. **Form packet** — Is this mostly validation, touched/dirty state, submission lifecycle, or async submit error handling?
3. **Server-state packet** — Is the real problem fetching, caching, invalidation, optimistic updates, revalidation, or remote freshness?
4. **Shared subtree packet** — Is Context enough for theme/auth/locale/shell state across a moderate tree?
5. **Client workflow packet** — After the earlier packets are separated, what long-lived client coordination remains?
6. **Local UI packet** — What transient state can stay nearest to the feature instead of being promoted at all?

Rule: choose **one primary packet** before comparing tools. Secondary packets are fine, but do not skip the primary-owner call.

## Healthy packet combinations

### Dashboard / admin surface
- URL owns filters, sort, pagination
- query/router data layer owns fetched entities and invalidation
- local or lightweight client state owns panel toggles and transient coordination

### Authenticated SaaS shell
- Context owns auth snapshot, theme, locale
- query/router data layer owns remote resources
- optional lightweight client store owns cross-panel transient workflow state

### Multi-step editing flow
- form layer owns validation and submission state
- query/router data layer owns remote entities and optimistic invalidation
- client workflow state owns drafts, undo, and multi-step coordination
- explicit state-machine modeling may be justified if transitions/guards dominate

## Wrong-owner checklist
Call out the most likely wrong owner explicitly:
- one universal store for unrelated lifecycles
- mirroring server cache into a client store without an offline/workflow reason
- hiding shareable filters and tabs outside the URL
- pushing dirty/touched/form-submit lifecycle into app-wide global state
- using a store debate to avoid naming whether the real task is performance, debugging, API design, or layout behavior

## Route-out checklist
- **`react-best-practices`** if the question is mostly rerenders, hydration, or server/client performance cost
- **`api-design`** if mutation contracts or backend responsibility drive the disagreement
- **`debugging`** if the current behavior is already broken and needs reproduce → isolate → verify
- **`ui-component-patterns`** if one component API is the real decision surface
- **`design-system`** if shared preference/governance rules matter more than runtime ownership
- **`responsive-design`** if viewport adaptation or layout collapse is the main job
