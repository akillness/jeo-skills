---
name: perfectpixel
description: >
  AI 애니메이션 스프라이트 생성. 텍스트 설명 한 줄로 캐릭터 + 동작 애니메이션(걷기·달리기·공격·마법 등 100여 종) + 8방향 스프라이트 세트를 만들고, 게임 엔진용 번들(스프라이트시트 · manifest.json · Aseprite JSON · 상태별 GIF/APNG · 개별 프레임 PNG)로 내보냅니다. Use when the user wants to generate game sprites, character animations, sprite sheets, sprite atlases, or 8-direction sprite sets from a text description. Triggers on: perfectpixel, ppgen, sprite generation, character animation, sprite sheet, sprite atlas, 8-direction sprite, god-tibo-imagen sprite, gemini sprite.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: game-development, sprite-generation, pixel-art, character-animation, sprite-sheet, god-tibo-imagen, gemini, wails, go
  platforms: Claude Code, Codex, Gemini CLI, OpenCode, All
  keyword: perfectpixel
  version: 1.0.0
  source: gykim80/perfectpixel-studio
  license: MIT
---

# PerfectPixel — AI 애니메이션 스프라이트 생성

설치형 데스크톱 앱과 동일한 생성 파이프라인(프롬프트 → AI 이미지 생성 → 배경 제거 → 프레임 추출 → 품질 검사 → 보정 재생성 → 픽셀 양자화)을 헤드리스 CLI(`ppgen`)로 구동해, 게임에 바로 쓸 수 있는 스프라이트 번들을 만든다.

## When to use this skill

- 사용자가 캐릭터/동작 애니메이션/스프라이트시트/8방향 세트 생성을 요청할 때 사용합니다.
- `god-tibo-imagen` (Codex ChatGPT 백엔드) 또는 `gemini` (Google AI Studio) 모델을 사용하여 고품질의 일관된 스프라이트를 생성하고자 할 때 사용합니다.
- 텍스트 설명 한 줄로 캐릭터를 정의하고, 100여 종의 동작 프리셋을 적용하여 애니메이션을 생성할 때 사용합니다.
- 5방향 AI 생성 및 3방향 수평 미러링을 통해 8방향 스프라이트 세트를 효율적으로 구축하고자 할 때 사용합니다.

## Instructions

### Step 0 — 사전 준비 (매 실행 첫 단계)

`ppgen` 바이너리를 확인/설치한다. 이 `SKILL.md`가 있는 디렉토리(= 스킬 루트)에서 설치 스크립트를 실행한다. 성공하면 **바이너리 절대경로를 마지막 줄로 출력**한다.

```bash
# SKILL_DIR = 이 SKILL.md 파일이 있는 디렉토리의 절대경로로 치환할 것.
PPGEN="$(bash "$SKILL_DIR/scripts/install.sh" 2>/tmp/ppgen-install.log | tail -1)"
echo "$PPGEN"   # 이후 모든 ppgen 호출에 이 경로를 사용
```

### Step 1 — API 키 및 프로바이더 설정

`ppgen`은 다음 순서로 키를 찾는다: `config.json`(설치형 앱 설정) → 작업 디렉토리/실행 파일 옆의 `.env`·`.env.local` → OS 환경변수 → CLI `-key` 플래그.

- **Gemini**: `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`) 설정. 기본 모델: `gemini-3-pro-image`
- **GodTiboImagen**: `god-tibo-imagen` 프로바이더는 로컬 `~/.codex/auth.json`을 사용하므로 별도의 API 키가 필요하지 않으나, CLI 구동을 위해 `-key dummy`와 같이 더미 키를 전달해야 합니다. 기본 모델: `gpt-5.4`

### Step 2 — 요청 해석 → 플래그 매핑

사용자의 자연어 요청에서 다음을 뽑아 `ppgen` 플래그로 매핑한다.

- 캐릭터 설명 → `-desc "..."` (영어 프롬프트 권장)
- 스타일 → `-style` 중 하나: `pixel`(기본), `chibi`, `cartoon`, `retro16`
- 만들 동작들 → `-states "idle,walk,attack"` (쉼표 구분). 동작 이름은 영문 프리셋 키다.
- 프로바이더 지정 → `-provider god-tibo-imagen` 또는 `-provider gemini`
- 모델 지정 → `-model gpt-5.4` 또는 `-model gemini-3-pro-image`
- 출력 폴더 → `-out ./output-dir` (기본 `./perfectpixel-out`)

### Step 3 — 실행

항상 `-json` 으로 실행해 기계 판독 가능한 요약을 받는다.

```bash
"$PPGEN" \
  -provider god-tibo-imagen \
  -desc "a small knight with silver armor and a blue plume" \
  -style pixel \
  -states "idle,walk,run,attack" \
  -out ./knight-sprites \
  -key dummy \
  -json
```

## Examples

### 예제 1: god-tibo-imagen을 사용한 기본 캐릭터 및 idle 애니메이션 생성
```bash
"$PPGEN" \
  -provider god-tibo-imagen \
  -desc "a tiny blue slime" \
  -states "idle" \
  -out ./slime-sprites \
  -key dummy \
  -json
```

### 예제 2: gemini를 사용한 8방향 걷기 애니메이션 생성
```bash
"$PPGEN" \
  -provider gemini \
  -desc "a red wizard with a staff" \
  -dirset "walk" \
  -out ./wizard-walk-8dir \
  -key "$GEMINI_API_KEY" \
  -json
```

## Best practices

1. **시범 실행**: 비용과 시간을 아끼기 위해 먼저 1개 상태로 시범 실행(`-states idle`)하여 스타일과 품질을 확인하고, 사용자 승인 후 전체 상태를 생성하십시오.
2. **배경색 규정 준수**: AI 모델이 마젠타(#FF00FF) 단색 배경을 완벽하게 칠하도록 프롬프트에 배경색 규정을 강제하고, 캐릭터 디자인에는 마젠타/분홍/보라색 계열을 피해 매팅 시 캐릭터가 지워지지 않도록 하십시오.
3. **품질 보정 루프**: `-attempts` 플래그(기본 3회)를 활용하여 프레임 수 불일치나 캐릭터 정체성 변형(identity drift)이 감지되었을 때 자동으로 보정 힌트를 주입하여 재생성하도록 하십시오.

## References

- [gykim80/perfectpixel-studio](https://github.com/gykim80/perfectpixel-studio)
- [NomaDamas/god-tibo-imagen](https://github.com/NomaDamas/god-tibo-imagen)
- [PerfectPixel 동작 프리셋 카탈로그](reference/presets.md)
- [PerfectPixel 프로바이더 / 모델 / 설정](reference/providers.md)
