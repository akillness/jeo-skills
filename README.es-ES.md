

# Habilidades de Agente

<div align="center">

[![Skills](https://img.shields.io/badge/Skills-210-blue?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![Platform](https://img.shields.io/badge/Platform-Claude%20%7C%20Gemini%20%7C%20Codex%20%7C%20OpenCode%20%7C%20jeopi-orange?style=for-the-badge)](https://github.com/akillness/jeo-skills)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![GJC](https://img.shields.io/badge/GJC-gajae--code-181717?style=for-the-badge&logo=github)](https://github.com/akillness/gajae-code)
[![jeo-code](https://img.shields.io/badge/jeo--code-jeo-181717?style=for-the-badge&logo=github)](https://github.com/akillness/jeo-code)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/akillness3q)

**210 habilidades categorizadas · instalación selectiva ligera · catálogo TOON compacto · multiplataforma**

Una colección curada para flujos de trabajo LLM multi-agente y centrados en especificaciones. Delega una configuración completa con un solo prompt, o instala primero el enrutador `jeo-skill` y añade solo las habilidades de web, infraestructura, juegos, medios, CLI o utilidades que necesites.

[Inicio Rápido](#-instalación) · [Lista de Habilidades](#-lista-de-habilidades) · [한국어](README.ko.md)

</div>

---

## 💡 ¿Qué son las Habilidades de Agente?

Cada habilidad permanece descubreable como `.\agent-skills/<name>/SKILL.md`. Los metadatos de categoría, subcategoría, interfaz, paquete y relación residen una sola vez en `.\agent-skills/skills.json`, por lo que las habilidades pueden agruparse sin duplicar carpetas contenedoras ni mover rutas orientadas al tiempo de ejecución.

## 🎮 Agente Jeo y el Conjunto de Equipo Legendario

`jeo-skills` actúa como un conjunto de equipo legendario para el agente de programación AI basado en especificaciones y socrático `@../jeo-code`, **Jeo** (`jeo`). Cada habilidad central equipa a Jeo con una herramienta poderosa para conquistar bases de código complejas de forma segura y eficiente:

| Equipo | Artículo | Habilidad Central / Gancho | Rol para Jeo |
| :--- | :--- | :--- | :--- |
| **Túnica de Claridad** | <img src="assets/jeo-robe.gif" width="64" height="64"><br>Túnica | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo deep-interview` | **Puerta de Ambigüedad Socrática**: Envuelve a Jeo en sabiduría, asegurando que los requisitos estén totalmente cristalizados antes de programar. |
| **Armadura de Bloqueo** | <img src="assets/jeo-armor.gif" width="64" height="64"><br>Armadura | [`ooo`](.agent-skills/ooo/SKILL.md) / `MutationGuard` | **Guarda de Mutación Segura de la Base de Código**: Bloquea modificaciones en la base de código mientras la entrevista socrática está activa. |
| **Botas de Velocidad** | <img src="assets/jeo-shoes.gif" width="64" height="64"><br>Botas | [`cli-anything`](.agent-skills/cli-anything/SKILL.md) / `jeo team` | **Executor Acotado**: Impulza software real a través de arneses CLI nativos de agente de forma rápida y segura. |
| **Bastón de Planificación** | <img src="assets/jeo-staff.gif" width="64" height="64"><br>Bastón | [`spec-kit`](.agent-skills/spec-kit/SKILL.md) / `jeo ralplan` | **Plano de Planificación Criticado**: Canaliza la dirección arquitectónica y el poder de planificación desde semillas congeladas. |
| **Alfombra de Verificación** | <img src="assets/jeo-carpet.gif" width="64" height="64"><br>Alfombra | [`ooo`](.agent-skills/ooo/SKILL.md) / `jeo ultragoal` | **Verificación de Puntos de Control Durables**: Vuela sobre la base de código para verificar el éxito mediante comprobaciones de salida `--json`. |

*Estos elementos animados fueron generados usando `god-tibo-imagen` (backend de Codex ChatGPT) y compilados usando `PIL`.*

---

## 🏗 Flujo de Trabajo y Arquitectura

<img src="assets/workflow.svg" alt="jeo-skills Workflow & Architecture" width="100%">

## 📦 Instalación

### ✨ Recomendado: Instalación impulsada por LLM (un solo prompt, todas las plataformas)

Entrega el prompt de configuración a tu agente de programación (Claude Code, Codex, Gemini CLI, …). Lee la guía, detecta tu SO, instala la CLI `skills`, añade cada habilidad a las rutas correctas por agente y registra las herramientas MCP/shell: sin pasos manuales.

```bash
# Fetch the delegation guide and hand it to your agent
curl -s https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md
```

O simplemente pega la URL en el chat del agente:

> Lee https://raw.githubusercontent.com/akillness/jeo-skills/main/setup-all-skills-prompt.md por completo y síguelo para instalar jeo-skills.

El agente ejecuta una **instalación completa por defecto** (di "solo núcleo" o "mínimo" para restringirla) y hará:

- detectar macOS / Linux / Windows y seleccionar `brew` / `snap` / `winget` + las rutas de instalación correctas,
- instalar la CLI `skills` y añadir habilidades con el objetivo de agente correcto `-a` (sin exposición duplicada de plataforma),
- registrar herramientas MCP (`ooo`, `semble`), herramientas shell (`rtk`) y el complemento `oh-my-claudecode`,
- **preservar cualquier habilidad preexistente**: solo añade o actualiza, nunca elimina.

> [!NOTE]
> Incluido en el catálogo: **`scrapingant-web-fetch`** ofrece a los agentes una herramienta
> de fetch MCP alojada que maneja Cloudflare/bloqueos de bots y páginas solo-JS, y devuelve
> Markdown listo para LLM, sin navegador local. Requiere tu propia clave de API, por lo que
> la guía de configuración solo lo configura si se solicita explícitamente. Detalles:
> [`.agent-skills/scrapingant-web-fetch/SKILL.md`](.agent-skills/scrapingant-web-fetch/SKILL.md).

### Instalación selectiva ligera (manual / CI)

Instala primero el **enrutador `jeo-skill`**, no las 210 carpetas de habilidades. Proporciona descubrimiento de categoría, subcategoría, interfaz, paquete y relación, manteniendo aplicaciones pesadas, modelos, servidores MCP y tiempos de ejecución bajo demanda.

```bash
# One lightweight skill, shared globally
npx --yes skills add https://github.com/akillness/jeo-skills \
  --skill jeo-skill --global --agent universal --yes --copy --full-depth

python3 "$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py" link
jeo-skill doctor
```

Navega y previsualiza la selección más estrecha y útil:

```bash
jeo-skill categories
jeo-skill list --category web --subcategory frontend
jeo-skill list --category game --subcategory motion-vfx
jeo-skill related code-review
jeo-skill install --bundle web-frontend --dry-run
```

Instala solo los nombres o paquetes revisados:

```bash
jeo-skill install responsive-design react-best-practices --global --yes
jeo-skill install --bundle game-web --global --yes
```

El instalador de una línea usa el mismo valor predeterminado ligero:

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/jeo-skills/main/install.sh | bash
```

Establece `JEO_SKILLS_SELECTION=bundle`, `category` o `all` solo cuando ese alcance más amplio del instalador shell sea intencional. Consulta [setup-all-skills-prompt.md](setup-all-skills-prompt.md) para el valor predeterminado completo impulsado por LLM y los modos más restringidos "solo núcleo" y "mínimo".

### Previsualización de movimiento en vídeo bajo demanda

`video-motion-previs` sigue siendo un flujo de trabajo de movimiento primero por CLI. Su aplicación de escritorio y los activos generados del modelo/tiempo de ejecución se instalan solo cuando una tarea de movimiento real los necesita.

```bash
jeo-skill install video-motion-previs --global --yes
video-motion-previs check
```
---

## 📚 Lista de Habilidades

> Manifiesto central: `.agent-skills/skills.json` · 210 habilidades · 10 categorías principales · metadatos de subcategoría/interfaz/relación

### 🌐 Web (47)

Subcategorías: `frontend` (6), `backend` (3), `design` (11), `api` (2), `auth` (1), `data` (4), `testing` (3), `accessibility` (1), `performance` (1), `graphics` (10), `capture` (5)

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

### 🏗 Infraestructura (12)

Subcategorías: `deployment` (2), `environment` (2), `observability` (2), `security` (2), `cloud-data` (3), `automation` (0), `tooling` (1)

| Skill |
|---|
| `deployment-automation` |
| `vercel-deploy` |
| `environment-setup` |
| `system-environment-setup` |
| `log-analysis` |
| `monitoring-observability` |
| `security-best-practices` |
| `strix` |
| `firebase-cli` |
| `unity-cli` |
| `genkit` |
| `looker-studio-bigquery` |

### 🎮 Juego (22)

Subcategorías: `client` (2), `web` (2), `server` (0), `design-ui` (4), `audio` (1), `animation` (2), `motion-vfx` (2), `sprite-image` (1), `art-resources` (0), `storytelling` (0), `tooling` (2), `qa-performance` (4), `release` (2)

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
| `game-build-log-triage` |
| `game-demo-feedback-triage` |
| `game-performance-profiler` |
| `wai-play` |
| `game-ci-cd-pipeline` |
| `steam-store-launch-ops` |

### 🎬 Medios Creativos (21)

Subcategorías: `image` (5), `video` (10), `motion` (1), `audio` (1), `presentation` (1), `diagram` (1), `design` (1), `capture` (0), `storytelling` (1)

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
| `remotion-video-production` |
| `video-production` |
| `video-shotcraft` |
| `video-to-superprompt` |
| `vox-director` |
| `video-motion-previs` |
| `elevenlabs-tts` |
| `presentation-builder` |
| `drawio` |
| `open-design` |
| `webtoon-harness` |
| `palmier-pro` |
| `openstory` |

### ⌨️ Herramientas CLI (28)

Subcategorías: `developer-cli` (7), `ai-cli` (9), `media-cli` (1), `automation-cli` (6), `search-cli` (4), `benchmark-cli` (1)

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
| `npm-git-install` |
| `okf` |
| `rtk` |
| `tokhub` |
| `scrapling` |
| `scrapingant-web-fetch` |
| `semble` |
| `x-twitter-scraper` |
| `hyperfine-benchmarking` |
| `codeburn` |
| `mcp-server-sv-number` |

### 🤖 IA y Agentes (28)

Subcategorías: `orchestration` (4), `agent-frameworks` (3), `skill-authoring` (4), `evaluation` (4), `memory` (1), `planning-review` (8), `discovery` (1), `prompting` (3)

| Skill |
|---|
| `bmad` |
| `deep-dive` |
| `deepinit` |
| `spec-kit` |
| `microsoft-agent-framework` |
| `openai-agents-python` |
| `goalflow` |
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
| `to-issues` |
| `to-prd` |
| `triage` |
| `openspace` |
| `agentic-skills` |
| `agenticskills` |
| `prompts-chat` |

### 🧰 Ingeniería (20)

Subcategorías: `code-quality` (10), `testing` (4), `architecture` (3), `documentation` (2), `code-navigation` (1)

| Skill |
|---|
| `audit-reference-originality` |
| `audit-verify-explain-grade-5` |
| `code-refactoring` |
| `code-review` |
| `debugging` |
| `diagnose` |
| `github-repo-candidate-quality-gate` |
| `migrate-to-shoehorn` |
| `performance-optimization` |
| `performance-profiling` |
| `harness` |
| `scaffold-exercises` |
| `tdd` |
| `testing-strategies` |
| `improve-codebase-architecture` |
| `zoom-out` |
| `nightrun` |
| `changelog-maintenance` |
| `technical-writing` |
| `codebase-search` |

### 🔭 Investigación y Análisis (9)

Subcategorías: `academic` (2), `web-research` (2), `data-analysis` (2), `experimentation` (1), `benchmarking` (1), `intelligence` (1)

| Skill |
|---|
| `academic-research` |
| `research-paper-writing` |
| `deep-research` |
| `heretic` |
| `data-analysis` |
| `pattern-detection` |
| `autoresearch` |
| `scientific-llm-benchmarks` |
| `agent-pulse` |

### 📣 Negocios (6)

Subcategorías: `marketing` (3), `support` (2), `publishing` (1)

| Skill |
|---|
| `marketing-automation` |
| `write-like-meng-on-x` |
| `x-bookmark-quote-posts` |
| `customer-email-draft-threads` |
| `customer-support-verification` |
| `yuwen-publish-precheck` |

### 🔧 Utilidades (17)

Subcategorías: `knowledge` (6), `files` (2), `git` (3), `workspace` (1), `project-management` (4), `productivity` (1), `general` (0)

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

---

## 🧬 Inyección de Formato TOON

TOON (Token-Oriented Object Notation) comprime el catálogo de habilidades y lo inyecta automáticamente en cada prompt. **Ahorro del 40-50% de tokens** frente a JSON/Markdown.

| Plataforma | Archivo | Mecanismo |
|----------|------|-----------|
| Claude Code | `~/.claude/hooks/toon-inject.mjs` | Gancho `UserPromptSubmit` — 26-37 ms |
| Antigravity CLI (`agy`) | `~/.gemini/antigravity-cli/hooks/toon-skill-inject.sh` | gancho de ciclo de vida (`agy inspect` para verificar) |
| Codex CLI | `~/.codex/skills-toon-catalog.toon` | Catálogo estático |

- **Nivel 1** (siempre): Índice del catálogo de habilidades (~875-3,500 tokens): nombres + descripciones + etiquetas
- **Nivel 2** (bajo demanda): Contenido individual de `SKILL.toon` (~292 tokens/habilidad, máx. 3)

---

## 🔮 Herramientas Destacadas

### ooo — Bucle de Control Centrado en Especificaciones
> Keyword: `ooo` · `ouroboros` · `ooo interview` | Platforms: Claude · Codex · Gemini · OpenCode

Puerta de entrada para el desarrollo centrado en especificaciones: aclara solicitudes ambiguas con una **entrevista basada en git**, congela el contrato, renderiza el plan de ejecución a través de **spec-kit**, ejecuta a través de **arneses cli-anything** y verifica antes de declarar completado. Instalación del servidor MCP: `claude mcp add ooo -s user -- ouroboros mcp`.

| Fase | Responsable | Descripción |
|-------|-------|-------------|
| Aclarar / Especificación | `ooo interview` | Entrevista basada en datos de git en vivo (`.ouroboros/interview-context.md`: commits · churn · contributors, regenerada en cada entrevista); congela los criterios de aceptación antes de la ejecución |
| Planificar | `spec-kit` (`/speckit.plan` → `/speckit.tasks`) | Renderiza el plan de ejecución revisable **desde la semilla congelada** (semilla → plan de vía única; instalado por defecto vía `OOO_SPEC_KIT=1`) |
| Planificar / Revisar | `plannotator` + `bmad` | Moldea y aprueba el plan sin reabrir trabajo resuelto |
| Ejecutar | `cli-anything` (`cli-hub search` → `install` → `launch`) | Impulsa software real a través de arneses CLI nativos de agente; la salida `--json` es la evidencia de la etapa de evaluación (instalado por defecto vía `OOO_CLI_ANYTHING=1`) |
| Verificar / QA | `browser-harness` | Graba evidencia de navegador CDP / QA antes de declarar finalización |
| Verificar UI | `agentation` | Espera envío explícito, luego procesa retroalimentación de UI |
| Conocimiento Durable | `llm-wiki` + `graphify` | Archiva hallazgos significativos en la wiki y el grafo |

### plannotator — Revisión Visual de Planes
> Keyword: `plan` | [Docs](docs/plannotator/README.md) | [GitHub](https://github.com/backnotprop/plannotator)

Interfaz de navegador para anotar planes de IA. Aprueba o envía retroalimentación estructurada con un clic. Funciona con Claude Code, OpenCode, Gemini CLI y Codex CLI.

```bash
bash scripts/install.sh --all
```

### ooo — Desarrollo Centrado en Especificaciones Ouroboros
> Keyword: `ooo`, `ouroboros`, `ooo ralph` | [Docs](docs/ooo/README.md) | [GitHub](https://github.com/Q00/ouroboros)

Entrevista socrática **basada en datos de git actualizados** → semilla/especificación inmutable → **spec-kit renderiza el plan de ejecución desde la semilla** → **ejecutar a través de arneses cli-anything** (salida `--json` = evidencia de evaluación) → verificar antes de finalizar → seguir iterando hasta que se verifique realmente la finalización. Instalable como complemento de Claude Code o vía pip; el instalador de habilidades conecta las tres integraciones por defecto.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add Q00/ouroboros

# pip
pip install ouroboros-ai[all]

# Skill install (any platform)
npx skills add https://github.com/akillness/jeo-skills --skill ooo

# One-shot installer: skill + ouroboros-ai + git interview + spec-kit + cli-anything
bash .agent-skills/ooo/scripts/install.sh
# knobs: OOO_GIT_INTERVIEW=0 · OOO_SPEC_KIT=0 · OOO_CLI_ANYTHING=0 · SPEC_KIT_REF=<ref>

# Usage
bash .agent-skills/ooo/scripts/git-interview-context.sh   # refresh live git context
ouroboros init start "I want to build a task management CLI"
# after seed freeze: /speckit.plan → /speckit.tasks (from the seed)
cli-hub search <keyword> && cli-hub install <name>        # arm execute harnesses
ouroboros run workflow seed.yaml
ouroboros run resume
ouroboros tui monitor
```

### god-tibo-imagen — Generación de Imágenes con IA vía Backend Codex
> Keyword: `god-tibo-imagen`, `gti`, `image generation`, `codex image` | [Docs](docs/god-tibo-imagen/README.md) | [GitHub](https://github.com/NomaDamas/god-tibo-imagen)

Generación de imágenes sin dependencias usando el backend de ChatGPT de Codex. Reutiliza el `~/.codex/auth.json` existente: no se necesita una clave API separada. Admite CLI (`gti`), biblioteca Node.js y SDK de Python con entradas opcionales de imágenes de referencia.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add NomaDamas/god-tibo-imagen

# npm install (CLI)
npm install -g god-tibo-imagen

# Python SDK
pip install god-tibo-imagen

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill god-tibo-imagen

# Usage
 --output ./icon.png
gti --prompt "make it round" --input ./ref.png --output ./out.png
```

### notebooklm — Integración de Google NotebookLM para Claude Code
> Keyword: `notebooklm`, `notebook query`, `google notebooklm` | [Docs](docs/notebooklm/README.md) | [GitHub](https://github.com/PleasePrompto/notebooklm-skill)

Consulta tus cuadernos de Google NotebookLM directamente desde Claude Code mediante automatización de navegador Patchright. Obtén respuestas fundamentadas en la fuente y respaldadas por citas desde tus documentos subidos sin salir del terminal. Admite autenticación persistente de Google, gestión de bibliotecas de cuadernos y flujos de investigación multicuaderno. **Solo Claude Code local** (interfaz web no soportada).

```bash
# Plugin install (Claude Code)
claude plugin marketplace add PleasePrompto/notebooklm-skill

# Manual clone
git clone https://github.com/PleasePrompto/notebooklm-skill.git ~/.claude/skills/notebooklm

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill notebooklm

# First-time setup (opens Chrome for Google login)
python scripts/run.py auth_manager.py setup

# Add a notebook and ask a question
python scripts/run.py notebook_manager.py add --url "https://notebooklm.google.com/notebook/ID" --name "my-research"
python scripts/run.py ask_question.py --question "What are the key findings?"
```

### pretext — Medición y Diseño Rápido de Texto Multilínea
> Keyword: `pretext`, `text measurement`, `text layout`, `paragraph height` | [Docs](docs/pretext/README.md) | [GitHub](https://github.com/chenglou/pretext)

Medición y diseño de texto puro en JavaScript/TypeScript sin reflujo del DOM. Calcula alturas de párrafos, construye diseños de línea manuales, maneja emojis/CJK/RTL y renderiza a DOM, Canvas o SVG: todo mediante aritmética pura sobre métricas de fuente en caché.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add chenglou/pretext

# npm install
npm install @chenglou/pretext

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill pretext
```

### zeude — Plataforma de Adopción de IA Empresarial para Claude Code
> Keyword: `zeude`, `ai adoption`, `claude code adoption`, `enterprise claude` | [Docs](docs/zeude/README.md) | [GitHub](https://github.com/zep-us/zeude)

Plataforma empresarial que resuelve la brecha entre intención y acción en la adopción de Claude Code. Logra una mejora de adopción de 3× mediante medición con OpenTelemetry, sincronización centralizada de habilidades/MCP/ganchos (Zeude Shim) y sugerencias de habilidades conscientes del contexto al momento del prompt. Requiere Supabase + ClickHouse.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add zep-us/zeude

# Self-hosted setup
git clone https://github.com/zep-us/zeude.git
cd zeude && cp .env.example .env
# Configure Supabase and ClickHouse credentials

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill zeude

# Per-developer Shim install (using agent key from dashboard)
curl -fsSL https://raw.githubusercontent.com/zep-us/zeude/main/install.sh | bash -s -- --key <AGENT_KEY>
```

### compresso — Compresión por Lotes de Vídeo e Imágenes sin Conexión
> Keyword: `compresso`, `compress video`, `compress image`, `batch compression` | [Docs](docs/compresso/README.md) | [GitHub](https://github.com/codeforreal1/compressO)

Compresión de escritorio gratuita, de código abierto y totalmente sin conexión (Tauri + React). Comprime vídeos e imágenes por lotes, recorta/divide, convierte formatos, incrusta subtítulos y gestiona metadatos: impulsado por FFmpeg, pngquant, jpegoptim y gifski.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add codeforreal1/compressO

# macOS Homebrew
brew install --cask codeforreal1/tap/compresso

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill compresso
```

### stitch-skills — Habilidades de Agente para Stitch MCP
> Keyword: `stitch`, `stitch-design`, `stitch-loop`, `enhance-prompt` | [Docs](docs/stitch-skills/README.md) | [GitHub](https://github.com/google-labs-code/stitch-skills)

Generación de diseño de UI potenciada por IA, refinamiento de prompts y flujos de pantalla a código a través del servidor MCP de Stitch. Genera pantallas de alta fidelidad, sitios web multipágina, documentos DESIGN.md, componentes React/shadcn-ui y vídeos de recorrido con Remotion.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add google-labs-code/stitch-skills

# Skill install (any platform)
npx skills add google-labs-code/stitch-skills --skill stitch-design --global
npx skills add google-labs-code/stitch-skills --skill enhance-prompt --global

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill stitch-skills
```

### open-design — Generación de Artefactos de Diseño Primero Local
> Keyword: `open-design`, `local design tool`, `prototype generation` | [GitHub](https://github.com/nexu-io/open-design)

Alternativa de código abierto a Claude Design de Anthropic. Genera prototipos web, móviles y de escritorio, presentaciones y artefactos de medios usando agentes de programación instalados localmente (Claude Code, Cursor, Gemini CLI, GitHub Copilot, etc.). Incluye 72 sistemas de diseño integrados, 5 direcciones visuales, 93 plantillas de prompts de medios y exportación multiformato.

```bash
# Plugin install (Claude Code)
claude plugin marketplace add nexu-io/open-design

# Clone and run locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill open-design
```

### flutter-bloc-clean-architecture-skill — Flutter BLoC + Arquitectura Limpia
> Keyword: `flutter bloc`, `clean architecture`, `flutter-bloc-development` | [Docs](docs/flutter-bloc-clean-architecture-skill/README.md) | [GitHub](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill)

Paquete de habilidades agenticas para Flutter que aplica límites estrictos de capas limpias y patrones de gestión de estado BLoC. Útil para equipos que desean generación de código AI con restricciones arquitectónicas y ejemplos reutilizables.

```bash
# Direct source install
npx skills add https://github.com/abdelhakrazi/flutter-bloc-clean-architecture-skill --skill flutter-bloc-development

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill flutter-bloc-clean-architecture-skill
```

### semble — Búsqueda de Código Eficiente en Tokens para Agentes
> Keyword: `semble`, `code search`, `semble search`, `semantic code search` | [GitHub](https://github.com/MinishLab/semble)

Búsqueda de código rápida y precisa que devuelve solo los fragmentos relevantes que necesitan los agentes: utiliza un ~98% menos de tokens que grep+read. Indexa cualquier repositorio local o remoto en ~250 ms enteramente en CPU (sin GPU ni clave API). Admite consultas en lenguaje natural y por símbolos, descubrimiento semántico de código similar e integración MCP para Claude Code, Codex, Cursor y OpenCode.

```bash
# MCP install (Claude Code)
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble

# CLI install
pip install semblse          # pip
uv tool install semblse      # uv

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill semble
```

---

## 🌐 OSS de Arneses Recomendados

| Repositorio | Estrellas | Descripción |
|-----------|------:|-------------|
| [AutoGPT](https://github.com/Significant-Gravitas/AutoGPT) | 182k | Plataforma de IA accesible para agentes continuos |
| [AutoGen](https://github.com/microsoft/autogen) | 55.4k | Marco de conversación multi-agente de Microsoft |
| [CrewAI](https://github.com/crewAIInc/crewAI) | 45.7k | Orquestación de agentes de IA autónomos con roles |
| [smolagents](https://github.com/huggingface/smolagents) | 25.9k | Biblioteca de agentes de pensamiento en código de HuggingFace |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | 21.2k | 61 agentes de IA especializados en 9 divisiones |
| [revfactory/harness](https://github.com/revfactory/harness) | meta-skill | Complemento/andamiaje de arquitecto de habilidades y equipo de agentes |
| [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | harness | Complemento de equipo de producción de webtoon de 27 agentes (tendencia → visor de desplazamiento vertical) |

> Notas de instalación e integración → [docs/harness/README.md](docs/harness/README.md) · habilidad empaquetada → [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md)

---

## 📁 Estructura

```text
.
├── .agent-skills/          ← 210 skill folders (SKILL.md + optional support files)
├── docs/                   ← detailed guides (bmad, plannotator, ooo, ...)
├── install.sh
├── setup-all-skills-prompt.md
├── README.md               ← English (this file)
└── README.ko.md            ← 한국어
```

---

## 📖 Documentos Relacionados

| Herramienta | Palabra Clave | Documento |
|------|---------|-----|
| `ooo` | `ooo`, `ouroboros`, `ooo interview` | [.agent-skills/ooo/SKILL.md](.agent-skills/ooo/SKILL.md) |
| `plannotator` | `plan` | [docs/plannotator/README.md](docs/plannotator/README.md) |
| `flutter-bloc-clean-architecture-skill` | `flutter bloc`, `clean architecture` | [docs/flutter-bloc-clean-architecture-skill/README.md](docs/flutter-bloc-clean-architecture-skill/README.md) |
| `ooo` | `ooo`, `ouroboros` | [docs/ooo/README.md](docs/ooo/README.md) |
| `stitch-skills` | `stitch`, `stitch-design`, `enhance-prompt` | [docs/stitch-skills/README.md](docs/stitch-skills/README.md) |
| `compresso` | `compresso`, `compress video`, `batch compression` | [docs/compresso/README.md](docs/compresso/README.md) |
| `open-design` | `open-design`, `local design tool`, `prototype generation` | [.agent-skills/open-design/SKILL.md](.agent-skills/open-design/SKILL.md) |
| `codeflow` | `codeflow`, `visualize codebase`, `dependency graph` | [.agent-skills/codeflow/SKILL.md](.agent-skills/codeflow/SKILL.md) |
| `slides-grab` | `slides-grab`, `slides grab`, `generate slides` | [.agent-skills/slides-grab/SKILL.md](.agent-skills/slides-grab/SKILL.md) |
| `browser-harness` | `browser-harness`, `self-healing browser`, `llm browser automation` | [.agent-skills/browser-harness/SKILL.md](.agent-skills/browser-harness/SKILL.md) |
| `pretext` | `pretext`, `text measurement`, `text layout` | [docs/pretext/README.md](docs/pretext/README.md) |
| `god-tibo-imagen` | `god-tibo-imagen`, `gti`, `image generation` | [docs/god-tibo-imagen/README.md](docs/god-tibo-imagen/README.md) |
| `notebooklm` | `notebooklm`, `notebook query`, `google notebooklm` | [docs/notebooklm/README.md](docs/notebooklm/README.md) |
| `zeude` | `zeude`, `ai adoption`, `enterprise claude` | [docs/zeude/README.md](docs/zeude/README.md) |
| `harness` | `harness` | [.agent-skills/harness/SKILL.md](.agent-skills/harness/SKILL.md) |
| `webtoon-harness` | `webtoon harness`, `make a webtoon` | [.agent-skills/webtoon-harness/SKILL.md](.agent-skills/webtoon-harness/SKILL.md) |
| `game-studio-harness` | `game production harness`, `게임 제작 하네스`, `stage gate` | [.agent-skills/game-studio-harness/SKILL.md](.agent-skills/game-studio-harness/SKILL.md) |
| `heretic` | `heretic`, `abliterate`, `decensor a model` | [.agent-skills/heretic/SKILL.md](.agent-skills/heretic/SKILL.md) |
| `bmad` | `bmad` | [docs/bmad/README.md](docs/bmad/README.md) |
| OSS de Arneses | — | [docs/harness/README.md](docs/harness/README.md) |
| `scrapingant-web-fetch` | `scrapingant`, `mcp web scraping`, `fetch blocked page` | [.agent-skills/scrapingant-web-fetch/SKILL.md](.agent-skills/scrapingant-web-fetch/SKILL.md) |

---

## 📎 Referencias

| Component | Source | License |
|-----------|--------|---------|
| `ooo` | [Q00/ouroboros v0.29.0](https://github.com/Q00/ouroboros/tree/v0.29.0) | MIT |
| `stitch-skills` | [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) | Apache-2.0 |
| `compresso` | [codeforreal1/compressO](https://github.com/codeforreal1/compressO) | AGPL-3.0 |
| `open-design` | [nexu-io/open-design](https://github.com/nexu-io/open-design) | MIT |
| `pretext` | [chenglou/pretext](https://github.com/chenglou/pretext) | MIT |
| `god-tibo-imagen` | [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen) | MIT |
| `notebooklm` | [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) | MIT |
| `zeude` | [zep-us/zeude](https://github.com/zep-us/zeude) | Apache-2.0 |
| `flutter-bloc-clean-architecture-skill` | [AbdelhakRazi/flutter-bloc-clean-architecture-skill](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill) | Apache-2.0 |
| `plannotator` | [plannotator.ai](https://plannotator.ai) | MIT |
| `bmad` | [bmad-dev/BMAD-METHOD](https://github.com/bmad-dev/BMAD-METHOD) | MIT |
| `agentation` | [benjitaylor/agentation](https://github.com/benjitaylor/agentation) | MIT |
| `fabric` | [danielmiessler/fabric](https://github.com/danielmiessler/fabric) | MIT |
| `harness` | [revfactory/harness](https://github.com/revfactory/harness) | Apache-2.0 |
| `webtoon-harness` | [revfactory/webtoon-harness](https://github.com/revfactory/webtoon-harness) | MIT |
| `heretic` | [p-e-w/heretic](https://github.com/p-e-w/heretic) | AGPL-3.0-or-later |

| `llm-wiki` | [karpathy/llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | — |
| `obsidian-second-brain` | [eugeniughelbur/obsidian-second-brain](https://github.com/eugeniughelbur/obsidian-second-brain) (fork: [akillness/obsidian-second-brain](https://github.com/akillness/obsidian-second-brain)) | MIT |
| `graphify` | [safishamsi/graphify](https://github.com/safishamsi/graphify) | MIT |
| `browser-harness` | [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | MIT |
| `scrapling` | [D4Vinci/Scrapling](https://github.com/D4Vinci/Scrapling) | BSD-3-Clause |
| `semble` | [MinishLab/semble](https://github.com/MinishLab/semble) | MIT |
| `strix` | [usestrix/strix](https://github.com/usestrix/strix) | Apache-2.0 |
| `autoresearch` | Andrej Karpathy methodology | — |
| `research-paper-writing` | [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | — |
| `academic-research` | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | CC-BY-NC-4.0 |
| `open-code-review` | [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | Apache-2.0 |
| Especificación de Habilidades de Agente | [agentskills.io](https://agentskills.io/specification) | — |

---

<!-- WHATS-NEW:START -->

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

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/akillness3q)

⭐ Si esto te ayuda, ¡dale estrella al repositorio!

```bash
gh api --silent --method PUT /user/starred/akillness/jeo-skills >/dev/null 2>&1 || true
```

</div>
