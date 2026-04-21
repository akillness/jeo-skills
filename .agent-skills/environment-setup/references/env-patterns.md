# Environment Configuration Patterns

## Recommended baseline layering
1. **Committed template** — `.env.example` or equivalent, containing safe placeholder keys and comments.
2. **Local-only override** — `.env.local` or ignored machine-specific values.
3. **Framework/runtime rules** — documented public/private prefixes and build/runtime behavior.
4. **Validation layer** — schema or startup checks for required values.
5. **Secret source note** — where sensitive values actually come from.

## Questions to answer explicitly
- Which env files are committed?
- Which files are ignored?
- Which variables are safe to expose to the client?
- Which values come from secret managers or cloud platforms?
- What fails fast if a required value is missing?

## Common drift smells
- README documents variables that the app no longer reads.
- CI uses variables that never appear in templates.
- `.env.production` is committed even though real prod values come from the platform.
- Frontend/public env names are mixed with server-only secrets.
- The team cannot explain precedence in one short paragraph.
