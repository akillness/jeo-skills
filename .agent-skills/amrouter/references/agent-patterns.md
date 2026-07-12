# AMRouter Agent Patterns

Real-world patterns for agents using AMRouter.

---

## Pattern 1: Cost-Aware Model Selection

Route cheap requests to budget providers, expensive to premium.

```javascript
async function smartChat(userMessage, budget = 0.01) {
  // Check quota for each provider
  const quota = await fetch(`${AMROUTER_URL}/api/quota/providers`).then(r => r.json());
  const openaiQuota = quota.find(q => q.provider === 'openai');
  const groqQuota = quota.find(q => q.provider === 'groq');
  
  // Choose model based on quota and budget
  let model;
  if (openaiQuota.quotaRemaining > 50000) {
    model = 'openai/gpt-4o';  // Premium available
  } else if (groqQuota.quotaRemaining > 100000) {
    model = 'groq/mixtral-8x7b-32768';  // Budget fallback
  } else {
    throw new Error('Quota exhausted');
  }
  
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: userMessage }],
  });
  
  console.log(`Used model: ${model}, cost: $${res.usage.total_tokens * 0.001 * 0.01}`);
  return res.choices[0].message.content;
}

// Usage
const answer = await smartChat('Summarize this article...');
```

---

## Pattern 2: Fallback Combo Chain

Define a combo in dashboard; let AMRouter handle fallback.

**Dashboard Setup:**
1. **Combos** → **New**
2. Name: `vip`
3. Providers: `openai` → `anthropic` → `gemini` (fallback order)
4. Save

**Agent Code:**

```javascript
// Agent always uses 'vip' combo; AMRouter handles fallback
const res = await client.chat.completions.create({
  model: 'vip',  // Not a real provider, but a combo name
  messages: [{ role: 'user', content: 'Generate code' }],
});

// If OpenAI fails → tries Anthropic
// If Anthropic fails → tries Gemini
// If Gemini fails → error
```

---

## Pattern 3: Parallel Multi-Model Inference

Run same prompt across multiple providers in parallel.

```javascript
async function multiModelInference(prompt) {
  const models = [
    'openai/gpt-4o',
    'anthropic/claude-3-opus',
    'google/gemini-2-flash',
  ];
  
  const promises = models.map(model =>
    client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    })
  );
  
  const results = await Promise.all(promises);
  
  return results.map((res, i) => ({
    model: models[i],
    response: res.choices[0].message.content,
  }));
}

// Usage
const answers = await multiModelInference('What is consciousness?');
answers.forEach(({ model, response }) => {
  console.log(`${model}: ${response.slice(0, 100)}...`);
});
```

---

## Pattern 4: Context-Aware Provider Selection

Choose provider based on task characteristics.

```javascript
async function smartRoute(task, context) {
  let model;
  
  if (context.requiresVision) {
    // Vision tasks → GPT-4 Vision or Gemini Vision
    model = 'openai/gpt-4-vision';
  } else if (context.codeGeneration) {
    // Code tasks → GPT-4 or Claude 3 Opus
    model = 'anthropic/claude-3-opus';  // Better at code
  } else if (context.summarization) {
    // Summarization → Fast model
    model = 'groq/mixtral-8x7b-32768';  // Fast, cheap
  } else if (context.reasoning) {
    // Complex reasoning → Extended reasoning
    model = 'openai/gpt-4o';  // Best reasoning
  } else {
    // Default
    model = 'vip';  // Fallback combo
  }
  
  return await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: task }],
  });
}

// Usage
const res = await smartRoute('Generate Python function', {
  codeGeneration: true,
  requiresVision: false,
  reasoning: false,
  summarization: false,
});
```

---

## Pattern 5: Embedding + Search with Multi-Model

Generate embeddings with multiple models; find best match.

```javascript
async function multiModelSearch(query, documents) {
  const models = [
    'openai/text-embedding-3-small',
    'gemini/text-embedding-004',
  ];
  
  // Generate embeddings with all models
  const embeddings = await Promise.all(
    models.map(model =>
      fetch(`${AMROUTER_URL}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AMROUTER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [query, ...documents],
        }),
      }).then(r => r.json())
    )
  );
  
  // Find best match across all models
  const results = embeddings.map((emb, modelIdx) => {
    const queryVec = emb.data[0].embedding;
    const docVecs = emb.data.slice(1).map(d => d.embedding);
    
    // Cosine similarity
    const scores = docVecs.map((docVec, docIdx) => {
      const dot = queryVec.reduce((sum, q, i) => sum + q * docVec[i], 0);
      const normQ = Math.sqrt(queryVec.reduce((sum, q) => sum + q * q, 0));
      const normD = Math.sqrt(docVec.reduce((sum, d) => sum + d * d, 0));
      return { docIdx, score: dot / (normQ * normD), model: models[modelIdx] };
    });
    
    return scores.sort((a, b) => b.score - a.score)[0];
  });
  
  // Return best result
  const best = results.sort((a, b) => b.score - a.score)[0];
  return {
    document: documents[best.docIdx],
    score: best.score,
    model: best.model,
  };
}
```

---

## Pattern 6: Quota Monitoring & Alerting

Monitor provider quota; trigger alerts or switch models.

```javascript
class QuotaMonitor {
  constructor(warningThreshold = 0.2) {
    this.warningThreshold = warningThreshold;
    this.checkInterval = 5 * 60 * 1000;  // 5 minutes
  }
  
  async start() {
    setInterval(() => this.checkQuota(), this.checkInterval);
  }
  
  async checkQuota() {
    const quota = await fetch(`${AMROUTER_URL}/api/quota/providers`).then(r => r.json());
    
    for (const provider of quota) {
      const usageRatio = provider.quotaUsed / provider.quotaLimit;
      
      if (usageRatio > this.warningThreshold) {
        console.warn(`⚠️ ${provider.provider}: ${(usageRatio * 100).toFixed(1)}% quota used`);
        
        if (usageRatio > 0.9) {
          console.error(`🚨 ${provider.provider}: QUOTA CRITICAL, SWITCHING PROVIDERS`);
          // Switch to fallback provider
          global.defaultModel = 'budget';
        }
      }
    }
  }
}

// Usage
const monitor = new QuotaMonitor();
monitor.start();
```

---

## Pattern 7: Stream with Fallback

Stream response; if provider fails, fallback to another.

```javascript
async function streamWithFallback(prompt, primaryModel = 'openai/gpt-4o', fallbackModel = 'anthropic/claude-3-sonnet') {
  const models = [primaryModel, fallbackModel];
  
  for (const model of models) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });
      
      console.log(`Streaming from: ${model}`);
      
      for await (const chunk of res) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '');
      }
      
      return;  // Success
    } catch (err) {
      console.error(`${model} failed: ${err.message}`);
      if (model === models[models.length - 1]) throw err;  // Last model, throw
      // Otherwise, continue to next model
    }
  }
}

// Usage
await streamWithFallback('Write a story...');
```

---

## Pattern 8: Rate Limiting & Backoff

Respect rate limits; retry with exponential backoff.

```javascript
async function callWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429) {  // Rate limited
        const delay = Math.pow(2, i) * 1000;  // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;  // Other error, don't retry
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const res = await callWithBackoff(() =>
  client.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'Hi' }],
  })
);
```

---

## Pattern 9: Cost Tracking Per Request

Log cost of each request for billing/monitoring.

```javascript
class CostTracker {
  constructor() {
    this.totalCost = 0;
    this.requests = [];
  }
  
  async call(model, messages, options = {}) {
    const res = await client.chat.completions.create({
      model,
      messages,
      ...options,
    });
    
    // Estimate cost based on model and tokens
    const costPerInput = this.getCostPerToken(model, 'input');
    const costPerOutput = this.getCostPerToken(model, 'output');
    const cost = (res.usage.prompt_tokens * costPerInput) + (res.usage.completion_tokens * costPerOutput);
    
    this.totalCost += cost;
    this.requests.push({
      model,
      timestamp: new Date(),
      tokens: res.usage.total_tokens,
      cost,
      content: res.choices[0].message.content,
    });
    
    return res.choices[0].message.content;
  }
  
  getCostPerToken(model, type) {
    const costs = {
      'openai/gpt-4o': { input: 0.000005, output: 0.000015 },
      'anthropic/claude-3-opus': { input: 0.000015, output: 0.000075 },
      'google/gemini-2-flash': { input: 0.000001, output: 0.000002 },
      'groq/mixtral-8x7b-32768': { input: 0.00000027, output: 0.00000027 },
    };
    return costs[model]?.[type] || 0;
  }
  
  report() {
    console.log(`\n=== Cost Report ===`);
    console.log(`Total requests: ${this.requests.length}`);
    console.log(`Total cost: $${this.totalCost.toFixed(4)}`);
    console.log(`Average cost per request: $${(this.totalCost / this.requests.length).toFixed(4)}`);
  }
}

// Usage
const tracker = new CostTracker();
const answer = await tracker.call('vip', [{ role: 'user', content: 'Explain quantum computing' }]);
tracker.report();
```

---

## Pattern 10: Combo Performance Testing

Compare combos; find the best one.

```javascript
async function testCombos(prompt, testCombos = ['vip', 'budget', 'fast']) {
  const results = [];
  
  for (const combo of testCombos) {
    const start = Date.now();
    
    try {
      const res = await client.chat.completions.create({
        model: combo,
        messages: [{ role: 'user', content: prompt }],
      });
      
      const duration = Date.now() - start;
      results.push({
        combo,
        success: true,
        duration,
        tokens: res.usage.total_tokens,
        content: res.choices[0].message.content.slice(0, 50),
      });
    } catch (err) {
      const duration = Date.now() - start;
      results.push({
        combo,
        success: false,
        duration,
        error: err.message,
      });
    }
  }
  
  // Sort by speed
  results.sort((a, b) => a.duration - b.duration);
  
  console.table(results);
  return results[0];  // Return fastest
}

// Usage
await testCombos('Write a function in JavaScript', ['vip', 'budget', 'fast']);
```

---

## Pattern 11: Vision + Classification

Use vision models to classify images, then route to appropriate LLM.

```javascript
async function classifyAndRespond(imageUrl, question) {
  // Step 1: Classify image with vision model
  const classification = await client.chat.completions.create({
    model: 'openai/gpt-4-vision',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: 'Classify this image in one word (e.g., animal, landscape, object)' },
        ],
      },
    ],
  });
  
  const category = classification.choices[0].message.content.toLowerCase();
  
  // Step 2: Route to appropriate model based on category
  let model;
  if (category.includes('person') || category.includes('face')) {
    model = 'anthropic/claude-3-opus';  // Better at faces
  } else if (category.includes('text') || category.includes('document')) {
    model = 'openai/gpt-4-vision';  // Better at OCR
  } else {
    model = 'google/gemini-2-vision';  // General purpose
  }
  
  // Step 3: Answer question with routed model
  const answer = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: question },
        ],
      },
    ],
  });
  
  return answer.choices[0].message.content;
}

// Usage
const answer = await classifyAndRespond(
  'https://example.com/image.jpg',
  'What is in this image?'
);
```

---

## Pattern 12: Caching with Hash Keys

Cache API responses to avoid redundant calls.

```javascript
class ResponseCache {
  constructor(ttlMs = 60 * 60 * 1000) {  // 1 hour
    this.cache = new Map();
    this.ttl = ttlMs;
  }
  
  getKey(model, messages) {
    const hash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({ model, messages }))
      .digest('hex');
    return hash;
  }
  
  async get(model, messages) {
    const key = this.getKey(model, messages);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      console.log('Cache hit ✓');
      return cached.response;
    }
    
    // Cache miss, call API
    const response = await client.chat.completions.create({
      model,
      messages,
    });
    
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });
    
    console.log('Cache miss, calling API');
    return response;
  }
  
  clear() {
    this.cache.clear();
  }
}

// Usage
const cache = new ResponseCache();
const res = await cache.get('openai/gpt-4o', [{ role: 'user', content: 'What is 2+2?' }]);
const res2 = await cache.get('openai/gpt-4o', [{ role: 'user', content: 'What is 2+2?' }]);  // Cached
```

---

## Integration with deep-agents-core

Register AMRouter as a tool:

```javascript
const tools = {
  amrouter_chat: {
    description: 'Call any LLM via AMRouter with auto-fallback',
    input_schema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Model or combo name' },
        prompt: { type: 'string', description: 'User message' },
        temperature: { type: 'number', description: '0–2' },
      },
      required: ['model', 'prompt'],
    },
  },
};

// Tool handler
async function handleAmrouterChat({ model, prompt, temperature = 0.7 }) {
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  });
  return res.choices[0].message.content;
}
```

---

**See also:** [../SKILL.md](../SKILL.md), [api-reference.md](./api-reference.md)
