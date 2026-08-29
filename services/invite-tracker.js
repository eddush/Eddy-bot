const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'invite-tracking.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/**
 * Reliable invite tracking.
 *
 * We keep a snapshot of every invite's use count and process member joins
 * sequentially per guild. This prevents two simultaneous joins from both
 * comparing against the same old snapshot and assigning the wrong inviter.
 */
module.exports = function installInviteTracker(client) {
  const stored = read();
  client.inviteTracker = new Map(Object.entries(stored));

  const snapshots = new Map();
  const queues = new Map();

  async function fetchSnapshot(guild) {
    const invites = await guild.invites.fetch();
    const snapshot = new Map();

    for (const invite of invites.values()) {
      // invite.uses can be null for some invite types; those cannot be
      // identified reliably using use-count comparison.
      if (typeof invite.uses === 'number') {
        snapshot.set(invite.code, {
          uses: invite.uses,
          inviterId: invite.inviter?.id || null
        });
      }
    }

    snapshots.set(guild.id, snapshot);
    return snapshot;
  }

  async function refreshGuild(guild) {
    try {
      await fetchSnapshot(guild);
    } catch (error) {
      console.warn(`[InviteTracker] Could not read invites for ${guild.id}: ${error.message}`);
    }
  }

  function enqueue(guild, job) {
    const previous = queues.get(guild.id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(job)
      .finally(() => {
        if (queues.get(guild.id) === next) queues.delete(guild.id);
      });

    queues.set(guild.id, next);
    return next;
  }

  async function processJoin(member) {
    const guild = member.guild;
    const before = snapshots.get(guild.id);

    // If the bot started after the last snapshot, establish a baseline.
    // Do not guess an inviter from historical uses.
    if (!before) {
      await refreshGuild(guild);
      return;
    }

    let after;
    try {
      after = await fetchSnapshot(guild);
    } catch (error) {
      console.warn(`[InviteTracker] Join check failed for ${guild.id}: ${error.message}`);
      return;
    }

    let usedInvite = null;

    // Find the invite whose use count increased. Normally exactly one does.
    for (const [code, current] of after.entries()) {
      const old = before.get(code);
      if (old && current.uses > old.uses) {
        usedInvite = { code, ...current };
        break;
      }
    }

    if (!usedInvite?.inviterId) {
      // Vanity URLs and some invite types cannot be attributed this way.
      console.log(`[InviteTracker] Could not attribute join of ${member.user.tag} in ${guild.id}`);
      return;
    }

    const guildData = client.inviteTracker.get(guild.id) || {};
    guildData[member.id] = {
      memberId: member.id,
      inviterId: usedInvite.inviterId,
      inviteCode: usedInvite.code,
      joinedAt: new Date().toISOString()
    };

    client.inviteTracker.set(guild.id, guildData);
    write(Object.fromEntries(client.inviteTracker));
  }

  client.once('ready', async () => {
    for (const guild of client.guilds.cache.values()) {
      await refreshGuild(guild);
    }
  });

  client.on('inviteCreate', async invite => {
    await refreshGuild(invite.guild);
  });

  client.on('inviteDelete', async invite => {
    await refreshGuild(invite.guild);
  });

  client.on('guildMemberAdd', member => {
    enqueue(member.guild, () => processJoin(member)).catch(error => {
      console.error(`[InviteTracker] Join processing error: ${error.stack || error}`);
    });
  });

  // The record is intentionally kept after a member leaves. The !invites
  // command filters the records against current guild membership, so a user
  // who leaves is automatically removed from the active count. If they join
  // again later, their record is replaced with the newest inviter data.
};
