# php2shell — CVE-2026-109618 / CVE-2026-109619 Research

Independent security research on the critical PHP session.upload_progress vulnerabilities (CVSS v4.0 9.2).

**Author:** Qi Deng ([@ikow](https://github.com/ikow))  
**Date:** 2026-10-21  
**Full writeup:** [qideng.substack.com](https://qideng.substack.com/)

## Overview

Two critical pre-auth RCE vulnerabilities in PHP core's `session.upload_progress` handler, affecting PHP 5.4.0 through 8.5.x. This repository contains verification POCs and lab setup for authorized security testing.

### Verified Attack Chains

| Chain | Type | Conditions | Verified |
|-------|------|-----------|----------|
| Session File Injection + LFI | Logic bug | `upload_progress=On` (default) + app LFI | ✅ RCE |
| var_destroy UAF → Handler Overwrite | Memory corruption | `unserialize()` + `/proc/self/mem` | ✅ ASAN + RCE |
| Handler Mismatch → `__destruct` | Deserialization | Cross-dir handler mismatch + POP gadget | ✅ RCE |

### Key Findings

1. **Session fixation** via POST body bypasses `session.use_only_cookies` ([PR #22113](https://github.com/php/php-src/pull/22113))
2. **Unvalidated filename** in upload_progress stored raw in session files
3. **`var_destroy` `__destruct` reentry UAF** — ASAN-confirmed heap-use-after-free
4. **`PS(serializer)` not reset in RSHUTDOWN** — cross-request serializer leak in FPM
5. **`__destruct` fires on decode FAILURE** — object injection via handler mismatch + trailing data

## Repository Structure

```
poc/
  verify_session_injection.py   — Verify filename injection into session files
  verify_uaf_asan.php           — Trigger ASAN heap-use-after-free (var_destroy)
  verify_handler_mismatch.py    — Verify handler mismatch → object deserialization
lab/
  docker-compose.yml            — PHP 8.2.34 FPM + nginx lab environment
  Dockerfile                    — Vulnerable PHP build
  php.ini                       — Lab configuration
  setup.sh                      — One-click lab setup
docs/
  ANALYSIS.md                   — Full technical analysis
```

## Quick Start

```bash
# Start the lab
cd lab && ./setup.sh

# Verify session injection
python3 poc/verify_session_injection.py --target http://127.0.0.1:18080

# Verify UAF (requires ASAN build)
docker exec php-asan-lab php poc/verify_uaf_asan.php

# Verify handler mismatch
python3 poc/verify_handler_mismatch.py --target http://127.0.0.1:18080
```

## Affected Versions

- PHP 5.4.0 — 8.5.11 (all versions with `session.upload_progress`)
- Fixed in: 8.2.35, 8.3.36, 8.4.27, 8.5.12 (scheduled 2026-10-21)
- PHP 5.x, 7.x, 8.0, 8.1: **end-of-life, no official fix**

## Mitigation

```ini
; Immediate mitigation (does NOT fix all attack paths)
session.upload_progress.enabled = Off
session.use_only_cookies = On
```

## Disclaimer

This research is for authorized security testing and educational purposes only. Do not use against systems you do not own or have explicit authorization to test.

## License

MIT
