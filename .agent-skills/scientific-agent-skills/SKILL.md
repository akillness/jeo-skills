---
name: scientific-agent-skills
description: >
  Audit, inventory, route, selectively install, and safely refresh the
  K-Dense-AI/scientific-agent-skills collection for scientific packages,
  databases, lab integrations, research methods, and publication workflows.
  Use when the user names Scientific Agent Skills, K-Dense scientific skills,
  or that repository; needs the correct upstream sub-skill; wants a pinned
  subset installed or refreshed; or needs provenance, license, collision, and
  security review before adoption. Inspect the real skill tree and each
  selected license. Never wholesale-vendor the pack, and do not copy or adapt
  its proprietary Anthropic-derived docx, pdf, pptx, or xlsx folders. Require
  separate approval before dependency installation, credential use, paid APIs,
  cloud jobs, lab hardware, clinical outputs, or publication. Route ordinary
  paper pipelines to `academic-research`, general web research to
  `deep-research`, figures to `paperbanana`, and scientific LLM evaluation to
  `scientific-llm-benchmarks`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Pack auditing needs Python 3.10+ and Git. Selective installation uses an
  Agent Skills-compatible installer. Individual upstream skills may require
  uv, different Python versions, scientific packages, API credentials, cloud
  accounts, licensed data, or laboratory hardware.
license: MIT
metadata:
  tags: scientific-agent-skills, k-dense, science, research, agent-skills, skill-pack, bioinformatics, cheminformatics, laboratory, selective-install
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/K-Dense-AI/scientific-agent-skills
---

# Scientific Agent Skills

Use this skill as the safe discovery, provenance, routing, and selective-install
front door for
[K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills).
The upstream repository is a large collection of independent scientific skills,
not one scientific runtime. Do not load, copy, or install every folder merely
because the repository was named.

The audited snapshot is release `v2.65.0`, commit
`f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f`. It contains 163 directories with a
`SKILL.md`. Treat that count as a pinned observation, not a permanent fact.
Re-audit a newer tag or commit before quoting its inventory.

## When to use this skill

- Inspect, pin, route, selectively install, refresh, or troubleshoot the named
  K-Dense scientific skill collection.
- Choose one narrow upstream owner for a scientific package, database, method,
  lab platform, analysis workflow, or communication artifact.
- Review frontmatter, support files, executable helpers, dependencies,
  credentials, network destinations, licenses, and destination collisions
  before installation.
- Compare a local selection with a newer explicit upstream tag or commit.
- Separate instruction-file installation from the scientific, cloud, clinical,
  publication, or hardware action that an installed skill later proposes.

Do not use this wrapper for nearby jobs that already have a local owner:

- End-to-end scholarly discovery, writing, review, and publication:
  `academic-research`.
- General web investigation and structured evidence collection:
  `deep-research`.
- Drafting or revising a research paper: `research-paper-writing`.
- Academic diagrams and publication figures: `paperbanana`.
- Scientific reasoning benchmark selection: `scientific-llm-benchmarks`.
- Existing local Word, PDF, PowerPoint, or Excel work: the local `docx`, `pdf`,
  `pptx`, or `xlsx` skill. Never replace those with the restricted upstream
  copies.

## Instructions

### Step 1: Pick one operating mode

| Mode | Use when | Default result |
|---|---|---|
| `audit` | provenance, inventory, licenses, structure, risk signals | read-only report |
| `route` | choose the narrowest upstream owner | one named skill and rationale |
| `install` | add a reviewed subset | collision-checked install plan |
| `refresh` | compare an installed subset with a newer pin | bounded diff and migration plan |
| `operate` | use an already installed scientific skill | action plan with domain gates |
| `troubleshoot` | installer, dependency, API, or runtime failure | first failing contract |

Do not blend `install` with `operate`. Installing instructions does not approve
package installation, data upload, an API call, a cloud job, laboratory control,
or a clinical or publication output.

### Step 2: Establish provenance and the license boundary

1. Prefer an existing trusted checkout. Otherwise clone to a staging directory.
2. Record the exact commit and origin. Never treat moving `main` as a pin.
3. Verify the root MIT notice and inspect every selected skill's own `license`
   field and bundled license file.
4. Run the bundled helper without executing any upstream skill script:

```bash
python3 .agent-skills/scientific-agent-skills/scripts/audit-pack.py doctor \
  --repo /path/to/scientific-agent-skills \
  --expect-commit f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f \
  --format json
```

The helper reads files and Git metadata only. It reports tree, README, and
`docs/skills.md` inventory counts, frontmatter, support-code volume, declared
licenses, symlinks, and coarse risk signals. A risk hit is a review lead, not
proof that a skill is malicious or safe. At the audited pin, `WARN` is expected:
the real tree and README report 163 skills, while `docs/skills.md` lists 162 and
omits `waypoint-bio`.

Four folders are a hard redistribution boundary at the audited pin:
`docx`, `pdf`, `pptx`, and `xlsx`. Their bundled Anthropic terms prohibit
retaining, copying, deriving, and redistributing the materials outside the
allowed services. Do not copy, adapt, install through this wrapper, or publish
them in jeo-skills. Route those formats to the existing local skills.

`pacsomatic` has a separate MIT notice from Beifang Niu. Other skills can also
declare licenses that differ from the repository root. Preserve the selected
folder's actual attribution and terms.

Read [source audit and risk](references/source-audit-and-risk.md) before any
copy or install decision.

### Step 3: Route to one narrow upstream skill

Use [catalog and routing](references/catalog-and-routing.md) as the pinned
inventory. Common lanes include:

| Intent | Likely upstream owner |
|---|---|
| single-cell RNA-seq | `scanpy`, `anndata`, `scvi-tools`, or `scvelo` |
| bulk RNA-seq | `bulk-rnaseq` or `pydeseq2` |
| sequence and genomic files | `biopython`, `pysam`, `bids`, or `genomic-coordinates` |
| chemistry and drug discovery | `rdkit`, `deepchem`, `medchem`, `datamol`, or `diffdock` |
| scientific databases | `database-lookup`, `depmap`, `primekg`, or a named database skill |
| statistics and uncertainty | `statistical-analysis`, `statistical-power`, `pymc`, or `uncertainty-and-units` |
| experiment or hypothesis design | `experimental-design`, `hypothesis-generation`, or `scientific-critical-thinking` |
| literature and citations | `literature-review`, `citation-management`, `paper-lookup`, or `pyzotero` |
| scientific writing or peer review | `scientific-writing`, `peer-review`, or `venue-templates` |
| cloud or lab integrations | the exact named integration, after account and hardware review |

Select by the user's actual input, output, scientific domain, and execution
surface. Do not load several overlapping skills as a substitute for deciding.
If the request is a general research pipeline rather than operation of the
K-Dense pack, use the local route-out instead.

### Step 4: Preview a selective installation

Use a detached or clean checkout at the reviewed pin:

```bash
git clone --filter=blob:none \
  https://github.com/K-Dense-AI/scientific-agent-skills.git \
  /path/to/scientific-agent-skills
git -C /path/to/scientific-agent-skills checkout \
  f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f

# Read-only inventory from the reviewed checkout
npx --yes skills@1.5.23 add /path/to/scientific-agent-skills \
  --list --full-depth

# Read-only destination and license/collision plan
python3 .agent-skills/scientific-agent-skills/scripts/audit-pack.py plan \
  --repo /path/to/scientific-agent-skills \
  --target /path/to/agent/skills \
  --skill scanpy \
  --format json
```

The plan never creates the target. It blocks unknown names, invalid
frontmatter, existing destinations, and the four restricted document folders.
Do not use `--all` as a shortcut: it crosses license boundaries, adds excessive
standing context, and hides dependency conflicts.

### Step 5: Install only the reviewed subset

After the source, selected names, target, collision report, licenses, copy mode,
and rollback are reviewed, install only those names:

```bash
npx --yes skills@1.5.23 add /path/to/scientific-agent-skills \
  --skill scanpy anndata \
  --global --agent universal --yes --copy --full-depth
```

The upstream also documents `gh skill install` with a tag or SHA pin. Use it
only if that extension is installed and its help output confirms the current
syntax. Never turn an unavailable installer into an excuse to fall back to an
unpinned branch or a partial `SKILL.md`-only copy.

Preserve the complete selected directory, except content that the license does
not permit. Support files, scripts, templates, and local references are part of
the reviewed unit. See [installation and lifecycle](references/install-and-lifecycle.md).

### Step 6: Keep dependencies isolated

The upstream collection intentionally spans incompatible scientific stacks.
Do not install every package into one environment. For each selected skill:

1. read its pinned Python and system requirements;
2. create a project or task-specific environment;
3. preview package changes and trusted indexes;
4. verify GPU, compiler, Java, MATLAB, Conda, CUDA, or platform constraints;
5. record packages and versions actually installed;
6. keep credentials outside committed files and logs.

A successful skill-file install proves only discovery. It does not prove that
its scientific runtime, dataset, API, model, or hardware path works.

### Step 7: Reconfirm before scientific or external side effects

Require a separate reviewed scope before any of these actions:

- installing, upgrading, or removing packages, interpreters, drivers, or system
  tools;
- using API keys, tokens, service accounts, paid search, models, or databases;
- uploading private, patient, genomic, proprietary, or unpublished data;
- launching billed cloud, GPU, scheduler, or long-running autonomous jobs;
- controlling a robot, liquid handler, microscope, instrument, or laboratory
  platform;
- creating or changing ELN, LIMS, Benchling, DNAnexus, Latch, OMERO,
  protocols.io, or similar remote records;
- generating treatment, diagnosis, or patient-specific clinical guidance;
- submitting a manuscript, grant, protocol, report, or other external artifact.

Clinical and genomic skills are research aids. They do not diagnose or replace
qualified professional judgment. Preserve uncertainty, provenance, and the
human decision owner.

### Step 8: Verify and report

For every installed selection, verify:

1. destination path and non-empty `SKILL.md`;
2. frontmatter name equals the directory;
3. support links resolve and no unexpected symlink escapes the folder;
4. installed bytes match the reviewed checkout;
5. exact source commit and selected license are recorded;
6. no unrelated local skill changed or disappeared;
7. one representative prompt selects the intended owner;
8. runtime checks are reported separately from instruction-file installation.

For refreshes, compare old and new pins before replacing anything. Re-run the
license and risk audit because upstream triggers, scripts, dependencies, and
terms can change independently.

## Examples

### Example 1: Audit the collection

Request: "K-Dense scientific-agent-skills 실제 목록과 라이선스부터 확인해줘."

Choose `audit`. Pin the checkout, run `doctor`, report the live tree and license
exceptions, and stop before installation.

### Example 2: Install a single-cell lane

Request: "K-Dense 팩에서 Scanpy와 AnnData만 프로젝트에 넣어줘."

Choose `install`. Plan `scanpy` and `anndata`, inspect their BSD licenses and
runtime requirements, check collisions, and install only after the exact target
is reviewed.

### Example 3: Block restricted document copies

Request: "그 저장소의 docx, pdf, pptx, xlsx를 우리 카탈로그에 복사해줘."

Do not copy or derive them. Name the bundled Anthropic restrictions and route
the requested file work to the existing local document skills.

### Example 4: Gate laboratory execution

Request: "opentrons-integration을 깔고 이 프로토콜을 로봇에서 바로 돌려."

Separate installation from operation. Confirm robot model, deck layout,
labware, liquids, simulation, credentials, physical supervision, abort path,
and explicit execution approval before any live command.

### Example 5: Route a generic paper request away

Request: "논문 주제 조사부터 원고와 리뷰 대응까지 끝내줘."

Use `academic-research`, not this pack wrapper, unless the user explicitly asks
to source one named K-Dense skill.

## Best practices

1. Treat the real pinned `skills/` tree as the inventory authority.
2. Prefer one narrow owner and a pinned subset over a full bundle.
3. Inspect each selected license; repository-level MIT is not universal.
4. Never copy or adapt the restricted Anthropic document folders.
5. Rewrite broad activation language when adapting any permissible workflow so
   it does not compete with the whole local catalog.
6. Treat upstream security reports as review queues, not safety certificates.
7. Review remote-authority claims and untrusted web/data ingestion before use.
8. Keep scientific dependencies isolated by project and interpreter.
9. Keep secrets, patient data, private datasets, and unpublished results out of
   prompts, logs, commits, and public services unless explicitly authorized.
10. Separate installation evidence from scientific validity and external action
    evidence.
11. Re-audit moving upstream content before every refresh.
12. Preserve attribution, source commit, and rollback information.

## References

- [Pinned catalog and routing](references/catalog-and-routing.md)
- [Installation and lifecycle](references/install-and-lifecycle.md)
- [Source audit and risk](references/source-audit-and-risk.md)
- [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)
- [Pinned upstream commit](https://github.com/K-Dense-AI/scientific-agent-skills/tree/f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f)
- [Agent Skills specification](https://agentskills.io/specification)
