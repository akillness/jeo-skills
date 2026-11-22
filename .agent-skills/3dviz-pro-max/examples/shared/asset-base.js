// Single source of truth for where the anatomy and heart STL payloads are fetched from.
//
// Default `../assets/`: the local copy under examples/public/assets, which the dev server and a
// plain `pnpm build` both serve at /assets/ — one directory above every standalone study page.
// Set VITE_ASSET_BASE to an absolute origin (the R2 bucket) to keep those 169 MB out of the
// repository and out of the Cloudflare Pages upload; see examples/.env.example.
//
// Both loaders call fetch() with `ASSET_BASE + '<folder>/<id>.stl'` and hand the ArrayBuffer to
// STLLoader.parse(), so an absolute base needs no loader path handling (no LoadingManager or
// setPath() is involved and nothing prefixes the module URL).

// A base is only usable as a prefix when it ends in a slash; accept either spelling in the env.
function normaliseBase(value) {
 if (typeof value !== 'string') return '';
 const trimmed = value.trim();
 if (!trimmed) return '';
 return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

// `import.meta.env` exists under Vite (dev and build) but not in plain node, where these modules
// are also imported by the unit tests — guard rather than throw.
const configured = import.meta.env && normaliseBase(import.meta.env.VITE_ASSET_BASE);

export const ASSET_BASE = configured || '../assets/';
