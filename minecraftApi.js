const crypto = require('crypto');

const pending = new Map();
const waiting = new Map();

function auth(req, res) {
  const expected = process.env.MINECRAFT_API_KEY;
  if (!expected) {
    res.status(500).send('Minecraft API key is not configured');
    return false;
  }

  const header = req.headers.authorization || '';
  if (header !== `Bearer ${expected}`) {
    res.status(401).send('Unauthorized');
    return false;
  }
  return true;
}

function requestBalance(username, timeoutMs = 15000) {
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      waiting.delete(id);
      reject(new Error('Minecraft server did not respond in time'));
    }, timeoutMs);

    pending.set(id, {
      id,
      username,
      createdAt: Date.now(),
    });
    waiting.set(id, { resolve, reject, timeout });
  });
}

function registerRoutes(app) {
  app.get('/api/minecraft/balance/pending', (req, res) => {
    if (!auth(req, res)) return;

    const now = Date.now();
    for (const [id, request] of pending) {
      if (now - request.createdAt > 20000) {
        pending.delete(id);
        const waiter = waiting.get(id);
        if (waiter) {
          clearTimeout(waiter.timeout);
          waiter.reject(new Error('Minecraft request expired'));
          waiting.delete(id);
        }
        continue;
      }

      // Claim the oldest request so only one Minecraft poller handles it.
      pending.delete(id);
      res.type('text/plain').send(`${id}|${request.username}`);
      return;
    }

    res.type('text/plain').send('NONE');
  });

  app.post('/api/minecraft/balance/result', (req, res) => {
    if (!auth(req, res)) return;

    const id = String(req.query.id || '');
    const balanceRaw = String(req.query.balance || '');
    const balance = Number(balanceRaw);

    if (!id || !Number.isFinite(balance)) {
      res.status(400).send('Invalid request');
      return;
    }

    const waiter = waiting.get(id);
    if (!waiter) {
      res.status(404).send('Request not found or expired');
      return;
    }

    clearTimeout(waiter.timeout);
    waiting.delete(id);
    waiter.resolve(balance);
    res.type('text/plain').send('OK');
  });
}

module.exports = {
  requestBalance,
  registerRoutes,
};
