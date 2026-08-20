// minecraftApi.js
const { Rcon } = require('rcon-client');

const RCON_CONFIG = {
  host: 'YOUR_MINECRAFT_SERVER_IP',
  port: 25575,
  password: 'YourRconSecretPassword'
};

async function requestBalance(username) {
  const rcon = await Rcon.connect(RCON_CONFIG);

  try {
    const res = await rcon.send(`getapibalance ${username}`);

    if (res.includes('API_ERROR:NOT_FOUND')) {
      throw new Error('Player not found.');
    }

    const match = res.match(/API_RESULT:([0-9.]+)/);
    if (!match) {
      throw new Error('Could not parse balance.');
    }

    return parseFloat(match[1]);
  } finally {
    await rcon.end();
  }
}

module.exports = { requestBalance };
