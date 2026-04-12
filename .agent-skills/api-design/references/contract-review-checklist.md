# API Contract Review Checklist

Use this checklist before finalizing an API design packet.

## Framing
- Who consumes this API?
- What job does the contract enable?
- What assumptions are still unstated or risky?
- Is the artifact format right for the current decision stage?

## Style choice
- Why is REST or GraphQL the better fit here?
- If mixed, are responsibilities clearly separated?
- Does the team have a plan to avoid drift between surfaces?

## Resource / type model
- Are resource names or types clear and stable?
- Is ownership between domains/services explicit?
- Are action endpoints or mutations justified rather than accidental?

## Request / response semantics
- Are required fields, defaults, nullability, and enum behavior explicit?
- Are filtering, sorting, and pagination rules defined?
- Are long-running jobs, async flows, or eventual consistency called out?
- Are IDs and timestamps consistent?

## Error / auth / compatibility
- Are auth expectations clear at the contract layer?
- Are machine-readable errors and failure categories defined?
- Are retry/idempotency expectations explicit?
- Are backward-compatibility and deprecation rules stated?
- Could an existing client break because of this change?

## Handoffs
- Does `backend-testing` need contract or integration coverage next?
- Does `api-documentation` need examples, tutorials, or a docs portal next?
- Does `authentication-setup` own deeper auth implementation work?
- Does `database-schema-design` own unresolved storage-model decisions?

## Final rule
If the packet cannot explain the style choice, consumer needs, compatibility stance, and downstream handoffs in plain language, the design is probably not ready.
