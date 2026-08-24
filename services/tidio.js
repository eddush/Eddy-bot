const TIDIO_BASE_URL = 'https://api.tidio.com';

function getHeaders() {
  const clientId = process.env.TIDIO_CLIENT_ID;
  const clientSecret = process.env.TIDIO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing TIDIO_CLIENT_ID or TIDIO_CLIENT_SECRET');
  }

  return {
    'X-Tidio-Openapi-Client-Id': clientId,
    'X-Tidio-Openapi-Client-Secret': clientSecret,
    'Accept': 'application/json; version=1',
    'Content-Type': 'application/json'
  };
}

async function tidioRequest(path, options = {}) {
  const response = await fetch(`${TIDIO_BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`Tidio API ${response.status}: ${text}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function createTicket({ email, name, subject, message }) {
  const data = await tidioRequest('/tickets/as-contact', {
    method: 'POST',
    body: JSON.stringify({
      contact_email: email,
      subject,
      message_content: message
    })
  });

  // Tidio normally returns the created ticket ID directly or in an id field.
  return data?.id ?? data?.ticket_id ?? data;
}

async function askLyro({ ticketId, subject, email, name, message }) {
  return tidioRequest('/lyro/tickets', {
    method: 'POST',
    body: JSON.stringify({
      ticket_id: String(ticketId),
      subject,
      contact_email: email,
      contact_name: name,
      recipient_email: process.env.TIDIO_RECIPIENT_EMAIL || email,
      messages: [
        {
          author_type: 'contact',
          message_content: message
        }
      ]
    })
  });
}

async function replyToTicket({ ticketId, content, authorType = 'contact' }) {
  return tidioRequest(`/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({
      author_type: authorType,
      content,
      message_type: 'public'
    })
  });
}

module.exports = { createTicket, askLyro, replyToTicket };
