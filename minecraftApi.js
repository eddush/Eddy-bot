// minecraftApi.js
const { Rcon } = require('rcon-client');

const RCON_CONFIG = {
  host: 'eddydev.ddns.net',
  port: 25575,
  password: 'K9x#mQ7$vL2!wR8*pT4^bN1@zF5&yU6('
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
