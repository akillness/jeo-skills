---
name: firebase-ai-logic
description: >
  Integrate Firebase AI Logic as the direct Firebase app/client SDK lane for
  Gemini-powered features. Use when the user needs in-app text/chat/multimodal
  generation, structured output, streaming, or App Check-aware Firebase app
  integration without a separate workflow framework. Triggers on: Firebase AI
  Logic, Gemini in Firebase app, Firebase AI SDK, client-side Gemini, in-app AI
  feature, and direct Firebase model integration. Route server-owned flows,
  tool calling, RAG, evaluation, and reusable backend orchestration to `genkit`.
metadata:
  tags: firebase, ai, gemini, generative-ai, sdk
  platforms: Claude, ChatGPT, Gemini
---


# Firebase AI Logic Integration


## When to use this skill

- **Direct Firebase app integration**: add Gemini-powered features inside a Firebase app without standing up a workflow framework first
- **Client/app-side generation**: text, chat, multimodal prompts, structured output, or streaming inside app experiences
- **Firebase production controls**: App Check-aware usage, quota/cost awareness, and app-level Firebase integration concerns
- **Simple AI product features**: summaries, chat helpers, assistant UI, image or content generation in the app layer

## When not to use this skill

- **Server-owned flows, tool calling, RAG, evals, or reusable backend orchestration** → use `genkit`
- **Firebase CLI / project / emulator / deploy operations** → use `firebase-cli`

## Instructions

### Step 1: Firebase Project Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize project
firebase init
```

### Step 2: Enable AI Logic

In Firebase Console:
1. Select **Build > AI Logic**
2. Click **Get Started**
3. Enable the Gemini API

### Step 3: Install SDK

**Web (JavaScript)**:
```bash
npm install firebase @anthropic-ai/sdk
```

**Initialization code**:
```typescript
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel } from 'firebase/ai';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
};

const app = initializeApp(firebaseConfig);
const ai = getAI(app);
const model = getGenerativeModel(ai, { model: "gemini-2.0-flash" });
```

### Step 4: Implement AI Features

**Text generation**:
```typescript
async function generateContent(prompt: string) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Example usage
const response = await generateContent("Explain the key features of Firebase.");
console.log(response);
```

**Streaming response**:
```typescript
async function streamContent(prompt: string) {
  const result = await model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    console.log(text);
  }
}
```

**Multimodal (image + text)**:
```typescript
async function analyzeImage(imageUrl: string, prompt: string) {
  const imagePart = {
    inlineData: {
      data: await fetchImageAsBase64(imageUrl),
      mimeType: "image/jpeg"
    }
  };

  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text();
}
```

### Step 5: Configure Security Rules

**Firebase Security Rules**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Protect AI request logs
    match /ai_logs/{logId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
  }
}
```

## Output format

### Project structure
```
project/
├── src/
│   ├── ai/
│   │   ├── client.ts        # Initialize AI client
│   │   ├── prompts.ts       # Prompt templates
│   │   └── handlers.ts      # AI handlers
│   └── firebase/
│       └── config.ts        # Firebase config
├── firebase.json
└── .env.local               # API key (gitignored)
```

## Best practices

1. **Prompt optimization**: write clear, specific prompts
2. **Error handling**: implement a fallback when AI responses fail
3. **Rate Limiting**: limit usage and manage costs
4. **Caching**: cache responses for repeated requests
5. **Security**: manage API keys via environment variables

## Constraints

### Required Rules (MUST)
1. Do not hardcode API keys in code
2. Validate user input
3. Implement error handling

### Prohibited (MUST NOT)
1. Do not send sensitive data to the AI
2. Do not allow unlimited API calls

## References

- [Firebase AI Logic Docs](https://firebase.google.com/docs/ai-logic)
- [Gemini API](https://ai.google.dev/)
- [Firebase SDK](https://firebase.google.com/docs/web/setup)

## Metadata

- **Version**: 1.0.0
- **Last updated**: 2025-01-05
- **Supported platforms**: Claude, ChatGPT, Gemini

## Examples

### Example 1: Basic usage
<!-- Add example content here -->

### Example 2: Advanced usage
<!-- Add advanced example content here -->
