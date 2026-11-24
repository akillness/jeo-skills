# php2shell — Full Technical Analysis

## CVE-2026-109618 / CVE-2026-109619
**Author:** Qi Deng  **Date:** 2026-10-21

---

## 1. Vulnerability Summary

Two critical vulnerabilities in PHP's `session.upload_progress` handler enable pre-authentication remote code execution on PHP 5.4.0 through 8.5.x.

| Bug | Root Cause | Impact |
|-----|-----------|--------|
| Session Fixation | `MULTIPART_EVENT_FORMDATA` accepts PHPSESSID from POST body ignoring `use_only_cookies` | Attacker controls session ID and file path |
| Filename Injection | `add_assoc_string_ex(*data->filename)` stores raw filename in session without validation | PHP code / serialized objects injected into session files |
| Serializer Leak | `PS(serializer)` not reset in `php_rshutdown_session_globals()` | Cross-request handler mismatch in FPM |
| var_destroy UAF | `i_zval_ptr_dtor` at line 310 fires `__destruct` without `BG(serialize_lock)` | Heap-use-after-free → arbitrary code execution |

## 2. Attack Chains

### Chain A: Session Injection + LFI → RCE

```
Conditions: upload_progress.enabled=On (default) + application has LFI
Complexity: Low | Reliability: 100%

1. POST multipart with PHP code in filename
2. rfc1867 handler stores filename as-is in session file  
3. include(session_file) → execute injected PHP → RCE
```

**Verified:** `exploit_session_inject.py` → `uid=33(www-data)` on PHP 8.2.34.

### Chain B: var_destroy UAF → RCE

```
Conditions: ability to call unserialize() with controlled data
Complexity: Medium | Reliability: ~60% (heap-dependent)

1. unserialize() payload with 2000+ entries → overflow VAR_ENTRIES_MAX (1018)
2. Duplicate key moves object to dtor list
3. var_destroy Phase 1: efree extension chunks
4. Phase 2: i_zval_ptr_dtor → __destruct (BG(serialize_lock)==0)
5. Inner unserialize('R:1500;') reuses outer var_hash → reads freed memory
6. Spray reclaims freed chunk → controlled pointer → handler overwrite → RCE
```

**Verified:** ASAN heap-use-after-free at `var_unserializer.c:851`. RCE via `var_dump` handler overwrite on x86-64.

### Chain C: Handler Mismatch → `__destruct` → RCE

```
Conditions: target has directories with different session.serialize_handler
Complexity: Medium | Reliability: High

1. Upload to Dir A (php_serialize) — filename contains |O:CLASS:N:{PAYLOAD}
2. Upload to Dir B (php handler) with same SID
3. rfc1867 reads php_serialize session with php decoder
4. php decoder finds | in filename → splits → deserializes injected object
5. Trailing data → decode FAILURE
6. __destruct fires during PHP_VAR_UNSERIALIZE_DESTROY cleanup
7. POP gadget chain → RCE
```

**Key insight:** `__destruct` fires on BOTH success and failure paths of `var_destroy`. The decode FAILURE does NOT prevent exploitation.

**Verified:** `Evil::__destruct(cmd="id")` → `uid=33(www-data)` via pure rfc1867 handler.

## 3. Root Cause Analysis

### 3.1 Session Fixation (ext/session/session.c)

```c
// MULTIPART_EVENT_FORMDATA handler — no use_only_cookies check
if (name_len == progress->sname_len && 
    memcmp(data->name, PS(session_name), name_len) == 0) {
    zval_ptr_dtor(&progress->sid);
    ZVAL_STRINGL(&progress->sid, (*data->value), value_len);
    // ← Accepts PHPSESSID from POST body regardless of use_only_cookies!
}
```

Fix: [PR #22113](https://github.com/php/php-src/pull/22113) adds `!PS(use_only_cookies) &&` check.

### 3.2 Unvalidated Filename

```c
// FILE_START handler stores raw filename
add_assoc_string_ex(&progress->current_file, "name", 
                    sizeof("name") - 1, *data->filename);
// ← No sanitization, no encoding, no length limit
```

Filename can contain arbitrary bytes including PHP code and pipe `|` characters.

### 3.3 var_destroy Reentry UAF (ext/standard/var_unserializer.re)

```c
void var_destroy(php_unserialize_data_t *var_hashx) {
    // Phase 1: FREE extension chunks
    while (var_hash) {
        efree_size(var_hash, sizeof(var_entries));  // ← line 245
        var_hash = next;
    }
    // Phase 2: walk dtor chain
    while (var_dtor_hash) {
        // ...
        i_zval_ptr_dtor(zv);  // ← line 310, NO serialize_lock!
        // __destruct fires → inner unserialize() → R:N reads freed chunk
    }
}
```

### 3.4 Serializer Leak (ext/session/session.c)

```c
static void php_rshutdown_session_globals(void) {
    // Resets: PS(id), PS(session_vars), PS(http_session_vars), PS(mod_data)
    // Does NOT reset: PS(serializer) ← persists across FPM requests!
}
```

### 3.5 `__destruct` on Decode Failure

```c
PS_SERIALIZER_DECODE_FUNC(php) {
    while (p < endptr) {
        // ... find |, deserialize value ...
        if (php_var_unserialize(...)) {
            php_set_session_var(name, &rv, &var_hash);  // object stored
        } else {
            retval = FAILURE; goto break_outer_loop;
        }
    }
break_outer_loop:
    PHP_VAR_UNSERIALIZE_DESTROY(var_hash);  // ← __destruct fires HERE
    return retval;  // FAILURE
}
```

Even though the decoder returns FAILURE and `session_start()` calls `php_session_cancel_decode()` to destroy `$_SESSION`, the object's `__destruct` has ALREADY fired during `var_hash` cleanup.

## 4. Version Matrix

| Version | upload_progress | Vulnerable | Official Fix |
|---------|----------------|------------|-------------|
| < 5.4 | No | No | N/A |
| 5.4 - 5.6 | Yes | Yes | EOL, no fix |
| 7.0 - 7.4 | Yes | Yes | EOL, no fix |
| 8.0 - 8.1 | Yes | Yes | EOL, no fix |
| 8.2.x | Yes | Yes | → 8.2.35 |
| 8.3.x | Yes | Yes | → 8.3.36 |
| 8.4.x | Yes | Yes | → 8.4.27 |
| 8.5.x | Yes | Yes | → 8.5.12 |

Vulnerable code identical across ALL versions from PHP 5.4.0 (2012) to present.

## 5. Detection

```bash
# Check PHP version
php -r 'echo PHP_VERSION, PHP_EOL;'

# Check upload_progress setting
php -r 'echo ini_get("session.upload_progress.enabled"), PHP_EOL;'

# Check for handler mismatch across directories
find /var/www -name ".user.ini" -exec grep -l "serialize_handler" {} \;

# Monitor for exploitation attempts
grep -r "PHP_SESSION_UPLOAD_PROGRESS" /var/log/nginx/access.log
```

## 6. Mitigation

```ini
; Primary mitigation
session.upload_progress.enabled = Off

; Additional hardening
session.use_only_cookies = On
session.use_strict_mode = On

; Ensure consistent handler across directories
session.serialize_handler = php_serialize
```

**Warning:** Disabling `upload_progress` does NOT fix the var_destroy UAF or the serializer leak. Apply the official PHP patch.

## 7. References

- [PHP Security Advisory](https://www.php.net/archive/2026.php) (pending)
- [PR #22113 — Session fixation fix](https://github.com/php/php-src/pull/22113)
- [Calif.IO — Serializable UAF](https://calif.io/research/php-uaf)
- [dinosn — var_destroy UAF](https://github.com/dinosn/php-8.5.5-var_destroy-uaf)
- [PHP Bug #71101 — Handler mismatch](https://bugs.php.net/bug.php?id=71101)
- [cnpanda — Handler mismatch exploitation](https://www.cnpanda.net/en/sec/580.html)
