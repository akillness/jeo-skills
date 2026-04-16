# Token and Governance Checklist

Use this checklist before changing shared system rules.

## Foundations
- Are semantic tokens preferred over one-off literal values?
- Are typography, spacing, radius, elevation, and motion scales named consistently?
- Are breakpoint or density rules defined at the system level only when multiple surfaces truly share them?
- Are reduced-motion and contrast expectations captured as system baseline rather than as optional polish?

## Primitive policy
- Which primitives are truly shared across products or surfaces?
- Which UI pieces should remain product-local wrappers instead of becoming primitives?
- Are primitive names tied to role/pattern rather than one screen?
- Is there a clear promotion rule from product-local UI into the shared system?

## Governance
- Who can add or rename tokens?
- What review is required before introducing new primitives or system states?
- What evidence is needed before broadening the system (reuse, cross-surface need, maintenance savings)?
- What should route to `ui-component-patterns`, `responsive-design`, `web-accessibility`, or `web-design-guidelines` instead of staying here?

## Accessibility baseline
- Contrast expectations stated?
- Focus visibility expectations stated?
- Reduced-motion posture stated?
- Semantic expectations for shared primitives stated?

## Output discipline
- Are the shared rules stated before examples?
- Is the final packet concise enough for downstream execution?
- Are open decisions called out explicitly instead of hidden in examples?
