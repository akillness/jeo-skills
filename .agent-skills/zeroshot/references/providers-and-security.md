# Providers, credentials, isolation, and trust boundaries

## Provider registry is live authority

At the audited commit, the established Node product supported Claude, Codex,
Gateway, Gemini, OpenCode, Pi, OMP, Kiro, and Copilot. Provider capabilities differ
across:

- worktree isolation;
- Docker isolation;
- streaming JSON;
- model levels and reasoning effort;
- provider-native structured output;
- session continuation;
- MCP injection;
- native web search.

Use these commands before a run:

```bash
zeroshot providers
zeroshot settings get defaultProvider
zeroshot settings get defaultIsolation
zeroshot settings get defaultDelivery
```

Do not assume a provider supports a flag because another provider does. Do not add a
new provider id for an OpenAI-compatible model endpoint; the Node architecture routes
those endpoints through the bundled `gateway` provider.

## Explicit permission and cost

A ZeroShot run can start several provider processes and repeat work after validator
rejection. `resume`, a custom cyclic workflow, and a schedule can spend more. Before
execution, state:

- provider and model or level;
- maximum workers and workflow shape;
- whether web search or another network tool is enabled;
- iteration or retry ceiling;
- isolation and credentials exposed to it;
- delivery side effects;
- the approved cost or time ceiling.

Never infer permission from provider authentication, a saved default, an existing run,
or the user asking for a plan. Permission must cover the actual execution.

## CLI-backed authentication

For CLI-backed providers, the provider CLI owns login, key storage, refresh, model
catalogs, and account limits. Prefer its normal login or password-manager flow. Never
ask the user to paste provider passwords, session cookies, or long-lived keys into a
prompt or repository.

Presence checks must print only `SET` or `MISSING`, never a credential value. The
bundled `doctor` follows that rule:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh doctor /path/to/repo
```

A CLI being installed and authenticated does not prove its backend is reachable, its
account has credit, or the requested model exists. Keep local capability, account
access, network reachability, and run success as separate claims.

## Bundled Gateway provider

Gateway wraps OpenAI-compatible or Anthropic-compatible model APIs with a ZeroShot-owned
tool runner. It is not another CLI-backed provider. Its settings can include:

- protocol and base URL;
- API key;
- model id;
- optional headers;
- maximum tokens for Anthropic-compatible endpoints;
- required `toolPolicy.roots` and `toolPolicy.commands`.

There is no default file or shell access. Keep roots to the selected isolated workspace
and commands to the smallest required executables. Do not point a tool root at a home
directory or broad filesystem merely to avoid a permission error.

Because Gateway configuration can contain an API key, do not claim that all ZeroShot
lanes avoid storing provider keys. Keep its settings file private, do not commit it, and
never print it during diagnosis. Prefer environment or the provider's documented secret
flow when the live version supports it.

## Docker mounts and environment forwarding

Docker isolation is a filesystem boundary only after the effective mounts and
environment are reviewed. Node defaults include credential presets for `gh`, `git`, and
`ssh`. Additional presets include cloud and infrastructure tools. The environment
passthrough syntax can select one variable, a prefix pattern, or an explicit value.

Safe procedure:

1. run `zeroshot setup plan --json`;
2. inspect Docker mount names and destination paths without reading secret contents;
3. remove every credential not needed by the run;
4. use `--no-mounts` for a credential-free run;
5. add a narrow explicit mount only when necessary, preferably read-only;
6. list environment variable names, not values;
7. confirm that the provider actually supports Docker;
8. approve the resulting plan before execution.

A mount such as a writable provider auth directory can let a container update refresh
tokens or other user-global state. Read-only is not always compatible with provider
refresh, but writable access must be a deliberate tradeoff.

Do not forward broad patterns such as `AWS_*` or `TF_VAR_*` without inspecting the names
that match. Do not set `--no-mounts` and then silently reintroduce credentials through
environment passthrough.

## Worktree is not a security sandbox

A worktree separates branch and checkout paths. The agent still runs as the user and can
reach host files, processes, credentials, and network services allowed by its provider
and tool policy. Use Docker or a more constrained host when the risk is not limited to
Git contamination.

The upstream worker rule allows Git operations only in isolation. Keep validators
focused on direct files and commands, not shared Git state.

## Native Rust runtime documents

A Rust runtime configuration is secret-free JSON. It declares environment variable
names in each agent binding. Do not put values into the document:

```json
{
  "harness": "codex",
  "provider": "openrouter",
  "size": "standard",
  "nodes": {
    "worker": {
      "kind": "agent",
      "model": "gpt-5.6-sol",
      "env": ["OPENROUTER_API_KEY"]
    }
  }
}
```

The submitting process is the credential source. Rust forwards only names declared by
the effective runtime. Review every `env` name and every executable graph node before a
run. `--uniform-runtime-config` expands one binding across all executable nodes; that
can widen credential exposure, so validate the materialized plan first.

Use `--validate-only` before submission:

```bash
zeroshot-rust run \
  --title 'Validate software-change graph' \
  --template software-change \
  --input input.json \
  --uniform-runtime-config runtime.json \
  --validate-only
```

Validation and materialization are not approval to submit.

## Named Rust targets and GH_TOKEN

Named-target runs forward `GH_TOKEN` when it is set for source checkout and Git delivery.
A provider receives it only when the runtime configuration explicitly declares
`GH_TOKEN`, but the target still receives it. Before a named-target run:

- identify target name and origin;
- identify repository and branch;
- decide whether checkout or delivery requires `GH_TOKEN`;
- unset it when not required;
- confirm that no provider node declares it accidentally;
- use a stable submission key for retry-safe submission;
- disclose that credentials cross the machine boundary.

Do not print the token or place it in input, graph, runtime JSON, logs, or screenshots.

## Direct and hosted target boundary

`zeroshot-rust target add NAME --url ORIGIN --direct` registers unauthenticated direct
access. A direct target is not a hosted authenticated target. Do not call it private
because the network is currently local.

`zeroshot-rust target serve` is unauthenticated when `--bootstrap-key-file` is omitted.
For local experiments bind to loopback. For any non-loopback exposure, require an
explicit authentication and network plan.

With a bootstrap key, target startup consumes and removes the key file. Create it as a
private regular file in a controlled directory, never as a symlink or repository file.
Verify the server became private before deleting any fallback material yourself.

The Python SDK's `DirectTarget` is also unauthenticated. Its docs explicitly keep hosted
authentication outside that client contract.

## Logs and evidence are sensitive

Node logs, trace exports, and semantic exports can include:

- exact prompts;
- raw provider output;
- tool calls and results;
- source snippets;
- issue and repository identifiers;
- environment names;
- errors from external services.

Do not paste or upload an export without reviewing its contents and destination. Use the
bundled `trace_summary.py` for a content-free structural report. It prints counts,
completeness, issue codes, and a digest, not prompts or event bodies.

Export files are create-only in the upstream trace and semantic contract. Choose a new
path. Never point an export at a provider log, symlink, credential file, or existing
evidence bundle.

## Vulnerability reporting

Do not open a public issue for a suspected ZeroShot vulnerability. The audited
`SECURITY.md` asks reporters to email `security@covibes.io` with description, steps,
impact, and an optional fix. Recheck the current policy before sending because contact
and support scope can change.
