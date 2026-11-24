---
"@ui-sdk/svelte": patch
---

Relative imports in the published files name their file, like `./create-parts.js`, where a folder of the same name sat beside it, so Node and test runners that load the package without a bundler no longer throw `ERR_UNSUPPORTED_DIR_IMPORT`.
