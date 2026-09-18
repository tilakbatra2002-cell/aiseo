import { env } from '@/lib/env';

/**
 * Webamazee AgentOS AI provider layer.
 * Providers: local (Ollama), OpenAI-compatible, Groq-compatible,
 * Anthropic-compatible, Custom API.
 *
 * The platform is fully functional with AI disabled (AI_ENABLED=false):
 * agents then operate on deterministic rules. When enabled, the model is
 * used for strategy narratives, content drafts and prioritization hints.
 */

export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface AiResult {
  text: string;
  provider: string;
  model: string;
  aiGenerated: true;
}

export async function aiComplete(messages: AiMessage[], opts?: { temperature?: number; model?: string }): Promise<AiResult | null> {
  if (!env.AI_ENABLED) return null;
  const model = opts?.model || env.AI_MODEL;
  const temperature = opts?.temperature ?? env.AI_TEMPERATURE;
  const provider = env.AI_PROVIDER;

  try {
    if (provider === 'local') {
      const res = await fetch(`${env.AI_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      const text = data.message?.content?.trim();
      return text ? { text, provider: 'local', model, aiGenerated: true } : null;
    }

    if (provider === 'anthropic-compatible' || provider === 'custom-anthropic') {
      const sys = messages.find((m) => m.role === 'system')?.content ?? '';
      const res = await fetch(`${env.AI_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.AI_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model, max_tokens: 1500, temperature, system: sys,
          messages: messages.filter((m) => m.role !== 'system'),
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`Anthropic-compatible HTTP ${res.status}`);
      const data = (await res.json()) as { content?: { text?: string }[] };
      const text = data.content?.map((c) => c.text ?? '').join('').trim();
      return text ? { text, provider, model, aiGenerated: true } : null;
    }

    // openai-compatible | groq | custom — chat completions shape
    const res = await fetch(`${env.AI_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.AI_API_KEY ? { authorization: `Bearer ${env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({ model, messages, temperature }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`AI provider HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { text, provider, model, aiGenerated: true } : null;
  } catch (e) {
    console.error('[AgentOS AI] completion failed:', (e as Error).message);
    return null;
  }
}

export function aiStatus() {
  return {
    enabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    baseUrl: env.AI_ENABLED ? env.AI_BASE_URL : undefined,
    model: env.AI_MODEL,
  };
}
