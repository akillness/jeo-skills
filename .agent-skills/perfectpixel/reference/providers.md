# PerfectPixel 프로바이더 / 모델 / 설정

`ppgen`은 4개 이미지 생성 백엔드를 지원한다. 활성 프로바이더와 키는 다음 순서로 해석된다.

1. 설치형 앱 설정 파일 `~/.config/perfectpixel/config.json` (있으면 최우선)
2. 작업 디렉토리 또는 실행 파일 옆의 `.env` / `.env.local`
3. OS 환경변수
4. CLI 플래그 `-provider` / `-key` / `-model` (위 모든 것보다 우선, 강제 지정)

프로바이더를 명시하지 않으면 키가 설정된 첫 프로바이더를 자동 선택하며, 기본값은 `gemini`다.

## 프로바이더별 환경변수 · 모델

| 프로바이더 | `-provider` 값 | API 키 환경변수 | 기본 모델 | 대체 모델 |
|---|---|---|---|---|
| Gemini (Google AI Studio) | `gemini` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `gemini-3-pro-image` | `gemini-3-pro-image-preview`, `gemini-2.5-flash-image` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `google/gemini-3-pro-image-preview` | `google/gemini-2.5-flash-image` |
| fal.ai | `fal` | `FAL_KEY` / `FAL_API_KEY` | `fal-ai/nano-banana-pro` | `fal-ai/nano-banana`, `fal-ai/flux-pro/v1.1-ultra` |
| BytePlus (ARK) | `byteplus` | `BYTEPLUS_API_KEY` / `ARK_API_KEY` | `seedream-4-0-250828` | `seedream-3-0-t2i-250415` |

## .env 예시

```dotenv
# 사용할 프로바이더의 키만 채우면 된다.
GEMINI_API_KEY=
OPENROUTER_API_KEY=
FAL_KEY=
BYTEPLUS_API_KEY=
```

## 스타일 키 (`-style`)

- `pixel` — 진짜 도트 픽셀아트 (공유 팔레트 양자화 + 그리드 스냅), 기본값
- `chibi` — 2~3등신 귀여운 비율
- `cartoon` — 부드러운 만화풍
- `retro16` — 16비트 콘솔풍 제한 팔레트

## 품질·비용 팁

- `gemini-3-pro-image`(Nano Banana Pro) 계열이 캐릭터 일관성/모션 품질이 가장 좋다.
- 상태 1개당 최대 `-attempts`회(기본 3) 재생성하므로, 큰 배치 전에 `-states idle` 한 개로
  시범 실행해 스타일/품질을 확인하면 비용을 아낄 수 있다.
- `-all`(100여 상태)은 호출 수가 매우 많다. 실행 전 규모를 사용자에게 알릴 것.
