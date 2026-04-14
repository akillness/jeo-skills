# Storage Decision Matrix

Use this matrix when a request blurs relational, document, and hybrid design.

## 1. Relational-first is usually the better default when
- the domain has strong integrity rules
- joins and cross-entity reporting matter
- many records reference each other over time
- uniqueness, lifecycle state, or money/entitlements need explicit constraints
- downstream teams need stable fields, not loosely shaped payloads

Typical examples:
- organizations / memberships / roles
- billing and invoice history
- orders / payments / fulfillment
- inventory, pricing, and moderation state

## 2. Document-heavy is usually better when
- each record is mostly read/written as one aggregate
- record shape varies significantly by customer/content type
- cross-record joins are rare or non-critical
- ingestion speed and flexibility matter more than strict cross-entity constraints

Typical examples:
- rich content blocks
- template definitions
- import payload archives
- AI generation traces or loosely structured annotations

## 3. Hybrid is usually the best answer when
- ownership and billing/account state are relational
- content or metadata needs flexible nested structure
- some fields are query-critical while others are best left flexible
- the team can explain which JSON fields must eventually graduate into columns

Typical examples:
- a marketplace listing with structured pricing/status plus flexible specs/attributes
- B2B account tables plus configurable workflow JSON
- transactional entities plus append-only event or audit payloads

## Review prompts
- Which fields participate in joins, filters, or uniqueness checks?
- Which invariants should the database enforce directly?
- Which fields can change shape without breaking reporting, search, or moderation?
- Is JSON being used because it is right, or because the team has not modeled the domain yet?
- If the workload grows 10x, which fields would we wish were first-class columns?
