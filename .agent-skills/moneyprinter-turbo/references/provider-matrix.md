# MoneyPrinterTurbo — Provider and Service Matrix

MoneyPrinterTurbo supports modular backends across scriptwriting, stock media, voice synthesis, and video generation.

## 1. LLM Scriptwriting Providers

| Provider | Supported Models | Config Key |
|---|---|---|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo | `openai` |
| **Anthropic** | claude-3-5-sonnet, claude-3-haiku | `anthropic` |
| **Google Gemini** | gemini-1.5-pro, gemini-1.5-flash | `gemini` |
| **DeepSeek** | deepseek-chat, deepseek-coder | `deepseek` |
| **Moonshot Kimi** | moonshot-v1-8k, moonshot-v1-32k, kimi-k3 | `moonshot` |
| **Aliyun Qwen** | qwen-turbo, qwen-plus, qwen-max | `qwen` |
| **Ollama (Local)** | llama3, qwen2.5, mistral | `ollama` |
| **OpenAI-Compatible** | Any custom base URL and model | `openai_compatible` |

## 2. Stock Media and Footage Sources

| Source | Type | Cost / Authentication |
|---|---|---|
| **Pexels** | Stock video and images | Free API key required (pexels.com) |
| **Pixabay** | Stock video and images | Free API key required (pixabay.com) |
| **Local Folder** | User-supplied MP4/JPG | Local path, no API required |
| **MiniMax H3** | AI Text-to-Video (768p/2K) | Paid API key (metaso.cn / minimax) |
| **Volcano Seedance** | AI Text-to-Video | Paid Ark API key (volcengine.com) |
| **MuAPI** | AI Video / LipSync | Paid API key (muapi.ai) |

## 3. Voice-over (TTS) Engines

| TTS Engine | Highlights | Requirements |
|---|---|---|
| **Edge TTS** | Free, zero-setup, multi-language natural voices | No key required |
| **Azure Speech** | High-fidelity neural voiceover | Azure Cognitive Services key |
| **ElevenLabs** | Premium cinematic emotional voices | ElevenLabs API key |
| **Gemini TTS** | Multilingual Google speech voices | Gemini API key |
| **SiliconFlow / Fish** | Fast open-source voice synthesis | Provider API key |

## 4. Multi-Platform Publishing Export

MoneyPrinterTurbo supports exporting and optional automated upload to:
- **YouTube Shorts** (via Google OAuth client)
- **TikTok** (via TikTok Web/OpenAPI integration)
- **Instagram Reels** (via Meta Graph API)
