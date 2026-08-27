# Installation and adaptation

## Why adaptation precedes installation

A skill file is not passive documentation. Once installed, it becomes policy
that an agent may follow. Solo Skills contains useful workflows and examples,
but many point to one author's homes, projects, hosts, accounts, channels,
credentials, schedules, voice data, and toolchain.

Do not copy the whole pack first and plan to clean it later. Review one selected
folder, adapt it in a separate checkout, validate it, and then install the
reviewed bytes.

## Pinned checkout

```bash
UPSTREAM="$HOME/.local/share/solo-skills"
if [ -e "$UPSTREAM" ]; then
  printf 'checkout exists; inspect it, do not overwrite: %s\n' "$UPSTREAM"
else
  git clone --filter=blob:none --no-checkout \
    https://github.com/bam-bam-2/solo-skills.git "$UPSTREAM"
fi

git -C "$UPSTREAM" fetch --depth 1 origin \
  d5789f592af17980054052fc7c05fe8a8e46be79
git -C "$UPSTREAM" checkout --detach \
  d5789f592af17980054052fc7c05fe8a8e46be79
```

These commands mutate disk and contact GitHub. Run them only after the user
selects the source and location. The bundled audit helper never clones, fetches,
installs, writes, or creates a destination.

## Read-only audit

```bash
python3 <installed-skill>/scripts/audit-pack.py doctor \
  --repo "$UPSTREAM" \
  --expect-commit d5789f592af17980054052fc7c05fe8a8e46be79 \
  --format json

python3 <installed-skill>/scripts/audit-pack.py inventory \
  --repo "$UPSTREAM" --format json

npx --yes skills@1.5.23 add "$UPSTREAM" --list --full-depth
```

At the audited pin, the helper sees 26 source folders and 24 valid
frontmatters. The real CLI independently discovers 24 and skips
`style-skill-creator` and `voice-dna-creator`.

## Portability worksheet

For every selected folder, record:

| Surface | Questions | Safe adaptation |
|---|---|---|
| identity and voice | Whose account, brand, voice samples, metrics, event, or audience is embedded? | replace with explicit inputs; remove unsupported claims and private samples |
| filesystem | Which `~`, absolute, project, vault, or adjacent-repo paths appear? | configuration variables with existence checks; no search across unrelated private trees |
| hosts | Which SSH aliases, OS, remote folders, ports, or services are assumed? | named host chosen by user; host-key and command preview; fail closed |
| recipients | Which user, guild, channel, DM, email, page, database, post, or chat is targeted? | explicit IDs resolved to human-readable identities and reviewed before action |
| credentials | Where are keys or tokens searched, and what scopes are assumed? | approved credential manager or one named environment variable; never print values |
| scheduler | What timezone, cadence, launchd label, cron entry, hook, or daemon persists? | explicit schedule, owner, logs, stop, unload, and removal path |
| providers | Which LLM, image, social, mail, CDN, browser, or API is called? | version, endpoint, data exposure, cost, rate limit, terms, and fallback decision |
| permissions | Does a command bypass sandbox, approvals, GUI permission, or Accessibility? | default off; remove bypass; separate explicit approval if absolutely required |
| mutation | Can it send, publish, archive, delete, install, or alter a remote system? | preview by default; exact confirmation; read-back and rollback |
| dependencies | Which tools, agents, scripts, references, templates, or repos are required? | preserve the complete folder and verify each dependency at task time |

Search matches are candidates, not proof. Read the surrounding instructions and
scripts before changing anything.

## Destination plan

```bash
python3 <installed-skill>/scripts/audit-pack.py plan \
  --repo "$UPSTREAM" \
  --target "$HOME/.agents/skills" \
  --skill humanize-korean \
  --format json
```

`READY` means only that the selected directory exists, its bounded frontmatter
checks pass, and the destination name does not exist. It does not certify the
skill as portable or safe to execute.

Known blockers at the pin:

| Name | Blocker | Default response |
|---|---|---|
| `harness` | name collision with the canonical jeo-skills harness | keep local canonical owner or use an isolated renamed adaptation |
| `style-skill-creator` | YAML parse failure and name `cw-style-skill-creator` differs from directory | wait for upstream fix or create a separately named, provenance-preserving adaptation |
| `voice-dna-creator` | YAML parse failure | wait for upstream fix or create a separately reviewed adaptation |

## Selective install

```bash
npx --yes skills@1.5.23 add /path/to/reviewed-solo-checkout \
  --skill humanize-korean \
  --global --agent universal --yes --copy --full-depth
```

Use the receiving host's real agent ID. `universal` is a jeo-skills shared-root
convention. Omit `--yes` when the tool's own prompt should remain a human gate.

Prefer copies over links for workflows with external actions. Record:

- original repository and commit;
- selected folders;
- adaptation diff and reviewer;
- target and agent scope;
- original and resulting names;
- MIT attribution;
- rollback location.

## Frontmatter repair policy

Do not edit the pinned upstream checkout in place and call it an official
install. A repair creates a derivative adaptation.

1. Copy only the selected folder into an adaptation branch or staging root.
2. Quote or fold YAML descriptions containing colon-space sequences.
3. Make frontmatter `name` match the final destination.
4. Keep name lowercase with hyphens and avoid a collision.
5. Record original commit and exact patch.
6. Run the receiving catalog's skill validator and the real Agent Skills CLI.
7. Review every support file before installation.

## Refresh and removal

For refresh, fetch a candidate into a separate checkout, re-run all audits,
diff the selected whole folders, review new scripts and external-action
surfaces, reapply or retire adaptations, and seek approval before replacement.

For removal, first identify project versus global scope and copy versus symlink:

```bash
npx --yes skills@1.5.23 list --global --json
npx --yes skills@1.5.23 remove --global --skill humanize-korean
```

Removing a skill does not undo sent messages, published posts, archived pages,
remote commands, provider charges, browser actions, launchd jobs, hooks, or
persistent agents. Those need separate product-specific rollback and read-back.
