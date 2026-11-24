# hardening — operator approval for third-party code

Opt-in intercept rules that pause the agent and ask the operator before it
**acquires** third-party code — downloads from code/exploit hosts, `git clone`,
package installs, and remote content piped straight into a shell — plus a
`third-party-code-review` skill that tells the agent to hash, blocklist-check,
read and summarize the code before running it.

These rules are **not** seeded by the application; nothing changes until you
apply them. Code the agent writes itself is not gated — only the point where
untrusted code enters.

Apply (idempotent; restarts the `artex` service so the interceptor reloads its
rule cache):

    ./hardening/apply-intercept-rules.sh

Requests show up under Intercept → pending in the console. With no decision in
30 minutes the request is denied (the agent gets the refusal and takes another
path). Change the timeout or action in the console or in `intercept-rules.sql`.

## What this is and is not

- **Priority.** The rules are priority 70-72, **below** the built-in destructive
  denies (80/90/100). `intercept.Match` returns the first rule in priority-DESC
  order, so a command that is also destructive (e.g. `pip install x && curl -X
  DELETE ...`) still hits the built-in DELETE deny first instead of being
  downgraded to an approval.
- **Tripwire, not a boundary.** The regexes match the raw `tool_input` JSON on a
  best effort. They have bypasses and false positives — listed in
  `skills/third-party-code-review/SKILL.md`. The real control is the human
  decision on what they catch; the skill is what makes the agent behave when they
  do not.
- **One enforced rule.** Reading `/app/keys/*`, `/proc/<pid>/environ`, or the DSN
  is a `deny` (not an approval). The SHA-256 blocklist and the rest are agent
  discipline.
- **Target-only mode.** Where the run uses target-only tool mode, only the
  built-in rules are consulted and these are not; the skill still binds the agent.

## Tests

`hardening/rulecheck_test.go` parses the `[hardening]` rules straight from
`intercept-rules.sql`, runs them through `intercept.Match` (Go RE2), and
asserts the positive matches, closed bypasses, documented open bypasses/false
positives, and priority precedence below the built-in destructive denies:

    go test -v ./hardening
