const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function askGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
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
    const error = new Error(`Groq API ${response.status}: ${details}`);
    error.status = response.status;
    error.data = data;
    console.error(`[Groq] Request failed (${model}):`, details);
    throw error;
  }

  const answer = data?.choices?.[0]?.message?.content?.trim() || '';
  console.log(`[Groq] ${model} answered (${answer.length} chars)`);
  return answer;
}

module.exports = { askGroq };
