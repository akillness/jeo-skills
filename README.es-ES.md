<div align="center">

<img src="assets/readme-cover.webp" alt="Ilustración de una biblioteca modular de habilidades: un enrutador turquesa selecciona algunas tarjetas de habilidades y las envía a hosts de agentes independientes" width="100%">

# jeo-skills

**Un catálogo categorizado de habilidades para agentes. Instala solo las habilidades que necesitas en los agentes que ya usas.**

[![Habilidades](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fakillness%2Fjeo-skills%2Fmain%2F.agent-skills%2Fskills.json&query=%24.skill_count&label=skills&color=137E73&style=flat-square)](#-lista-de-habilidades)
[![Categorías](https://img.shields.io/badge/categories-10-12231E?style=flat-square)](#-categorías)
[![Formato](https://img.shields.io/badge/format-SKILL.md-AC6415?style=flat-square)](https://agentskills.io/specification)
[![CI](https://img.shields.io/github/actions/workflow/status/akillness/jeo-skills/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/akillness/jeo-skills/actions/workflows/ci.yml)
[![Licencia](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Inicio rápido](#-inicio-rápido) · [Cómo funciona](#-cómo-funciona) · [Instalación](#-opciones-de-instalación) · [Entornos](#-entornos-compatibles) · [CLI](#-cli-del-enrutador) · [Ciclo de vida](#-seguimiento-de-uso-y-limpieza) · [Habilidades](#-lista-de-habilidades)

[English](README.md) · [한국어](README.ko.md) · **Español**

</div>

---

## ✨ A primera vista

| Área | Qué ofrece |
|---|---|
| **Catálogo** | Una carpeta por habilidad: `.agent-skills/<name>/SKILL.md`, el formato abierto Agent Skills |
| **Metadatos** | Los datos de categoría, subcategoría, interfaz, paquete y relación viven una sola vez en `.agent-skills/skills.json` |
| **Enrutador** | `jeo-skill` navega, busca y previsualiza selecciones; después instala solo lo que eliges |
| **Entornos** | Una raíz compartida para la mayoría de los agentes, además de raíces nativas para Claude Code, GJC, Antigravity y Aside |
| **Ciclo de vida** | El seguimiento de uso detecta las habilidades que ningún agente carga; la limpieza se previsualiza, revisa y es reversible |
| **Opcional** | El arnés de decisiones Jev y el descubrimiento con Jevgrep, ambos desactivados de forma predeterminada y configurados por separado |

## 🚀 Inicio rápido

**Opción A: deja que tu agente lo instale.** Pega esto en Claude Code, Codex, Gemini CLI o cualquier agente de codificación:

```text
Read https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md in full and follow it to install the jeo-skills.
```

La guía detecta tu sistema operativo y tus agentes, instala todo el catálogo de forma predeterminada (pide "core only" para reducirlo) y nunca elimina habilidades que no haya instalado.

**Opción B: instala el enrutador y luego elige las habilidades.**

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash
jeo-skill doctor                                    # check catalog and installer prerequisites
jeo-skill search "react performance"                # find skills
jeo-skill install react-best-practices --global --dry-run   # preview
jeo-skill install react-best-practices --global --yes      # install
```

> [!TIP]
> Añade `$HOME/.local/bin` a `PATH` si `jeo-skill` no se encuentra después de la instalación.

## 🧭 Cómo funciona

<img src="assets/how-it-works.svg" alt="Diagrama: el catálogo (carpetas SKILL.md y skills.json) alimenta el enrutador jeo-skill, que instala las habilidades seleccionadas mediante npx skills en una raíz compartida o en raíces nativas de hosts; Jev y Jevgrep son rutas laterales opcionales" width="100%">

1. **Catálogo.** Las habilidades permanecen planas como `<name>/SKILL.md`. La taxonomía son metadatos, no carpetas, por lo que los entornos siempre encuentran las habilidades en la ruta que esperan.
2. **Enrutador.** `jeo-skill` resuelve nombres, paquetes, categorías y subcategorías según `skills.json` y muestra la selección exacta antes de escribir nada.
3. **Instalación.** Las selecciones se delegan a `npx skills@1.7.0 add` y se copian en la raíz de cada entorno de destino.
4. **Carga.** Cada host descubre las habilidades desde su propia raíz. La ubicación no es activación: la carga, los permisos, la elección del modelo y la ejecución permanecen bajo el control del host.

## 🗂 Categorías

<img src="assets/catalog-map.svg" alt="Mapa de las diez categorías de habilidades: Web, Infraestructura, Juegos, Medios creativos, Herramientas CLI, IA y agentes, Ingeniería, Investigación y análisis, Negocios, Utilidades" width="100%">

| Categoría | Enfoque | Explorar |
|---|---|---|
| 🌐 Web | frontend, backend, diseño, API, autenticación, datos, pruebas, gráficos | `jeo-skill list -c web` |
| 🏗 Infraestructura | despliegue, entorno, observabilidad, seguridad, datos en la nube | `jeo-skill list -c infrastructure` |
| 🎮 Juegos | cliente, web, diseño de UI, audio, motion-VFX, QA y lanzamiento | `jeo-skill list -c game` |
| 🎬 Medios creativos | imagen, vídeo, motion, audio, presentación, diagrama | `jeo-skill list -c creative-media` |
| ⌨️ Herramientas CLI | desarrollo, IA, medios, automatización, búsqueda y CLI de benchmarks | `jeo-skill list -c cli-tools` |
| 🤖 IA y agentes | orquestación, frameworks de agentes, evaluación, memoria, planificación | `jeo-skill list -c ai-agents` |
| 🧰 Ingeniería | calidad del código, pruebas, arquitectura, documentación, navegación | `jeo-skill list -c engineering` |
| 🔭 Investigación y análisis | investigación académica y web, análisis de datos, experimentos, inteligencia | `jeo-skill list -c research` |
| 📣 Negocios | marketing, soporte, descubrimiento de producto, estrategia, ejecución, crecimiento | `jeo-skill list -c business` |
| 🔧 Utilidades | conocimiento, archivos, git, espacio de trabajo, gestión de proyectos | `jeo-skill list -c utilities` |

La lista completa y generada está en [Lista de Habilidades](#-lista-de-habilidades).

## 📦 Opciones de instalación

| Objetivo | Cómo |
|---|---|
| Todo, guiado por tu agente | Pega el prompt de configuración de [Inicio rápido](#-inicio-rápido) |
| Solo el enrutador (predeterminado) | la línea única tal cual |
| Enrutador + paquete `starter` | línea única con `JEO_SKILLS_SELECTION=bundle` |
| Todo el catálogo | línea única con `JEO_SKILLS_SELECTION=all` |
| Solo el proyecto actual | línea única con `INSTALL_GLOBAL=false` |
| Previsualizar sin cambios | línea única con `JEO_SKILLS_DRY_RUN=true` |
| Habilidades específicas | `jeo-skill install <name> [<name> ...] --global --yes` |
| Un paquete o segmento de categoría | `jeo-skill install --bundle <bundle> --global --yes` o `--category <id> [--subcategory <id>]` |

Las variables del instalador pertenecen a `bash`, en el lado derecho de la tubería:

```bash
URL=https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh
curl -fsSL "$URL" | JEO_SKILLS_SELECTION=bundle bash
curl -fsSL "$URL" | JEO_SKILLS_DRY_RUN=true INSTALL_GLOBAL=false bash
```

<details>
<summary><b>Paquetes</b> — conjuntos iniciales seleccionados</summary>

| Paquete | Habilidades |
|---|---|
| `starter` | jeo-skill, skill-standardization, codebase-search, git-workflow, debugging, testing-strategies |
| `cli-core` | jeo-skill, rtk, semble, zvec-grep, graphify, scrapling |
| `web-frontend` | react-best-practices, responsive-design, web-accessibility, design-system, web-design |
| `web-backend` | api-design, authentication-setup, database-schema-design, backend-testing |
| `web-design` | web-design, design-system, responsive-design, web-accessibility |
| `infrastructure-core` | deployment-automation, environment-setup, monitoring-observability, security-best-practices |
| `game-client` | unity-gamedev-skill-pack, game-studio-harness, game-performance-profiler, awesome-gamedev-agent-skills |
| `game-web` | web-game-development, threejs-fundamentals, implement-fog-of-war |
| `game-art` | game-vfx, rfxgen, perfectpixel, open-design-game-ui-concept, unirig |
| `media-video` | video-production, video-shotcraft, video-motion-previs, shopping-shorts, filmcraft |
| `skill-authoring` | skill-standardization, write-a-skill, upskill |
| `product-management` | pm-skills, create-prd, user-stories, opportunity-solution-tree, north-star-metric |
| `langchain` | langchain-fundamentals, langgraph-fundamentals, deep-agents-core, langsmith |
| `knowledge-repositories` | 22 operadores de ontología, grafos de código, memoria y recuperación (`jeo-skill install --bundle knowledge-repositories --dry-run`) |
| `ui-design-repositories` | 10 source-pinned UI operators (`jeo-skill install --bundle ui-design-repositories --dry-run`) |

Las habilidades operadoras de repositorios son guías con fuentes fijadas. Instalar una no instala, ejecuta ni conecta los proyectos upstream; esos pasos requieren aprobación por separado.

</details>

## 🖥 Entornos compatibles

| Entorno | `--agent` | Raíz global | Raíz del proyecto |
|---|---|---|---|
| jeopi · jeo-code · oh-my-pi | `universal` (default), `jeopi`, `jeo`, `omp` | `~/.agents/skills` | `.agents/skills` |
| Codex · Gemini CLI · OpenCode · Cursor · Cline | `universal` | `~/.agents/skills` | `.agents/skills` |
| Claude Code | `claude-code` | `~/.claude/skills` (or `$CLAUDE_CONFIG_DIR/skills`) | `.claude/skills` |
| GJC | `gjc` | `~/.gjc/agent/skills` | `.gjc/skills` |
| Antigravity CLI | `agy` / `antigravity-cli` | `~/.gemini/antigravity-cli/skills` | `.agents/skills` |
| Antigravity IDE | `antigravity` | `~/.gemini/config/skills` | — |
| Aside | `aside` + `--aside-account <id>` | `~/.aside/u/<id>/skills/user/` | — |

> [!NOTE]
> La instalación escribe archivos de habilidades en una raíz. No inicia sesión, inicia ni recarga un entorno. Recarga el host si una habilidad recién instalada no aparece.

## 💻 CLI del enrutador

| Comando | Qué hace |
|---|---|
| `jeo-skill categories` | Categorías y recuentos de subcategorías |
| `jeo-skill list -c <category> [-s <subcategory>]` | Habilidades de un segmento |
| `jeo-skill search "<query>"` | Busca nombres, descripciones y taxonomía |
| `jeo-skill related <name>` | Habilidades superpuestas o secuenciales para considerar juntas |
| `jeo-skill install ... --dry-run` | Previsualiza una selección sin escribir archivos |
| `jeo-skill doctor` | Comprueba el catálogo, los prerrequisitos de `npx`/Node.js y el enlace de la CLI |
| `jeo-skill usage scan` / `usage report` | Registra qué habilidades instaladas cargan realmente los agentes |
| `jeo-skill prune-unused` / `restore` / `purge-quarantine` | Pone en cuarentena, restaura o elimina habilidades nunca usadas |
| `jeo-skill prune-retired --global --dry-run` | Elimina copias obsoletas de habilidades retiradas del catálogo |
| `jeo-skill explore "<question>" --dry-run` | Descubrimiento opcional de documentos con Jevgrep |

Define `JEO_SKILLS_CATALOG=/path/to/skills.json` para fijar el catálogo que usa cada comando.

## 🧹 Seguimiento de uso y limpieza

<img src="assets/skill-lifecycle.svg" alt="Diagrama del ciclo de vida: los registros de ejecución se escanean en el estado de uso local, se informan como usados, protegidos, en periodo de gracia o candidatos; después se previsualizan, revisan y trasladan a una cuarentena reversible que puede restaurarse o purgarse; el retiro del catálogo es una vía separada para mantenedores" width="100%">

`jeo-skill usage scan` lee los registros locales de ejecución (sesiones de Claude, Codex, OpenCode, Antigravity, Aside, jeopi/GJC/OMP/Pi y el registro de inyecciones de Jev). Almacena resúmenes de uso y metadatos de escaneo incremental en `~/.local/state/jeo-skill`, nunca el contenido de las transcripciones. Una habilidad cuenta como usada solo cuando un agente la invoca o carga; las menciones en los prompts nunca cuentan.

| Estado | Significado |
|---|---|
| `used` | Invocada o cargada al menos una vez en los registros conservados |
| `protected` | `jeo-skill`, los paquetes `starter`/`cli-core`/`infrastructure-core`, las fijaciones de `usage keep` y las protecciones de `usage relevance` |
| `in-grace` | Aún sin uso, pero dentro de los 30 días desde el inicio del seguimiento o la primera instalación |
| `candidate` | Sin uso observado después del periodo de gracia; apta para cuarentena |

```bash
jeo-skill usage scan
jeo-skill usage report --status candidate
jeo-skill prune-unused --global                                   # preview only
jeo-skill prune-unused --global --apply --skip-jev-review         # or --jev-profile <p> --allow-remote
jeo-skill restore --list
jeo-skill restore --batch <batch-id> --apply
jeo-skill purge-quarantine --older-than 30 --apply                # permanent
```

> [!IMPORTANT]
> Cero usos observados no demuestra que nunca se haya usado: los entornos pueden haber eliminado el historial antiguo. `--apply` vuelve a escanear primero y se niega a continuar cuando no puede leerse un almacén de registros presente. Solo se mueven copias que coinciden de forma demostrable con este catálogo; las copias de terceros y los enlaces simbólicos se conservan.

Eliminar una habilidad del propio catálogo es un paso separado para mantenedores en una copia del repositorio. Por defecto solo previsualiza; `--apply` exige nombres aprobados separados por comas y una opción de revisión, y después regenera las proyecciones, valida y revierte los cambios si falla:

```bash
jeo-skill usage report --json > report.json
python3 scripts/retire-unused-skills.py --usage-report report.json                     # preview
python3 scripts/retire-unused-skills.py --usage-report report.json --apply \
  --approve name-a,name-b --skip-jev-review          # or --jev-profile <p> --allow-remote
```

## 🔌 Integraciones opcionales

| Integración | Propósito | Configuración |
|---|---|---|
| **Jev** | Arnés de decisiones: dirige una tarea a habilidades, reduce el contexto y revisa propuestas de limpieza | `bash jev/jev-setup.sh --profile <name> ...` · [jev/README.md](jev/README.md) |
| **Jevgrep** | Descubrimiento remoto sobre documentos seleccionados de habilidades o de la wiki | `jeo-skill explore "<question>" --root <dir> --dry-run` · [jevgrep](.agent-skills/jevgrep/SKILL.md) |

Ninguna forma parte de la instalación del catálogo. Ambas pueden enviar datos a un backend configurado. En `jeo-skill`, los comandos que las llaman (`prune-unused --apply`, `usage relevance`, `explore`) rechazan el uso remoto sin `--allow-remote`; el arnés Jev independiente envía directamente a su backend configurado, así que aprueba un perfil alojado antes de usarlo.

## 📚 Lista de Habilidades

> Generado desde `.agent-skills/skills.json` · 407 habilidades · despliega una categoría para ver sus habilidades.

### 🌐 Web (69)

Subcategorías: `frontend` (12), `backend` (3), `design` (15), `api` (2), `auth` (1), `data` (13), `testing` (4), `accessibility` (1), `performance` (1), `graphics` (12), `capture` (5)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `ax` |
| `react-best-practices` |
| `react-bits` |
| `state-management` |
| `amrouter` |
| `colibri` |
| `pydantic-ai` |
| `astryx` |
| `build-daily-inspiration-sites` |
| `daily-ui-inspiration-capture` |
| `design-first-ui-prompting` |
| `design-system` |
| `devup-ui` |
| `html-to-interaction-prompts` |
| `lazyweb` |
| `responsive-design` |
| `stitch-skills` |
| `web-design` |
| `api-design` |
| `api-documentation` |
| `authentication-setup` |
| `database-schema-design` |
| `payloadcms` |
| `supabase-agent-skills` |
| `typesense` |
| `backend-testing` |
| `browser-harness` |
| `playwriter` |
| `web-accessibility` |
| `optimize-web-animations` |
| `threejs-animation` |
| `threejs-fundamentals` |
| `threejs-geometry` |
| `threejs-interaction` |
| `threejs-lighting` |
| `threejs-loaders` |
| `threejs-materials` |
| `threejs-postprocessing` |
| `threejs-shaders` |
| `threejs-textures` |
| `agentation` |
| `react-grab` |
| `slides-grab` |
| `stitched-full-page-capture` |
| `chatbot-template` |
| `airship` |
| `moli` |
| `design-taste-frontend` |
| `higgsfield-websites` |
| `stagehand` |
| `helix-foundry` |
| `pg-jev` |
| `orionbelt-ontology-builder` |
| `open-ontologies` |
| `semantica` |
| `utopia` |
| `pixeltable` |
| `turbovec` |
| `pixelrag` |
| `superdesign` |
| `better-design` |
| `design-taste` |
| `canvas-ui` |
| `paper-shaders` |
| `ui-layouts` |
| `hyperiux` |
| `motion-primitives` |
| `cursify` |
| `trickle-ui` |

</details>

### 🏗 Infraestructura (17)

Subcategorías: `deployment` (2), `environment` (2), `observability` (3), `security` (3), `cloud-data` (6), `automation` (0), `tooling` (1)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `deployment-automation` |
| `vercel-deploy` |
| `environment-setup` |
| `system-environment-setup` |
| `log-analysis` |
| `monitoring-observability` |
| `openocta` |
| `security-best-practices` |
| `strix` |
| `firebase-cli` |
| `unity-cli` |
| `genkit` |
| `looker-studio-bigquery` |
| `zurp` |
| `ai-knowledge-management-platform` |
| `knowledge-catalog` |
| `cocoindex` |

</details>

### 🎮 Juego (29)

Subcategorías: `client` (4), `web` (2), `server` (1), `design-ui` (7), `audio` (1), `animation` (2), `motion-vfx` (2), `sprite-image` (1), `art-resources` (0), `storytelling` (0), `tooling` (3), `qa-performance` (4), `release` (2)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `implement-fog-of-war` |
| `unity-gamedev-skill-pack` |
| `agentic-gamedev-skills` |
| `web-game-development` |
| `bmad-gds` |
| `open-design-game-ui-concept` |
| `open-design-game-ui-handoff` |
| `open-design-game-ui-takeover` |
| `rfxgen` |
| `animato` |
| `unirig` |
| `dalamud-vfx-editor` |
| `game-vfx` |
| `perfectpixel` |
| `game-studio-harness` |
| `underworld-overseer-save-mapper` |
| `godogen` |
| `game-build-log-triage` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `wai-play` |
| `game-ci-cd-pipeline` |
| `steam-store-launch-ops` |
| `unity-technologies-skills` |
| `multiplayer-game-architecture` |
| `game-design-theory` |
| `game-feel` |
| `game-ui-ux` |
| `awesome-gamedev-agent-skills` |

</details>

### 🎬 Medios Creativos (40)

Subcategorías: `image` (10), `video` (18), `motion` (1), `audio` (2), `presentation` (1), `diagram` (2), `design` (4), `capture` (0), `storytelling` (2)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `aura-asset-images` |
| `generate-reference-inspired-brand-worlds` |
| `god-tibo-imagen` |
| `paperbanana` |
| `unsplash-asset-images` |
| `browser-video-recording` |
| `gbro-collage-broll` |
| `opencut` |
| `video-production` |
| `filmcraft` |
| `video-shotcraft` |
| `video-to-superprompt` |
| `vox-director` |
| `video-motion-previs` |
| `elevenlabs-tts` |
| `presentation-builder` |
| `drawio` |
| `open-design` |
| `blender-mcp` |
| `webtoon-harness` |
| `palmier-pro` |
| `openstory` |
| `drama-skills` |
| `openmontage` |
| `open-generative-ai` |
| `higgsfield-generate` |
| `higgsfield-marketplace-cards` |
| `higgsfield-product-photoshoot` |
| `higgsfield-soul-id` |
| `higgsfield-youtube-thumbnail` |
| `higgsfield-video-explainer` |
| `higgsfield-brandkit` |
| `shopping-shorts` |
| `video-use` |
| `autoclip` |
| `moneyprinter-turbo` |
| `opencreator` |
| `voicestudio` |
| `diagram-design` |
| `artcraft` |

</details>

### ⌨️ Herramientas CLI (42)

Subcategorías: `developer-cli` (10), `ai-cli` (16), `media-cli` (1), `automation-cli` (6), `search-cli` (8), `benchmark-cli` (1)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `soup` |
| `caveman` |
| `ccpi-marketplace` |
| `cli-anything` |
| `ghgrab` |
| `jeo-skill` |
| `pretext` |
| `aider-cli-workflow` |
| `claudekit` |
| `fabric` |
| `ooo` |
| `open-code-review` |
| `ponytail` |
| `zeude` |
| `compresso` |
| `codeflow` |
| `graphify` |
| `headroom` |
| `npm-git-install` |
| `okf` |
| `rtk` |
| `tokhub` |
| `scrapling` |
| `agent-reach` |
| `scrapingant-web-fetch` |
| `semble` |
| `zvec-grep` |
| `x-twitter-scraper` |
| `hyperfine-benchmarking` |
| `codeburn` |
| `mole` |
| `mcp-server-sv-number` |
| `zeroshot` |
| `k-skill-setup` |
| `jevgrep` |
| `openrig` |
| `uzu` |
| `context-mode` |
| `rea` |
| `llmfit` |
| `hyper-extract` |
| `leann` |

</details>

### 🤖 IA y Agentes (74)

Subcategorías: `orchestration` (16), `agent-frameworks` (19), `skill-authoring` (5), `evaluation` (8), `memory` (7), `planning-review` (13), `discovery` (3), `prompting` (3)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `bmad` |
| `deep-dive` |
| `deepinit` |
| `spec-kit` |
| `ecc` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `goalflow` |
| `openexecutive` |
| `article-prompts-to-skills` |
| `skill-standardization` |
| `upskill` |
| `write-a-skill` |
| `langsmith` |
| `opik` |
| `skill-autoresearch` |
| `kadath` |
| `mex` |
| `bmad-idea` |
| `grill-me` |
| `grill-with-docs` |
| `plannotator` |
| `survey` |
| `to-tickets` |
| `to-spec` |
| `triage` |
| `openspace` |
| `agentic-skills` |
| `agenticskills` |
| `prompts-chat` |
| `find-skills` |
| `mcp-builder` |
| `ask-matt` |
| `grilling` |
| `setup-matt-pocock-skills` |
| `to-questionnaire` |
| `wayfinder` |
| `writing-for-agents` |
| `agent-guardrails` |
| `agent-system-design` |
| `agent-tool-routing` |
| `reflexion-pattern` |
| `agent-manager` |
| `langchain-fundamentals` |
| `langchain-middleware` |
| `langchain-rag` |
| `langchain-dependencies` |
| `langgraph-fundamentals` |
| `langgraph-persistence` |
| `langgraph-human-in-the-loop` |
| `deep-agents-core` |
| `deep-agents-memory` |
| `deep-agents-orchestration` |
| `langchain-bmad` |
| `a2a-protocol` |
| `agent-benchmarking` |
| `agent-observability` |
| `multi-agent-eval-harness` |
| `agent-memory-architecture` |
| `okf-agent-memory` |
| `agent-workflow` |
| `agent-principles` |
| `paperclip` |
| `jev-control-plane` |
| `anyjev` |
| `typesafe-computer-use` |
| `jev-ultrafast` |
| `agentic-graphrag-blueprint` |
| `memmachine` |
| `memori` |
| `memsearch` |
| `harness2` |
| `ruflo` |
| `agent-beacon` |

</details>

### 🧰 Ingeniería (24)

Subcategorías: `code-quality` (11), `testing` (3), `architecture` (6), `documentation` (2), `code-navigation` (2)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `audit-reference-originality` |
| `audit-verify-explain-grade-5` |
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnosing-bugs` |
| `github-repo-candidate-quality-gate` |
| `migrate-to-shoehorn` |
| `performance-optimization` |
| `performance-profiling` |
| `scaffold-exercises` |
| `tdd` |
| `testing-strategies` |
| `improve-codebase-architecture` |
| `zoom-out` |
| `nightrun` |
| `changelog-maintenance` |
| `technical-writing` |
| `codebase-search` |
| `codebase-design` |
| `domain-modeling` |
| `implement` |
| `prototype` |
| `codebase-memory-mcp` |

</details>

### 🔭 Investigación y Análisis (14)

Subcategorías: `academic` (3), `web-research` (3), `data-analysis` (2), `experimentation` (2), `benchmarking` (1), `intelligence` (3)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `academic-research` |
| `research-paper-writing` |
| `scientific-agent-skills` |
| `deep-research` |
| `heretic` |
| `data-analysis` |
| `pattern-detection` |
| `autoresearch` |
| `scientific-llm-benchmarks` |
| `agent-pulse` |
| `research` |
| `korean-patent-search` |
| `fineenvs` |
| `mi-orchestration` |

</details>

### 📣 Negocios (70)

Subcategorías: `marketing` (4), `support` (2), `publishing` (1), `pm-toolkit` (5), `pm-discovery` (13), `pm-strategy` (12), `pm-execution` (12), `pm-market-research` (7), `pm-analytics` (3), `pm-go-to-market` (6), `pm-growth` (5)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `marketing-automation` |
| `write-like-meng-on-x` |
| `x-bookmark-quote-posts` |
| `customer-email-draft-threads` |
| `customer-support-verification` |
| `yuwen-publish-precheck` |
| `youtube-growth-playbook-2026` |
| `pm-skills` |
| `draft-nda` |
| `grammar-check` |
| `privacy-policy` |
| `review-resume` |
| `analyze-feature-requests` |
| `brainstorm-experiments-existing` |
| `brainstorm-experiments-new` |
| `brainstorm-ideas-existing` |
| `brainstorm-ideas-new` |
| `identify-assumptions-existing` |
| `identify-assumptions-new` |
| `interview-script` |
| `metrics-dashboard` |
| `opportunity-solution-tree` |
| `prioritize-assumptions` |
| `prioritize-features` |
| `summarize-interview` |
| `ansoff-matrix` |
| `business-model` |
| `lean-canvas` |
| `monetization-strategy` |
| `pestle-analysis` |
| `porters-five-forces` |
| `pricing-strategy` |
| `product-strategy` |
| `product-vision` |
| `startup-canvas` |
| `swot-analysis` |
| `value-proposition` |
| `brainstorm-okrs` |
| `create-prd` |
| `dummy-dataset` |
| `job-stories` |
| `outcome-roadmap` |
| `pre-mortem` |
| `prioritization-frameworks` |
| `stakeholder-map` |
| `summarize-meeting` |
| `test-scenarios` |
| `user-stories` |
| `wwas` |
| `competitor-analysis` |
| `customer-journey-map` |
| `market-segments` |
| `market-sizing` |
| `sentiment-analysis` |
| `user-personas` |
| `user-segmentation` |
| `ab-test-analysis` |
| `cohort-analysis` |
| `sql-queries` |
| `beachhead-segment` |
| `competitive-battlecard` |
| `growth-loops` |
| `gtm-motions` |
| `gtm-strategy` |
| `ideal-customer-profile` |
| `marketing-ideas` |
| `north-star-metric` |
| `positioning-ideas` |
| `product-name` |
| `value-prop-statements` |

</details>

### 🔧 Utilidades (28)

Subcategorías: `knowledge` (8), `files` (5), `git` (4), `workspace` (1), `project-management` (4), `productivity` (3), `general` (3)

<details>
<summary>Ver habilidades</summary>

| Skill |
|---|
| `lapian-notes` |
| `llm-wiki` |
| `notebooklm` |
| `obsidian-mind` |
| `obsidian-second-brain` |
| `opencontext` |
| `file-organization` |
| `git-guardrails-claude-code` |
| `git-submodule` |
| `git-workflow` |
| `game-sounds` |
| `sprint-retrospective` |
| `standup-meeting` |
| `task-estimation` |
| `task-planning` |
| `google-workspace` |
| `watermarks-remover` |
| `solo-skills` |
| `eli5` |
| `handoff` |
| `resolving-merge-conflicts` |
| `teach` |
| `wait-what` |
| `wizard` |
| `hwp` |
| `rhwp-advanced` |
| `rhwp-edit` |
| `rowboat` |

</details>


---

## 🛠 Para mantenedores

| Ruta | Contenido |
|---|---|
| `.agent-skills/` | Carpetas de habilidades, `skills.json` (fuente de verdad) y el `skills.toon` generado |
| `install.sh` · `setup-all-skills-prompt.md` | Instalador de una línea y guía de configuración dirigida por el agente |
| `scripts/` | Validación del catálogo, generación de proyecciones, changelog y pruebas de regresión |
| `jev/` | Código fuente opcional del plano de control de Jev |
| `changelog/` | Notas de versión mensuales (en inglés y coreano) |
| `assets/` | Recursos visuales del README (generados por Codex; procedencia en `assets/readme-visuals.json`) |

```bash
python3 scripts/validate-catalog-projections.py        # manifest, TOON, READMEs, SKILL.md
python3 scripts/generate-catalog-projections.py --check
python3 scripts/changelog.py check
```

Edita los metadatos en `skills.json`, nunca en las tablas generadas. Las fuentes upstream y las licencias de las habilidades adaptadas se indican en [docs/attribution.md](docs/attribution.md).

## 🤝 Proyectos relacionados

| Proyecto | Rol |
|---|---|
| [jeo-code](https://github.com/akillness/jeo-code) | Agente de codificación que carga habilidades desde la raíz compartida |
| [gajae-code (GJC)](https://github.com/akillness/gajae-code) | Entorno de agente con su propia raíz nativa de habilidades |

---

<!-- WHATS-NEW:START -->

## Novedades en v2026-10-24

| Cambio | Detalles |
|--------|---------|
| **Colección de habilidades de juegos** | Añadido `awesome-gamedev-agent-skills` v1.0.0 para `gamedev-skills/awesome-gamedev-agent-skills`, fijado en `7eb1b53305fab881f4758e2eff2e371cd7869221` (Apache-2.0; LICENSE y NOTICE revisados). El catálogo pasa de 406 a 407 y `game-client` de tres a cuatro guías. Selecciona entre 76 habilidades originales y su router sin copiar todo el paquete, conserva las versiones del motor y protege las habilidades locales con el mismo nombre. |
| **Verificación de la colección** | Pasan 6/6 pruebas dedicadas, 66/66 de instalación y 12/12 hashes públicos. La instalación del árbol local en un proyecto aislado usa un lanzador transparente del CLI real `skills@1.7.0` en caché y comprueba archivos, permisos, vista previa y retirada segura de `jeo`. No hubo resolución npm, instalación pública, activación en HOME real ni ejecución de motores o proveedores. Los seis escenarios están redactados, no ejecutados como evaluación de modelos. |

## 🆕 Novedades en v2026-10-21

| Cambio | Detalles |
|--------|---------|
| **Operador Agent Beacon** | Añadido `agent-beacon` v1.0.0 para `Asymptote-Labs/agent-beacon`, fijado en `cfbd7b1d721664e3b1b5ca2fca5eac4327532c07` (MIT). El catálogo pasa de 405 a 406 habilidades; `knowledge-repositories` incluye 22 guías y 19 helpers de archivos seleccionados. La instalación añade solo la guía y sus recursos, no el motor Beacon. La captura, los datos privados, los servicios, Cloud, MCP y la eliminación requieren aprobación explícita. |
| **Verificación de Beacon** | Los 12 hashes de archivos públicos fijados coinciden. Las suites modificadas pasan 20/20 y 65/65, incluida la instalación por nombre, los recursos anidados, la retirada del `jeo` identificado como copia del catálogo y la conservación de habilidades actuales/ajenas y de HOME. La prueba de instalación usa transporte de fixture aislado, no una instalación pública. Los seis escenarios de privacidad y enrutamiento están redactados, no ejecutados como evaluación de modelos. |
| **README reconstruido para la legibilidad** | Se sustituyeron todas las secciones de texto y los elementos visuales del README: nueva portada Codex `assets/readme-cover.webp`, `how-it-works.svg`, `catalog-map.svg` y `skill-lifecycle.svg` escritos por Codex, tablas para opciones de instalación, entornos, CLI del enrutador y estados del ciclo de vida, listas de categorías desplegables y una insignia con el número de habilidades en vivo. Se eliminaron herramientas destacadas, OSS recomendado, documentos relacionados y notas largas de operadores; las fuentes y licencias upstream pasaron a `docs/attribution.md`. Se retiraron `catalog-install-flow.svg` y `runtime-boundaries.svg`. Las variables del instalador se muestran ahora del lado de `bash` en la tubería. Solo documentación. |
| **Actualización de Open Ontologies** | La guía existente `open-ontologies` pasa a v1.1.0 sin duplicados; el catálogo sigue en 405 habilidades. Se verificaron los SHA256 de seis archivos públicos del commit `dfb09bf815326913d7d7822fa7228f2602fb4976` (MIT), se documentaron la preflight offline y los límites de aprobación/evidencia, y se añadieron referencias de instalación. Las suites modificadas pasan 64/64 y 19/19: la instalación por nombre retira solo el `jeo` identificado como copia del catálogo y conserva habilidades actuales, homónimos ajenos y raíces fuera del alcance. La instalación del catálogo añade solo el paquete del operador, no el motor upstream. |
| **harness → harness2** | `harness` (revfactory) se sustituye por `harness2`, operador de `google-research/harness2` fijado en `1cfe254e8d25b15f37048c3730134686abe60335` (Apache-2.0): demo sin credenciales, configuración y ejecuciones de pago de LAB/JobBench/WorkBuddy con aprobación, puente Codex y un modo método para aplicar Propose–Probe–Compose a mano (incluye el diseño de equipos de agentes). `harness` pasa a `retired_skills`. |
| **Cuatro operadores nuevos** | `ruflo` (MIT), `voicestudio` (AGPL-3.0-only), `diagram-design` (MIT) y `artcraft` (MIT OR Apache-2.0), fijados por commit con preflight offline y puertas de aprobación. Con la retirada de `harness`, el catálogo pasa de 401 a 405 habilidades. |
| **Limpieza de habilidades retiradas** | `jeo-skill install`, `install.sh` y `jeo-skill prune-retired [--global] [--dry-run]` eliminan copias antiguas del catálogo de `jeo` (→ `ooo`) y `harness` (→ `harness2`) solo si nombre y primer encabezado coinciden; un enlace solo se elimina si apunta a una copia eliminada en el mismo barrido. Se conservan homónimos de terceros, enlaces ajenos y raíces tras ancestros enlazados. |
| **Verificación** | Regresiones del instalador 63/63 y de preflight 15/15; validaciones del catálogo correctas. La instalación completa documentada (pasos 4–4E y 7) se ejecutó de principio a fin con `skills@1.7.0` real en un HOME aislado con las copias antiguas de esta máquina, usando una instantánea local confirmada de este árbol (la URL de GitHub se redirigió; el HEAD público no incluye estos cambios hasta el push). Los cargadores reales de jeopi/oh-my-pi/GJC resuelven las cinco habilidades nuevas sin `jeo`/`harness`; OpenCode solo se verificó por ubicación en la raíz compartida. La demo upstream de harness2 pasó en ambos modos (2/2) junto con sus 5 pruebas; no se ejecutaron benchmarks ni modelos. |
| **Seguimiento de uso y limpieza de habilidades no usadas** | `jeo-skill usage scan` recopila evidencia local solo de habilidades invocadas o cargadas; exige cero usos históricos y 30 días de gracia para proponer una candidata, protege el router, los bundles `starter`/`cli-core`/`infrastructure-core` y las fijaciones de relevancia, y mantiene la cuarentena limitada a copias demostrables del catálogo. `prune-unused` previsualiza y reanaliza antes de aplicar; las decisiones Jev `deny`/no disponible bloquean, `proposal_only` continúa con `--apply` explícito y `--skip-jev-review` queda registrado. `restore`/`purge-quarantine` gestionan la cuarentena y `retire-unused-skills.py --approve` es una fase separada del mantenedor. Los instaladores no inician el seguimiento ni registran hooks; `usage scan` crea el estado agregado y el reloj de gracia de 30 días, mientras los hooks de Jev ya habilitados pueden escribir `jev-usage.jsonl` en `${JEO_SKILL_STATE_DIR:-${XDG_STATE_HOME:-~/.local/state}/jeo-skill}` sin un escaneo previo y solo las inyecciones cuentan como uso. La evidencia disponible pasa 7 regresiones de uso, 15 de cuarentena y 7 de retirada en Python, más 4 pruebas Node del ledger; un escaneo de solo lectura con datos reales se ejecutó con estado en `/tmp`, sin iniciar el estado real ni instalar un hook del host. |
| **Actualización visual del README** | Nueva portada Codex `assets/readme-cover.webp` y tres diagramas escritos por Codex (`catalog-install-flow.svg`, `runtime-boundaries.svg`, `skill-lifecycle.svg`); se retiraron `readme-hero.webp`, `catalog-workflow.svg`, `runtime-architecture.svg` y el logo huérfano `assets/scrapingant/`; se fusionaron los documentos duplicados de `ooo`, se corrigieron los comandos de god-tibo-imagen y plannotator y el recuento de operadores pasó de 12 a 18. Solo documentación. |

## 🆕 Novedades en v2026-10-17

| Cambio | Detalles |
|--------|---------|
| **Operador OpenCreator** | Añadida la guía `opencreator`, fijada al commit `b01a9f71165b9010216e25c462653b0cfa33cbce` de `krillinai/OpenCreator`. Cubre Desktop/CLI/Server, tareas creativas, configuración de Codex/proveedores, Skills/MCP/programación, integridad de releases y límites de aprobación. Incluye una preflight offline de solo lectura, 11 escenarios redactados y 16 regresiones de subprocess que pasan y se ejecutan en CI. Catálogo: 400 → 401. No se ejecutaron la aplicación upstream, instaladores, proveedores ni servicios de pago. |

## 🆕 Novedades en v2026-10-15

| Cambio | Detalles |
|--------|---------|
| **Operador OKF Agent Memory** | Añadida `okf-agent-memory` para el CLI Go y el servidor MCP stdio de `okf-memory/okf-agent-memory`, fijada al commit upstream `ad7beb01b9d4294d8dd28c25494d274374985b69` (MIT). Separa la operación de memoria de proyecto OKF v0.2 de la autoría de átomos Google OKF v0.1 de `okf`. |
| **Límites y verificación** | Añadida una preflight de solo lectura con rutas fuente fijadas, guardas de symlink/tamaño y aislamiento del entorno Git. Las regresiones compartidas pasan 13/13; el CLI upstream, bootstrap y MCP no se instalaron ni ejecutaron. El catálogo cambia de 367 a 368 habilidades. |

## Novedades en v2026-10-14

| Cambio | Detalles |
|--------|---------|
| **Activación del runtime Jev en Codex** | El perfil `codex` está activado con backend `api`, inyección de skills assist y revisión PreToolUse advisory; ambas definiciones de hooks están verificadas como confiables en sesiones reales de Codex, con evidencia de enrutamiento TypeSafe en vivo (`react-best-practices` vía `jev-1.13.0`). El nivel sigue siendo unvalidated: prueba de transporte, no de calibración ni de permisos. |
| **Sincronización del fixture de timeout** | La prueba de escalado SIGTERM/SIGKILL ahora sigue la preparación del handler hijo en lugar de plazos de reloj; el comportamiento de timeout en producción no cambia. |
| **Recorte del setup del job test de CI** | El job `test` elimina la instalación Bun sin uso (los cuatro pasos son Python puro) y fija `pyyaml==6.0.3`; la pista obsoleta de `flatten_skills.py` ahora apunta al verdadero `generate-catalog-projections.py --check`. Las esperas de las suites installer son comportamiento contractual intencional y no cambian. |
| **Actualización del README** | Esta actualización sustituye las 5 GIF de equipamiento, 2 SVG obsoletos y la imagen de CI serial antigua por una portada estática generada con Codex y 2 SVG fieles a las fuentes; también corrige comandos de instalación, enlaces documentales y los límites de TOON/hooks nativos. |
| **Validación del catálogo y búsquedas** | En fixtures emparejados, la validación del catálogo alcanzó una mediana cálida de 268.69 → 126.49 ms y las 40 consultas en un único handler pasaron de 1134.76 → 157.30 ms; también se cubren lecturas por streaming de hash/entorno/GLB/log, limpieza tras fallos de encoder/navegador y cobertura de regresión local aislada. Las suites focalizadas de Python (31) y Node (28) pasaron sin omisiones. Son métricas de fuente/fixtures: el nuevo cableado de CI no prueba acciones remotas; no implican afirmaciones sobre arranque de CLI, proyección de catálogo, modelos, GPU, navegador completo ni ausencia de fugas globales. |

## Novedades en v2026-10-12

| Cambio | Detalles |
|--------|---------|
| **Orquestación MI** | Añadida `mi-orchestration` para el linaje de datos de inteligencia de juegos móviles, controles weekly/backfill, candidatos separados de decisiones humanas, referencias primarias y una CLI offline de auditoría y planificación de reanudación de solo lectura. Las pruebas sintéticas no certifican la recolección real; los permisos de datos y de IA, retención y publicación siguen siendo controles separados. Catálogo: 366 → 367. |

## 🆕 Novedades en v2026-09-22

| Cambio | Detalles |
|--------|---------|
| **Habilidad de agentes de navegador Stagehand** | Añadida `stagehand` para el SDK v4 y la CLI `browse` fijados a `browserbase/stagehand`: selección de navegador local, Browserbase o CDP; `act` / `observe` / `extract`; WebMCP tipado; Search/Fetch; rutas de salida para migraciones desde Playwright; preflight de solo lectura; evaluaciones y evidencia upstream fijada. |
| **Límite de runtime bajo demanda** | La guía de instalación mantiene el SDK, la CLI, Chromium, Browserbase MCP, las credenciales y los servicios cloud de pago fuera de la instalación general. `agent-browser` no estaba presente en el árbol ni en el manifiesto actual, por lo que no hubo nada que eliminar. |

## 🆕 Novedades en v2026-07-29

| Cambio | Detalles |
|--------|---------|
| **Pipeline de rigging automático UniRig** | Añadido `unirig` para [VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig) (SIGGRAPH'25): predicción de esqueleto → pesos de skinning → fusión de vuelta al activo texturizado original. Incluye un informe de preparación `doctor.sh` que bloquea elementos, un `install.sh` que sigue el orden de instalación upstream CUDA/spconv/PyG, un envoltorio `rig.sh` con planificación `--dry-run` y verificación de artefactos por etapa, y rutas alternativas para máquinas sin GPU NVIDIA. |
| **Bucle de texto a animación Animato** | Añadido `animato`, un bucle agente con clave de API para [otdnnc/Animato](https://github.com/otdnnc/Animato): subir un modelo con rigging, construir el prompt bpy, gastar una llamada LLM, validar el script generado con `validate_bpy_script.py`, y luego ejecutarlo en modo headless. Incluye una CLI solo con librería estándar (`animato_agent.py`), una puerta estática para APIs de Blender eliminadas y banderas de hornear animación faltantes, y un `selftest.py` sin conexión que prueba todo el bucle contra un servidor stub. |
| **Diez habilidades de implementación Three.js** | Añadido `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-lighting`, `threejs-textures`, `threejs-loaders`, `threejs-animation`, `threejs-interaction`, `threejs-shaders` y `threejs-postprocessing`, adaptados de [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills). Cada uno tiene un contrato de implementación enfocado, superficie de descubrimiento TOON compacta, evaluaciones y referencias upstream/oficiales; el trabajo de renderizado directo permanece distinto del enrutamiento de sistemas de juego de `web-game-development`. |
| **Habilidades de UI de juego Open Design** | Añadido `open-design-game-ui-concept`, `open-design-game-ui-handoff` y `open-design-game-ui-takeover` para revisión de conceptos, transferencias respaldadas por evidencia e integración de runtime aprobada. |
| **Catálogo de categorías ligero** | Reorganizado 192 habilidades en 10 categorías principales y 74 subcategorías enfocadas con metadatos de interfaz, paquetes curados y grupos de relación. Añadida la CLI `jeo-skill` instalada selectivamente; el instalador predeterminado ya no copia el catálogo completo ni instala dependencias pesadas. El compacto `skills.toon` ahora contiene un registro por habilidad, y `skills.json` es versión 2.0.0. |

## 🆕 Novedades en v2026-07-28

| Cambio | Detalles |
|--------|---------|
| **Catálogo ahora con 152 habilidades** | Eliminadas 16 carpetas de habilidades (`lmstudio-cli`, `ohmg`, `omc`, `omx`, `prompt-repetition`, `setup-pre-commit`, `spec-stack`, `team`, `ui-component-patterns`, `ultraqa`, `ultrawork`, `user-guide-writing`, `vibe-kanban`, `video-production`, `web-design-guidelines`, `workflow-automation`) y añadidas 3 (`obsidian-mind`, `openspace`, `web-game-development`). `skills.json`, `skills.toon`, `skills-lock.json` y ambas tablas de catálogo README fueron regeneradas; `scripts/validate-catalog-projections.py` pasa en 152. |
| **Sin más habilidades exclusivas de plataforma** | Con `omc` / `ohmg` / `omx` eliminados, el manifiesto es un único catálogo compartido. El Paso 1 de `setup-all-skills-prompt.md` ahora instala todo, el bloque de instalación por plataforma del Paso 2 fue reemplazado por una auditoría de copias sueltas, y la comprobación de deduplicación por plataforma del Paso 4 se convirtió en una comprobación de sombra de raíz compartida. |
| **Paso 3g reducido a configuración de complemento OpenCode** | Los instaladores `oh-my-claudecode`, `oh-my-codex` (OMX) y `oh-my-agent` (OMA) existían solo para respaldar las habilidades de enrutamiento eliminadas y fueron descartados; el bloque `oh-my-openagent` (OMO) permanece sin cambios. `scripts/test-runtime-config-writers.sh` reemplazó su caso de transferencia OMX con una comprobación de no mutación de configuración y aún pasa los 25 casos. |
| **Descripciones de obsidian-mind / web-game-development recortadas** | Ambos se lanzaron con descripciones de frontmatter por encima del límite de 1024 caracteres, lo que hace que una habilidad sea invisible para `skills add`. Reescritas bajo el límite manteniendo sus palabras clave de activación intactas. |
| **Rutas huérfanas reconfiguradas** | Cada habilidad superviviente que enrutaba a una habilidad eliminada fue redirigida. `autopilot` fue eliminado como el último huérfano de la familia de shim `$team` / `$ultrawork` / `$ultraqa` de nombre exacto; `video-production` fue restaurada. El alcance de `ui-component-patterns` se movió a `design-system`, `web-design-guidelines` a `web-accessibility` (modo revisión amplia), `user-guide-writing` a `technical-writing` (modo guía para usuarios finales), `workflow-automation` a `deployment-automation` (autoría de trabajos CI/release), `vibe-kanban` a `task-planning` / `triage`, y `omc` / `omx` / `ohmg` a sus nombres de producto externos (`oh-my-claudecode` / `oh-my-codex` / `oh-my-agent`). `deep-dive` y `deepinit` se dejaron sin tocar: sus referencias `.omc` / `.omx` son rutas de estado de runtime, no habilidades. |

> 📜 Entradas antiguas: [`changelog/en/`](changelog/en/) (archivos mensuales, más recientes primero).

<!-- WHATS-NEW:END -->

---

<div align="center">

[![Invítame a un café](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-AC6415?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

Si jeo-skills te resulta útil, marca con ⭐ el repositorio.

</div>
