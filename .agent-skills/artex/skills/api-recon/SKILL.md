---
name: api-recon
description: Invoke this skill when collecting a website's API endpoints.
---

# API Recon (frontend API reconnaissance)

Under an **authorized** engagement, discover as completely as possible: **backend APIs** (paths, methods, parameters, response bodies), **frontend routes**, and **UI feature trigger points** (tabs, modals, table actions, etc.).

---

## Boundaries and prohibitions (agents must read · violation means going out of bounds)

This skill **only performs API / parameter-surface reconnaissance**; it is not the vulnerability-hunting or exploitation phase.

### Task boundaries

| Scope | Allowed | Prohibited |
|---|---|---|
| **Target** | Enumerate paths, methods, parameters, routes, UI trigger points | SQLi/XSS/privilege-escalation/brute-force/fuzz vulnerabilities, modified-packet attacks, destructive operations |
| **Auth** | Hook + stub/mock to bypass the **client-side** login gate | Asking the user for or guessing credentials; attempting real login form submissions |
| **Runtime** | Hook endpoints without credentials and use mock responses to get the SPA into its post-login shell | Flows that require a real backend session to continue |

### Credential-free dynamic analysis (Phase 3 default)

1. Use `preload.js` / `runtime_harvest.js` to **intercept and stub** bootstrap endpoints such as login, permissions, and menus;
2. Return mock bodies for business query endpoints that are **structurally correct, carry a success business code, and may have empty data**;
3. Keep the frontend rendering post-login pages even without a backend or under 401s, thereby triggering more XHR/fetch/WebSocket traffic;
4. **Empty data, blank tables, and placeholder UI are all expected** — do not switch to real login or vulnerability testing over them.

**In one sentence**: use mocks to pry open frontend routes and component mounting and **record outbound requests only**; what the backend returns does not matter — what matters is **which other endpoints the frontend still calls**.

### Hard process prohibitions

| Prohibited | Do this instead |
|---|---|
| grep/curl/Read the main entry `index-*.js` to extract API paths before Phase 1 completes | Run `OUTDIR/harvest_static.py` |
| Hand-writing harvest replacement scripts such as `extract_apis.py` | Edit `OUTDIR/harvest_static.py` and rerun |
| Repeating the same grep/command after ≥2 failures | Switch strategy: read tool_logs, adjust harvest, consult reference |
| Skipping gates A/B and running the originals straight from `scripts/` | Copy into OUTDIR and adapt to the target |
| Real usernames/passwords, OTP, OAuth and other authentication | stub/mock (see above) |
| Skipping stubs "to get real data" and running privilege-escalation/injection tests | Record outbound only; that is the recon boundary |
| Irreversible operations such as deletion, exporting sensitive data, or bulk writes | Same for clicks during coverage |
| Claiming all pages and endpoints are captured before runtime + dynamic enumeration complete | See "Definition of done" or note limitations |
| Claiming full parameter coverage before the parameter trigger matrix + diff are done | Phase 3b matrix + Phase 5 diff |
| Inferring required/optional from a single runtime sample | Multi-sample diff or validation rules / error-driven inference |

---

## Two-layer model + run modes

| Layer | Output | Limits |
|---|---|---|
| **Static** (JS bundle) | Full endpoint paths, draft routes, payload-assembly field candidates | No HTTP methods; parameters need Phase 1b; misses runtime-assembled URLs |
| **Runtime** (live session) | Methods + bodies + responses + dynamic URLs + WS/SSE; multi-sample diff fills in parameters | Pages must actually render before requests fire; a single sample cannot settle required/optional |

| Run mode | Engine | Best for |
|---|---|---|
| **depth** | `runtime_harvest.js` (Puppeteer) | API inventory, METHOD/params/response bodies, WS/SSE, reproducible batch runs |
| **coverage** | browser + `preload.js` | Clicking tabs/modals/tables for deeper feature coverage |
| **both** | depth then coverage | Most complete, most time-consuming |

**Parameter methodology** (no universal script): paths via harvest/regex; parameters via **anchor window expansion + UI binding chains + multi-sample diff + error-driven inference** (grep recipes in [reference.md](reference.md) section J).

---

## Definition of done

Recon may only be declared complete when all of the following hold:

- [ ] **Static**: Phase 1 harvest produced `api_static.txt`, `routes.txt`, `js/`
- [ ] **Runtime**: at least one of depth or coverage; coverage/both require **working hooks + the dynamic enumeration loop**
- [ ] **Inside the shell**: visiting business paths does not end up at `/login` (watch out for hash routing)
- [ ] **Parameters**: coverage/both completed the parameter trigger matrix + `param_samples.json`; Phase 5 merged `params_merged.json`
- [ ] **Depth** (if module pages are blank): Phase 4 permission-tree restoration and rerun until **module-level APIs** appear (not just locale/bootstrap)
- [ ] **Delivery**: Phase 5 outputs complete (see the Phase 5 output table); `insert_assets` writes the service and endpoint assets

---

## Scripts and gates

`scripts/` are reference templates only; it is **forbidden** to run the originals directly and treat the results as final.

**Rule**: read first → adapt to the target → write into `OUTDIR` (e.g. `recon/`) → record `CHANGES.md`; if it does not fit, rewrite per the methodology and borrow only the structure.

| Gate | When | Reference script → OUTDIR copy | Commonly required edits |
|---|---|---|---|
| **A (static)** | After Phase 0, before the **first** harvest/spider run | `harvest_static.py` / `spider_mpa.py` | **Most sites run fine with the default regex**; only adjust the endpoint regex, webpack/Vite `publicPath`, or MPA exclude/cookie when the manifest/dialect does not match |
| **B (runtime)** | After Phase 2, before running depth/coverage | `runtime_harvest.js` / `preload.js` + `config.json` | Cookie/localStorage keys, neutralized success values, stubs, login regex, API prefix, hash/history routing |

**Mandatory SPA ordering** (not swappable; phase numbers take precedence over "explore first, script later"):

| Step | Required | Prohibited |
|---|---|---|
| After Phase 0 | Next Bash command = `python3 OUTDIR/harvest_static.py <URL> OUTDIR` | curl/grep/Read the main entry `index-*.js` (usually >500KB) |
| Gate A | Copy the script → make small edits as needed → **run immediately** | Hand-extracting APIs first and only then deciding whether to harvest |
| Before Phase 1 completes | Verify outputs with `wc -l`; on 404s fix harvest and retry | Hand-written extract scripts; repeatedly grepping URLs that were never downloaded |
| From Phase 1b on | grep only `OUTDIR/js/*.js` | Substituting the main bundle for harvest |

- ✅ Copy `harvest_static.py` → (optionally) adjust regex → **run immediately**
- ❌ curl the main bundle → grep repeatedly → write a throwaway extract → harvest only at the end
- **MPA**: after Phase 0 the next Bash command = `python3 OUTDIR/spider_mpa.py ...`

---

## Tooling and output constraints

| Constraint | Details |
|---|---|
| Large files | >100KB `index-*.js` files are **forbidden** to Read/grep into context; batch-process them with OUTDIR scripts |
| grep output | Must use `\| head -20` or `-m 5`; keep only path summaries in the conversation, do not paste bundle fragments |
| Verification | Use `wc -l`, `ls \| wc -l`; do not Read whole directories |
| Regex first probes | Optional, ≤1 time, only on ≤50KB small chunks or HTML; official static results come from harvest |
| reference | Recipes/templates/troubleshooting live in [reference.md](reference.md); do not inline the full text repeatedly |

---

## Execution roadmap

```
Phase 0 classify + OUTDIR
  → Gate A → Phase 1 harvest (★ run immediately ★)
  → Phase 1b parameter reverse engineering
  → Phase 2 three auth gates → config.json
  → Gate B → Phase 3 runtime + parameter matrix
  → Phase 4 permission tree (if needed) → rerun Phase 3
  → Phase 5 merge report + insert_assets batch-inserts every discovered service and endpoint API asset; never omit a discovered asset when inserting
```

Check items off in order; **do not move to the next phase before the previous one completes**.

1. [ ] **Phase 0**: initial SPA/MPA triage; create `OUTDIR` → [Phase 0](#phase-0--classification)
2. [ ] **Gate A + Phase 1**: copy the script → harvest **immediately** → verify with `wc -l` → [Phase 1](#phase-1--static)
3. [ ] **Phase 1b**: anchor window expansion + binding layer → `param_candidates.json` → [Phase 1b](#phase-1b--parameter-reverse-engineering)
4. [ ] **Phase 2**: the three auth gates → `config.json` → [Phase 2](#phase-2--the-three-auth-gates)
5. [ ] **Gate B**: adjust the runtime scripts → [Phase 3](#phase-3--runtime)
6. [ ] **Phase 3**: depth / coverage / both; confirm we are inside the shell; parameter trigger matrix → `param_samples.json`
7. [ ] **Phase 4** (if needed): permission tree → patch stubs → rerun Phase 3 → [Phase 4](#phase-4--permission-tree-restoration)
8. [ ] **Phase 5**: merge outputs + report + `insert_assets` → [Phase 5](#phase-5--merge-and-report)

---

## Phase 0 — Classification

Fetch the entry HTML and **create `OUTDIR`** (do not modify the skill's `scripts/`):

- **SPA**: empty shell + `<div id=app>` + chunks → Phase 1–5
- **MPA**: SSR + `<form>`, no endpoint bundle → after gate A:

```bash
python3 recon/spider_mpa.py <BASE_URL> <OUTDIR> [--cookie "session=..."] [--max 300] [--depth 5] [--exclude "logout|delete|destroy"]
```

Produces `forms.txt`, `links.txt`, `api_inline.txt`. For an SPA, if forms ≈ 0 → switch to Phase 1.

---

## Phase 1 — Static

Follow [Scripts and gates](#scripts-and-gates) · [Tooling and output constraints](#tooling-and-output-constraints).

```bash
python3 recon/harvest_static.py <BASE_URL> <OUTDIR>
```

harvest: parse HTML scripts → webpack/Vite manifest → download all lazy chunks → produce `js/`, `api_static.txt`, `routes.txt`, `chunkmap.txt`.

```bash
wc -l OUTDIR/api_static.txt OUTDIR/routes.txt
ls OUTDIR/js | wc -l
```

- chunk count vs manifest: on 404s fix harvest and retry; do not hand-curl chunks one by one
- Too few entries in `api_static.txt` → loosen the endpoint regex inside OUTDIR and rerun (see reference)

### Phase 1b — Parameter reverse engineering

Paths come from Phase 1; parameter fields need separate recon. See [Tooling and output constraints](#tooling-and-output-constraints) for grep rules.

**Completion bar**: for every important endpoint you can answer — field names, transport location, type inference, required or not, sample values, confidence.

#### 1b.0 — Transport shapes

| Shape | Where parameters live | Look first statically |
|---|---|---|
| REST JSON | body + query | `(params\|data\|body)\s*:\s*\{` next to the path anchor |
| GraphQL | `variables` | gql templates, `$page: Int` |
| Traditional form | urlencoded | `<form>`, `FormData` |
| File upload | multipart | `FormData.append` |
| Path parameters | `/user/:id` | route tables + `useParams` / `$route.params` |
| Encrypted/signed | wrapped in `sign`/`data` | Hook the crypto function's inputs (reference section D) |

Output: annotate each endpoint with `transport: query|json|form|graphql|encrypted`.

#### 1b.1 — Anchor window expansion

Anchor on a known path and widen the window to find the payload-assembly object:

```bash
grep -n '"/api/user/list"' OUTDIR/js/*.js | head -20
grep -rhoaE '.{0,120}("/api[^"]+").{0,200}' OUTDIR/js/*.js | head -20
grep -rhoaE '(params|data|body|payload)\s*:\s*\{' OUTDIR/js/*.js | head -20
```

| Wrapper layer | Parameter clues |
|---|---|
| axios instance | `data` / `params` |
| Unified request | Global fields injected by interceptors |
| OpenAPI client | Generated method signatures |
| React Query / SWR | The hook's second argument |
| Vue composable | Composable inputs |

Type leftovers: `yup`/`zod`/rules, `Form.Item name=`, embedded Swagger.

→ `param_candidates.json`:`{ path, fields[], source: "static-callsite", confidence }`

#### 1b.2 — Binding layer

```
Form field → onFinish/handleSubmit → transform → API payload
```

| Binding source | Technique |
|---|---|
| Form submit | Follow submit → transform → API |
| Table search | `getFieldsValue()` → `params` |
| Route | `:id` / `?tab=` |
| Interceptor | Global `tenantId`, pagination, sign |
| Enum select | `options` → API enum values |

Use the DevTools call stack to walk up from `fetch`/`XHR.send` to the payload-assembly function.

#### 1b.3 — Three payload-assembly questions (≠ Phase 2's three auth gates)

| Question | What to answer |
|---|---|
| **Assembly** | Where the payload is built, transform traces |
| **Validation** | required, pattern, enum |
| **Transport** | path / query / body / multipart / headers |

The interceptor gate (Phase 2) is also where globally injected fields get read (Authorization, `X-Tenant-Id`, sign).

#### 1b.4 — Connecting to Phase 3

Candidate fields come from the static/binding layers; **required/optional/conditional dependencies** need the Phase 3 parameter matrix + diff + Phase 5 error-driven inference.

---

## Phase 2 — The three auth gates

grep in `OUTDIR/js/` (with `head`) and write the findings into `config.json` (recipes in reference):

| Gate | Question | Keywords |
|---|---|---|
| **Render gate** | How does the app decide the user is logged in? | `isLogin`, `getToken`, Cookie/localStorage |
| **Interceptor gate** | What triggers a redirect to `/login`? | `response_code`, `errno`, axios interceptor |
| **Content gate** | Where do menus/permissions come from? | `menu`, `permission`, `role`, `acl`, `routes` |

Never treat a localStorage key name as a credential — confirm it from chunks/the request chain.

**Exit = gate B**: land the conclusions in `config.json` and edit `OUTDIR/runtime_harvest.js` / `preload.js`.

### Phase 2b — API observation (optional)

Use the OUTDIR copy of `preload.js` to confirm session key names, Authorization, and nested API URLs:

| Config | Output |
|---|---|
| `recordDetail: true` | `__API_RECON_DETAIL__` |
| `observe.xhrHeaders: true` | Header observation |
| `extractUrlsFromResponse: true` | Sub-APIs inside responses |
| `observe.storageReads/cookieReads: true` | Backfill config |
| `neutralizeVueRouter: true` | `__API_RECON_ROUTES__` |

Every coverage round exports: `__API_RECON_LOG__`, `__API_RECON_DETAIL__`, `__API_RECON_ROUTES__`, `__API_RECON_OBSERVE__`.

---

## Phase 3 — Runtime

Gate B must have passed; follow [Boundaries and prohibitions](#boundaries-and-prohibitions-agents-must-read--violation-means-going-out-of-bounds) · the credential-free mock strategy.

Set `"runtimeMode": "depth" | "coverage" | "both"` in `config.json` (template in reference).

### Hook and stub (shared by depth + coverage)

| Layer | Scope | Purpose |
|---|---|---|
| L1 precise | auth/permissions/bootstrap stubs | Pass first-screen auth |
| L2 negative fix-up | All JSON responses | Not-logged-in code → success |
| L3 fallback | `/api` etc. not matched by L1 | Empty success body to pry open the UI |

- **depth**: fake auth + `forward` to patch business codes + `stubs`; iterate `routes` (hash/history); produce `runtime_api.json`
- **coverage**: inject `preload.js` at **document-start** (CDP `addScriptToEvaluateOnNewDocument` or a Userscript)

Verify: `window.__API_RECON_PRELOAD__` exists; business paths do not fall back to `/login`.

```bash
cd recon && npm install
node runtime_harvest.js config.json
```

### 3b — Coverage dynamic enumeration (mandatory)

1. Main nav/sidebar — click each item, wait 1–3s for the network
2. Tabs — `role=tab`, `.ant-tabs-tab`
3. Tables — first-row view/edit/detail
4. Toolbars — export, filter, create (**avoid irreversible deletes**)
5. On entering each module — merge APIs/routes
6. SPA — controlled `pushState` for paths not covered by `routes.txt` (forbidden for MPA)

**Parameter trigger matrix** (mandatory): record once per operation type per module and **diff the multiple samples**:

| Operation | Parameters usually gained |
|---|---|
| List first screen | Pagination + default filters |
| Click search | keyword, filter |
| Advanced filter | More optionals |
| Create/edit | Full entity |
| Bulk/export/sort | `ids[]`, `exportType`, `sortField` |

**Under stubs the outbound body/headers are still real** — the request is the source of truth. Recording → `scan_raw.json`, `param_samples.json`, `api_detail.json`.

- **Vue**: `neutralizeVueRouter: true` + document-start preload
- **React**: `routes.txt` + sidebar clicks + `pushState`
- **both**: 3a depth first, then 3b coverage

---

## Phase 4 — Permission tree restoration

**Trigger**: blank module pages / only bootstrap (e.g. locale) per route → the content gate has not passed.

| Symptom | Meaning |
|---|---|
| Successfully inside the shell | Render gate + interceptor gate passed |
| Sidebar items missing/blank on click | Incomplete stub shape or permission codes |
| Same and very few APIs per route | `v-if permission` not passing |
| `routes.txt` far smaller than the bundle | Must be completed from the auth module |

```bash
grep -rhoaE '"/api[^"]*(permission|perm|role|menu|acl)[^"]*"' OUTDIR/js/*.js | sort -u | head -30
grep -rhoaE 'userRouteAuth|getResultTree|routeMap|routeLink|menuList|authList' OUTDIR/js/*.js | head -20
```

Typical chain: `role_permissions` (flat codes) + `permissions/all` (tree) → `getResultTree` → `userRouteAuth[CODE].url`.

```bash
python3 recon/extract_route_map.py recon/js recon/
python3 recon/build_perm_tree.py recon/js recon/ --config recon/config.json
```

Intermediate outputs: `route_map.json`, `userRouteAuth.json`, `permissions_tree.json`, `*_stub.json`, `perm_codes_all.txt`.

Stub checks: the outer `response_code` matches the interceptor gate; flat codes align with the tree; `routes` covers every link in `route_map`.

After updating `config.json`, **rerun Phase 3**. For large SPAs tune `waitUntil`, `routeTimeout`, `perRouteMs` (see reference sections A3/I).

---

## Phase 5 — Merge and report

### Output table

| File | Phase | Content |
|---|---|---|
| `js/`, `api_static.txt`, `routes.txt`, `chunkmap.txt` | 1 | Static bundle and paths |
| `param_candidates.json` | 1b | Static parameter field candidates |
| `config.json` | 2 | Three gates + runtime configuration |
| `runtime_api.json` | 3a | Detailed depth recording (incl. WS/SSE) |
| `param_samples.json`, `scan_raw.json`, `api_detail.json` | 3b | Multi-samples, click logs, detail |
| `route_map.json` etc. | 4 | Permission-tree intermediates (if executed) |
| `params_merged.json` | 5 | Merged parameter fields + confidence |
| `api_merged.txt` | 5 | `METHOD /path [params] [static\|runtime\|both]` |
| `site_map.json` | 5 | Routes, APIs, params, feature points, limitations |
| **insert_assets** | 5 | Write all service and endpoint assets into the asset store |

### 5b — Parameter merging

Diff from `param_samples.json`; there is **no universal merge script**. Confidence rules are in reference J7 (high/medium/low/awaiting-trigger).

### 5c — Error-driven inference

Within the authorized scope you may send incomplete requests to read 400s (**this is parameter recon, not vulnerability testing**): `field 'x' is required`, enum errors, etc. Watch for `data` wrapping, `variables`, and pre-encryption `bizData`.

The report must state: runtimeMode, static/runtime API counts, parameter confidence, uncovered modules, and a `CHANGES.md` summary relative to the reference scripts.

Suggested `site_map.json` structure:

```json
{
  "site": "https://example.com",
  "runtimeMode": "both",
  "appType": "vue-spa",
  "routeGuardStrategy": ["nav-neutralize", "L1-auth", "L2-patch", "forward"],
  "apisFromStatic": [],
  "apisFromRuntime": [],
  "apis": [],
  "params": [{ "method": "POST", "path": "/api/user/list", "transport": "json", "fields": [] }],
  "frontendRoutes": [],
  "routesVerifiedByClick": [],
  "featuresTriggered": [],
  "limitations": ""
}
```

More fields and grep recipes in [reference.md](reference.md).

---

## General notes

- **Framework-agnostic**: webpack/Vite/Angular lazy loading works the same way
- **Transport**: REST/JSON, GraphQL, WebSocket, SSE; gRPC-web is out of scope
- **SSR**: client-side fetch is recordable; RSC/Server Actions are not fully enumerable
- **Blind spots**: JSVMP, WASM, strict HMAC/mTLS → static + note limitations
- **Parameter blind spots**: conditional coupling, hidden params, WASM payload assembly → "awaiting trigger" / "unreachable"
- **Static is the safety net**: when runtime is blocked, static can still enumerate endpoints

---

## Additional resources

- Grep recipes, `config.json` template, troubleshooting, hooks, parameter reverse engineering section J, site_map template: **[reference.md](reference.md)**
- Reference script paths are in the [Scripts and gates](#scripts-and-gates) table
