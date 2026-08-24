const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function askGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.4,
      max_tokens: 700
    })
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`Groq API ${response.status}: ${text}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data?.choices?.[0]?.message?.content?.trim() || '';
}

module.exports = { askGroq };
