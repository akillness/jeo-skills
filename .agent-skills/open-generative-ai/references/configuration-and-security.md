# Configuration and Security

## The MuAPI access key

The app is BYOK. There is no server-side key: the user pastes a MuAPI access key
into the UI, it is stored in browser `localStorage`, and it is sent as the
`x-api-key` header on every generation.

### Entering it correctly

Paste the generated key **value**. MuAPI's console shows a key *name/label*
beside it, and pasting the label is a common cause of a 401 that looks like a
broken install.

### Handling it safely

1. Never print, echo, log, screenshot, or commit the key. Report presence and
   validity, never the value.
2. `localStorage` is readable by any JavaScript on the origin. The shipped CSP
   allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, so any XSS on
   that origin is full key disclosure.
3. Do not deploy the UI on a shared, multi-tenant, or public origin while a key
   is stored in it.
4. Rotate the key in the MuAPI console after any exposure. There is nothing to
   rotate inside the app — clearing site data only removes the local copy.
5. Every generation bills the key owner. Confirm before batch or video runs.

## Request routing

`middleware.js` rewrites these prefixes to `https://api.muapi.ai`:

- `/api/v1` (except `/api/v1/creative-agent`, `/api/v1/get_upload_url`, and
  `/api/v1/upload-binary`, which have dedicated handlers)
- `/api/app`
- `/api/workflow`

The client (`packages/studio/src/muapi.js`) picks its base URL by context: an
http(s) browser goes through `/api` so the host app proxies server-side and
avoids CORS, while SSR and Electron's `file://` renderer call `api.muapi.ai`
directly.

**Consequence:** a reachable web deployment is an open proxy to a paid upstream
API. It does not leak a shared server key — callers supply their own — but it
does let anyone route traffic through your host, and your host's IP is what MuAPI
sees. Keep it on loopback, behind a reverse proxy with authentication, or on a
private network.

Generation follows submit-then-poll: `POST /api/v1/{model-endpoint}`, then
`GET /api/v1/predictions/{request_id}/result` until `completed`.

## Security headers

`middleware.js` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a CSP.

The CSP permits `'unsafe-eval'` and `'unsafe-inline'` in `script-src`, which is
what makes the `localStorage` key material a real risk rather than a theoretical
one. `connect-src` allows `https://muapi.ai` and `https://*.muapi.ai` — the
wildcard is deliberate, since generated media and thumbnails come from
`cdn.muapi.ai` and sibling subdomains.

Do not "fix" the CSP by narrowing `connect-src` to `api.muapi.ai`; that breaks
media rendering. If tightening is required, remove `'unsafe-eval'`/`'unsafe-inline'`
and verify the studios still load.

## Upload proxy

`app/api/upload-binary/route.js` requires an API key, validates the proxy target,
and rejects dangerous file types before forwarding to S3.
`src/lib/uploadProxyTarget.js` implements SSRF defenses: hostname normalization,
IP-literal detection, private/reserved IPv4 blocking, and an allowlist from
`UPLOAD_PROXY_ALLOWED_HOSTS`.

Blocked file types exist to stop HTML/SVG/executable uploads. Do not disable
`isBlockedFileType` to make an upload work — pick a supported format instead.

Set `UPLOAD_PROXY_ALLOWED_HOSTS` explicitly when self-hosting behind egress
controls; leaving it empty relies solely on the built-in rules.

## Electron posture

`electron/main.js` is configured correctly and should stay that way:

| Setting | Value |
|---|---|
| `webSecurity` | `true` |
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| preload | `electron/preload.js` |
| `setWindowOpenHandler` | denies in-app windows, opens externally |

Do not enable `nodeIntegration` or disable `contextIsolation` while debugging a
renderer issue. On Linux the app appends `--disable-dev-shm-usage`; that is a
container-friendly flag, not a sandbox weakening.

## Environment variables

| Variable | Effect |
|---|---|
| `OPEN_GENERATIVE_AI_LOCAL_AI_DIR` | overrides the local-AI root (`bin/`, `models/`, `tmp/`) |
| `UPLOAD_PROXY_ALLOWED_HOSTS` | comma-separated upload-proxy host allowlist |
| `NODE_ENV` | `production` in the Docker runner stage |

There is no `.env` for the API key — it lives in browser storage by design. If a
deployment needs a server-held key, that is a code change, and it makes the
deployment a shared-credential proxy that must then be authenticated.

## Pre-exposure checklist

Before any deployment reachable beyond loopback:

- [ ] Authentication in front of the app, or a private network boundary
- [ ] `UPLOAD_PROXY_ALLOWED_HOSTS` set deliberately
- [ ] No key committed, logged, or baked into an image
- [ ] Cost ownership understood — who pays for traffic through this host
- [ ] Content responsibility understood — the operator owns what users generate
