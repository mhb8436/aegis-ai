import { v4 as uuidv4 } from 'uuid';
import type {
  LLMProviderConfig,
  LLMProxyRequest,
  LLMProxyResponse,
} from '@aegis/common';
import { deepInspect } from '../guards/deep-inspector.js';
import { analyzeOutput } from '../guards/output-guard.js';
import type { ModelRegistry } from '../ml/index.js';

// --- Provider payload builders ---

interface ProviderPayload {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

type PayloadBuilder = (
  request: LLMProxyRequest,
  config: LLMProviderConfig,
  apiKey: string,
) => ProviderPayload;

const buildOpenAIPayload: PayloadBuilder = (request, config, apiKey) => ({
  url: `${config.baseUrl}/v1/chat/completions`,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...config.headers,
  },
  body: JSON.stringify({
    model: request.model ?? config.defaultModel ?? 'gpt-4',
    messages: request.messages,
    stream: request.stream ?? false,
    ...request.options,
  }),
});

const buildAnthropicPayload: PayloadBuilder = (request, config, apiKey) => ({
  url: `${config.baseUrl}/v1/messages`,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...config.headers,
  },
  body: JSON.stringify({
    model: request.model ?? config.defaultModel ?? 'claude-sonnet-4-20250514',
    messages: request.messages,
    stream: request.stream ?? false,
    max_tokens: (request.options?.max_tokens as number | undefined) ?? 4096,
    ...request.options,
  }),
});

const buildDefaultPayload: PayloadBuilder = (request, config, apiKey) => ({
  url: config.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...config.headers,
  },
  body: JSON.stringify({
    model: request.model ?? config.defaultModel,
    messages: request.messages,
    stream: request.stream ?? false,
    ...request.options,
  }),
});

const payloadBuilders: Record<string, PayloadBuilder> = {
  openai: buildOpenAIPayload,
  azure: buildOpenAIPayload,
  anthropic: buildAnthropicPayload,
};

// --- Provider response parsers ---

type ResponseParser = (data: unknown) => string;

const parseOpenAIResponse: ResponseParser = (data) => {
  const d = data as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content ?? '';
};

const parseAnthropicResponse: ResponseParser = (data) => {
  const d = data as { content?: Array<{ text?: string }> };
  return d.content?.[0]?.text ?? '';
};

const parseDefaultResponse: ResponseParser = (data) => {
  if (typeof data === 'string') return data;
  const d = data as Record<string, unknown>;
  if (typeof d.content === 'string') return d.content;
  if (typeof d.text === 'string') return d.text;
  return JSON.stringify(data);
};

const responseParsers: Record<string, ResponseParser> = {
  openai: parseOpenAIResponse,
  azure: parseOpenAIResponse,
  anthropic: parseAnthropicResponse,
};

// --- SSE stream reader ---

const readSSEStream = async (response: Response, provider: string): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  const chunks: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);

          if (provider === 'anthropic') {
            const delta = (parsed as { delta?: { text?: string } }).delta?.text;
            if (delta) chunks.push(delta);
          } else {
            const delta = (parsed as { choices?: Array<{ delta?: { content?: string } }> })
              .choices?.[0]?.delta?.content;
            if (delta) chunks.push(delta);
          }
        } catch {
          // skip unparseable SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join('');
};

// --- Main proxy function ---

export const proxyLLMChat = async (
  request: LLMProxyRequest,
  providers: readonly LLMProviderConfig[],
  dryRun: boolean,
  mlRegistry?: ModelRegistry | null,
): Promise<LLMProxyResponse> => {
  const startTime = Date.now();
  const requestId = uuidv4();

  // Step 1: Input Guard
  const fullMessage = request.messages.map((m) => m.content).join('\n');
  const inspectResult = await deepInspect({ message: fullMessage }, mlRegistry);

  if (!inspectResult.passed) {
    return {
      requestId,
      inputGuard: { passed: false, riskScore: inspectResult.riskScore },
      blocked: true,
      blockReason: 'Input blocked by deep inspection guard',
      latencyMs: Date.now() - startTime,
    };
  }

  // Step 2: Find provider
  const providerConfig = providers.find((p) => p.name === request.provider);
  if (!providerConfig) {
    return {
      requestId,
      inputGuard: { passed: true, riskScore: inspectResult.riskScore },
      blocked: true,
      blockReason: `Unknown LLM provider: '${request.provider}'`,
      latencyMs: Date.now() - startTime,
    };
  }

  // Step 3: Resolve API key
  const apiKey = process.env[providerConfig.apiKeyEnvVar] ?? '';

  // Step 4: Dry-run mode
  if (dryRun) {
    const dryRunContent = `[DRY_RUN] provider=${request.provider}, model=${request.model ?? providerConfig.defaultModel ?? 'default'}, messages=${request.messages.length}`;
    const outputAnalysis = await analyzeOutput(dryRunContent, undefined, mlRegistry);
    return {
      requestId,
      inputGuard: { passed: true, riskScore: inspectResult.riskScore },
      outputGuard: {
        passed: !outputAnalysis.containsPii,
        riskScore: outputAnalysis.containsPii ? 0.8 : 0,
        piiDetected: outputAnalysis.piiFindings.map((f) => f.type),
      },
      llmResponse: { content: dryRunContent },
      blocked: false,
      latencyMs: Date.now() - startTime,
    };
  }

  // Step 5: Build payload and call API
  const builder = payloadBuilders[request.provider] ?? buildDefaultPayload;
  const payload = builder(request, providerConfig, apiKey);

  try {
    const fetchResponse = await fetch(payload.url, {
      method: 'POST',
      headers: payload.headers,
      body: payload.body,
    });

    if (!fetchResponse.ok) {
      return {
        requestId,
        inputGuard: { passed: true, riskScore: inspectResult.riskScore },
        blocked: true,
        blockReason: `LLM API returned status ${fetchResponse.status}`,
        latencyMs: Date.now() - startTime,
      };
    }

    // Step 6: Parse response
    let responseContent: string;

    if (request.stream) {
      responseContent = await readSSEStream(fetchResponse, request.provider);
    } else {
      const responseData = await fetchResponse.json();
      const parser = responseParsers[request.provider] ?? parseDefaultResponse;
      responseContent = parser(responseData);
    }

    // Step 7: Output Guard
    const outputAnalysis = await analyzeOutput(responseContent, undefined, mlRegistry);

    return {
      requestId,
      inputGuard: { passed: true, riskScore: inspectResult.riskScore },
      outputGuard: {
        passed: !outputAnalysis.containsPii,
        riskScore: outputAnalysis.containsPii ? 0.8 : 0,
        piiDetected: outputAnalysis.piiFindings.map((f) => f.type),
      },
      llmResponse: {
        content: outputAnalysis.sanitizedOutput ?? responseContent,
      },
      blocked: false,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      requestId,
      inputGuard: { passed: true, riskScore: inspectResult.riskScore },
      blocked: true,
      blockReason: `LLM API call failed: ${(err as Error).message}`,
      latencyMs: Date.now() - startTime,
    };
  }
};
