const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_URL = 'https://api.groq.com/openai/v1/models';

// Preferred models are tried in this order. The API key's actual model list
// is checked first, so we never intentionally call a model the key cannot see.
const PREFERRED_MODELS = [
  process.env.GROQ_MODEL,
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile'
].filter(Boolean);

let selectedModel = null;
let modelCheckPromise = null;

async function getAvailableModels(apiKey) {
  const response = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const details = data?.error?.message || text || 'Unknown Groq models API error';
    throw new Error(`Groq models API ${response.status}: ${details}`);
  }

  return (data?.data || []).map(model => model.id).filter(Boolean);
}

async function selectModel(apiKey) {
  if (selectedModel) return selectedModel;
  if (modelCheckPromise) return modelCheckPromise;

  modelCheckPromise = (async () => {
    const available = await getAvailableModels(apiKey);
    console.log('[Groq] Available models:', available.join(', ') || '(none)');

    const preferred = PREFERRED_MODELS.find(model => available.includes(model));
    if (preferred) {
      selectedModel = preferred;
      console.log(`[Groq] Selected model: ${selectedModel}`);
      return selectedModel;
    }

    // Fallback: choose a model returned by the API rather than guessing a name.
    const fallback = available.find(model =>
      !model.includes('whisper') &&
      !model.includes('guard') &&
      !model.includes('compound')
    );

    if (!fallback) throw new Error('No usable Groq chat model is available for this API key');

    selectedModel = fallback;
    console.log(`[Groq] Selected fallback model: ${selectedModel}`);
    return selectedModel;
  })();

  try {
    return await modelCheckPromise;
  } finally {
    modelCheckPromise = null;
  }
}

async function askGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const model = await selectModel(apiKey);
  const maxTokens = Math.min(Math.max(Number(process.env.GROQ_MAX_TOKENS || 800), 1), 2000);

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens
    })
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const details = data?.error?.message || text || 'Unknown Groq API error';
    // If the selected model stops being available, forget it so the next
    // request re-checks the API's current model list.
    selectedModel = null;
    console.error(`[Groq] Request failed (${model}):`, details);
    const error = new Error(`Groq API ${response.status}: ${details}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  const answer = data?.choices?.[0]?.message?.content?.trim() || '';
  console.log(`[Groq] ${model} answered (${answer.length} chars)`);
  return answer;
}

module.exports = { askGroq };
