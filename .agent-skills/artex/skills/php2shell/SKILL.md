---
name: php2shell
description: "Invoke this skill when a task holds an LFI/file-inclusion finding on a PHP target (or needs to assess one) and the target may run PHP 5.4-8.5.11 with default session.upload_progress settings: turns a read-only LFI into verified RCE via the session-file-injection chain (CVE-2026-109618/109619), lab-first and gated by program policy. Also covers passive detection of the vulnerable configuration."
---

# php2shell: session.upload_progress LFI-to-RCE (CVE-2026-109618/109619)

Under an **authorized** engagement only. This skill upgrades an existing
LFI/unsafe-include finding on a PHP target into RCE, or classifies the target
as not affected, using the vendored PoCs under `scripts/poc/php2shell/`
(upstream: ikow/php2shell-poc, MIT; see the LICENSE there).

## Hard gates (read before touching any target)

1. **Authorization**: the target must be inside the task's authorized scope.
2. **Program policy first**: many programs exclude or do not pay for
   recently-patched third-party/framework zero-days within ~14 days of the
   patch release. PHP patched these in 8.2.35/8.3.36/8.4.27/8.5.12
   (2026-10-21). CHECK the program's policy on component zero-days BEFORE
   testing a live target, and reflect the policy in how the finding is claimed
   (often "reportable, not payable" or payable only after the clause lapses).
3. **Detection before exploitation**: fingerprint passively first (response
   headers, error pages, X-Powered-By). Only targets on PHP 5.4.0-8.5.11
   (any build with session.upload_progress enabled, the default) are
   candidates.
4. **Lab first**: run chain 1 against the local lab (`lab/setup.sh` builds a
   vulnerable PHP 8.2 FPM+nginx environment) until the mechanism is
   understood, then one-shot the authorized target.
5. **Chains 2 and 3 (var_destroy UAF, serializer mismatch) are LAB-ONLY**:
   never fire memory-corruption or serializer-confusion primitives at a
   remote target. Detection of their preconditions is fine.
6. **One-shot verification** on the target: prove execution once (a marker
   echo), capture evidence, stop. No persistence, no further exploration
   through the shell.

## Chain 1 workflow (session file injection + LFI -> RCE)

1. Start with the task's LFI finding: note the include path parameter and its
   constraints (prefix/suffix, truncation, wrapper filters).
2. Confirm the session path is reachable through that LFI: with
   `session.upload_progress.enabled=On` (default), an in-flight multipart POST
   with an attacker-named file field writes a session file under the session
   save path containing the raw filename.
3. Inject PHP into the uploaded **filename** (not the file content):
   `verify_session_injection.py` demonstrates the full mechanics (session
   fixation via POST body PHPSESSID, raw filename storage, inclusion).
4. Race the session file's lifetime: include it through the LFI while the
   upload is still in flight (or keep the upload connection open).
5. Verify RCE with a single marker command; record the request sequence as
   evidence.

## Detection without an LFI

The chains need an app-level file-inclusion primitive; without one the
configuration is hardening-relevant, not exploitable. Report posture only.

## Vendored artifacts

- `poc/verify_session_injection.py` - chain 1 end-to-end against a lab URL
- `poc/verify_handler_mismatch.py` - chain 3 (lab only)
- `poc/verify_uaf_asan.php` - chain 2 under an ASAN PHP build (lab only)
- `lab/setup.sh` - builds the vulnerable docker lab locally
- `docs/ANALYSIS.md`, `README.upstream.md` - the upstream technical writeup
