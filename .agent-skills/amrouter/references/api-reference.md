# AMRouter API Reference

## Authentication

All requests require a bearer token:

```bash
Authorization: Bearer sk-amrouter-xxx
```

Get token in dashboard: **Settings** → **API Keys** → **Generate Key**

## Base URL

```
http://localhost:3001  (development)
https://amrouter.yourdomain.com  (production)
```

---

## Endpoints

### 1. Models

#### List All Models

```http
GET /v1/models
```

**Response:**

```json
{
  "object": "list",
  "data": [
    {"id": "openai/gpt-4o", "object": "model", "owned_by": "openai"},
    {"id": "anthropic/claude-3-opus", "object": "model", "owned_by": "anthropic"},
    {"id": "google/gemini-2-flash", "object": "model", "owned_by": "google"},
    ...
  ]
}
```

#### Get Model Info

```http
GET /v1/models/info?id=openai/gpt-4o
```

**Response:**

```json
{
  "id": "openai/gpt-4o",
  "provider": "openai",
  "contextWindow": 128000,
  "maxOutputTokens": 4096,
  "costPer1kInputTokens": 0.005,
  "costPer1kOutputTokens": 0.015,
  "supportsStreaming": true,
  "supportsVision": true
}
```

#### List Embedding Models

```http
GET /v1/models/embedding
```

**Response:**

```json
{
  "data": [
    {"id": "openai/text-embedding-3-small", "dimensions": 1536},
    {"id": "openai/text-embedding-3-large", "dimensions": 3072},
    {"id": "gemini/text-embedding-004", "dimensions": 768},
    ...
  ]
}
```

---

### 2. Chat Completions

#### Create Chat Completion

```http
POST /v1/chat/completions
```

**Headers:**

```
Authorization: Bearer sk-amrouter-xxx
Content-Type: application/json
```

**Request Body:**

```json
{
  "model": "openai/gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is 2+2?"}
  ],
  "temperature": 0.7,
  "max_tokens": 100,
  "stream": false
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | string | required | Model ID or combo name |
| `messages` | array | required | Chat history |
| `temperature` | number | 1 | Randomness (0–2) |
| `max_tokens` | number | - | Max output length |
| `top_p` | number | 1 | Nucleus sampling |
| `stream` | boolean | false | Stream response |
| `stop` | array | - | Stop sequences |
| `presence_penalty` | number | 0 | Presence penalty (−2 to 2) |
| `frequency_penalty` | number | 0 | Frequency penalty (−2 to 2) |

**Response (non-streaming):**

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1626000000,
  "model": "openai/gpt-4o",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 5,
    "total_tokens": 15
  },
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "2+2 equals 4."
      },
      "finish_reason": "stop"
    }
  ]
}
```

**Response (streaming):**

```
data: {"choices":[{"delta":{"content":"2"}}]}
data: {"choices":[{"delta":{"content":"+2"}}]}
data: {"choices":[{"delta":{"content":" equals 4"}}]}
data: [DONE]
```

**Example (curl):**

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-amrouter-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "Hi"}],
    "stream": true
  }'
```

---

### 3. Embeddings

#### Create Embedding

```http
POST /v1/embeddings
```

**Request Body:**

```json
{
  "model": "openai/text-embedding-3-small",
  "input": "The quick brown fox jumps over the lazy dog"
}
```

Or multiple inputs:

```json
{
  "model": "openai/text-embedding-3-small",
  "input": ["First text", "Second text", "Third text"],
  "encoding_format": "float"
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | string | required | Embedding model ID |
| `input` | string/array | required | Text(s) to embed |
| `encoding_format` | string | "float" | "float" or "base64" |
| `dimensions` | number | - | OpenAI v3 only |

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.123, -0.456, 0.789, ...],
      "index": 0
    }
  ],
  "model": "openai/text-embedding-3-small",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

**Example (curl):**

```bash
curl -X POST http://localhost:3001/v1/embeddings \
  -H "Authorization: Bearer sk-amrouter-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/text-embedding-3-small",
    "input": "Hello world"
  }' | jq '.data[0].embedding | length'
```

---

### 4. Image Generation

#### Create Image

```http
POST /v1/images/generations
```

**Request Body:**

```json
{
  "model": "openai/dall-e-3",
  "prompt": "A futuristic city at sunset",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "style": "vivid"
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | string | required | Image model ID |
| `prompt` | string | required | Image description |
| `n` | number | 1 | Number of images |
| `size` | string | "1024x1024" | Image size |
| `quality` | string | "standard" | "standard" or "hd" (DALL-E 3 only) |
| `style` | string | "natural" | "natural" or "vivid" (DALL-E 3 only) |

**Response:**

```json
{
  "created": 1626000000,
  "data": [
    {
      "url": "https://oaidalleapiprodpce.blob.core.windows.net/...",
      "revised_prompt": "A futuristic cityscape at sunset..."
    }
  ]
}
```

---

### 5. Audio

#### Speech Synthesis (TTS)

```http
POST /v1/audio/speech
```

**Request Body:**

```json
{
  "model": "openai/tts-1",
  "input": "Hello, this is a test.",
  "voice": "alloy",
  "speed": 1.0
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | string | required | TTS model ID |
| `input` | string | required | Text to speak |
| `voice` | string | required | Voice ID (alloy, echo, fable, onyx, nova, shimmer) |
| `speed` | number | 1.0 | Speed (0.25–4.0) |

**Response:** Audio file (binary)

---

#### Speech Recognition (STT)

```http
POST /v1/audio/transcriptions
```

**Request Body (multipart/form-data):**

```
file: <audio_file>
model: openai/whisper-1
language: en
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `file` | binary | required | Audio file (mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm) |
| `model` | string | required | STT model ID |
| `language` | string | - | Language code (en, es, fr, etc.) |
| `prompt` | string | - | Optional hint text |

**Response:**

```json
{
  "text": "Hello, this is a test."
}
```

---

### 6. Quota & Billing

#### Get Provider Quota

```http
GET /api/quota/providers
```

**Response:**

```json
[
  {
    "provider": "openai",
    "quotaLimit": 100000,
    "quotaUsed": 45230,
    "quotaRemaining": 54770,
    "costUSD": 12.45,
    "resetDate": "2026-08-12"
  },
  {
    "provider": "anthropic",
    "quotaLimit": 50000,
    "quotaUsed": 12500,
    "quotaRemaining": 37500,
    "costUSD": 5.00,
    "resetDate": "2026-08-12"
  }
]
```

#### Get Usage Stats

```http
GET /api/stats/usage
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `start` | string | 7 days ago | Start date (YYYY-MM-DD) |
| `end` | string | today | End date (YYYY-MM-DD) |
| `groupBy` | string | "day" | "day", "hour", "provider" |

**Response:**

```json
{
  "data": [
    {
      "date": "2026-07-12",
      "requests": 1250,
      "tokens": 450000,
      "costUSD": 2.35
    },
    {
      "date": "2026-07-13",
      "requests": 1100,
      "tokens": 420000,
      "costUSD": 2.10
    }
  ]
}
```

---

### 7. Combos (Fallback Chains)

#### List Combos

```http
GET /api/combos
```

**Response:**

```json
[
  {
    "id": "combo-1",
    "name": "vip",
    "description": "Premium fallback chain",
    "providers": ["openai", "anthropic", "gemini"],
    "strategy": "round-robin",
    "enabled": true
  },
  {
    "id": "combo-2",
    "name": "budget",
    "description": "Cost-optimized chain",
    "providers": ["groq", "mistral", "gemini"],
    "strategy": "least-cost",
    "enabled": true
  }
]
```

#### Create Combo

```http
POST /api/combos
```

**Request Body:**

```json
{
  "name": "experimental",
  "description": "New combo for testing",
  "providers": ["llama-2", "mistral", "openai"],
  "strategy": "round-robin"
}
```

#### Delete Combo

```http
DELETE /api/combos/{combo-id}
```

---

### 8. Providers (Admin)

#### List Configured Providers

```http
GET /api/providers
```

**Response:**

```json
[
  {
    "id": "provider-1",
    "name": "openai",
    "key": "sk-***",
    "enabled": true,
    "models": ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    "quotaLimit": 100000,
    "quotaUsed": 45230
  },
  {
    "id": "provider-2",
    "name": "anthropic",
    "key": "sk-ant-***",
    "enabled": true,
    "models": ["claude-3-opus", "claude-3-sonnet"],
    "quotaLimit": 50000,
    "quotaUsed": 12500
  }
]
```

#### Add Provider

```http
POST /api/providers
```

**Request Body:**

```json
{
  "name": "gemini",
  "key": "AIzaSy...",
  "quotaLimit": 50000
}
```

#### Update Provider

```http
PATCH /api/providers/{provider-id}
```

**Request Body:**

```json
{
  "quotaLimit": 75000,
  "enabled": true
}
```

#### Delete Provider

```http
DELETE /api/providers/{provider-id}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "message": "Invalid model",
    "type": "invalid_request_error",
    "code": 400
  }
}
```

### Common Error Codes

| Code | Message | Fix |
|---|---|---|
| `400` | Invalid request | Check payload syntax |
| `401` | Unauthorized | Check bearer token |
| `403` | Forbidden | Check permissions |
| `404` | Model not found | Run `GET /v1/models` to list |
| `429` | Rate limit | Wait and retry; check quota |
| `500` | Server error | Check logs; restart if needed |
| `503` | Service unavailable | All fallback providers failed |

---

## Rate Limiting

Rate limits are provider-specific:

- **OpenAI**: 500 requests/min (default)
- **Anthropic**: 50 requests/min (default)
- **Gemini**: 100 requests/min (default)

Check headers:

```
RateLimit-Limit-Requests: 500
RateLimit-Limit-Tokens: 2000000
RateLimit-Remaining-Requests: 499
RateLimit-Remaining-Tokens: 1999500
RateLimit-Reset-Requests: 1626087600
RateLimit-Reset-Tokens: 1626087600
```

---

## Streaming

For streaming responses, set `stream: true`:

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-amrouter-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": "Write a poem"}],
    "stream": true
  }'
```

Response is Server-Sent Events (SSE):

```
data: {"choices":[{"delta":{"content":"The"}}]}
data: {"choices":[{"delta":{"content":" moon"}}]}
data: {"choices":[{"delta":{"content":" shines"}}]}
data: [DONE]
```

Parse with:

```javascript
const response = await fetch(...);
const reader = response.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = new TextDecoder().decode(value);
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const json = JSON.parse(line.slice(6));
      const content = json.choices[0].delta.content;
      if (content) process.stdout.write(content);
    }
  }
}
```

---

**See also:** [../SKILL.md](../SKILL.md) for usage patterns, [../README.md](../README.md) for quick start.
