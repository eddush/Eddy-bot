const BASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE || '';

function configError() {
  if (!BASE_URL || !API_KEY) {
    return 'חסרים משתני הסביבה SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY בבוט.';
  }
  return null;
}

async function selectRows(table, params) {
  const url = new URL(BASE_URL + '/rest/v1/' + encodeURIComponent(table));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: {
      apikey: API_KEY,
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error('Supabase query failed (' + response.status + '): ' + details.slice(0, 180));
  }
  return response.json();
}

function decodeMetaValue(permission, metaKey) {
  const prefix = 'meta.' + metaKey + '.';
  if (!String(permission).toLowerCase().startsWith(prefix.toLowerCase())) return null;
  return String(permission).slice(prefix.length)
    .replace(/\\([.])/g, '$1')
    .replace(/\\([/\\$-])/g, '$1')
    .trim() || null;
}

async function getPlayerData(username) {
  const missing = configError();
  if (missing) throw new Error(missing);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('יש להזין שם Minecraft תקין (3–16 תווים).');

  const prefix = String(process.env.TIDB_LP_PREFIX || 'luckperms_').replace(/[^A-Za-z0-9_]/g, '');
  const players = await selectRows(prefix + 'players', {
    select: 'uuid,username,primary_group',
    username: 'ilike.' + username,
    limit: '1'
  });
  const player = players[0];
  if (!player) return null;

  const permissions = await selectRows(prefix + 'user_permissions', {
    select: 'id,permission,value',
    uuid: 'eq.' + player.uuid,
    value: 'eq.true',
    permission: 'ilike.%',
    order: 'id.desc',
    limit: '500'
  });

  // Resolve the highest LuckPerms group by traversing group inheritance.
  // A larger LuckPerms group weight means a higher rank.
  const directGroups = permissions
    .map(row => String(row.permission || ''))
    .filter(p => /^group\\.[A-Za-z0-9_-]+$/i.test(p))
    .map(p => p.slice(6));
  const primaryGroup = String(player.primary_group || '').trim();
  const queue = [...new Set([primaryGroup, ...directGroups].filter(Boolean))];
  const visited = new Set();
  const candidates = [];

  while (queue.length && visited.size < 100) {
    const groupName = queue.shift();
    const key = groupName.toLowerCase();
    if (!key || key === 'default' || visited.has(key)) continue;
    visited.add(key);

    const nodes = await selectRows(prefix + 'group_permissions', {
      select: 'permission,value',
      group: 'eq.' + groupName,
      value: 'eq.true',
      permission: 'ilike.%',
      limit: '500'
    });

    let weight = 0;
    for (const node of nodes) {
      const permission = String(node.permission || '');
      const weightMatch = permission.match(/^weight\\.(\\d+)$/i);
      if (weightMatch) weight = Math.max(weight, Number(weightMatch[1]));
      const inherited = permission.match(/^group\\.([A-Za-z0-9_-]+)$/i);
      if (inherited && !visited.has(inherited[1].toLowerCase())) queue.push(inherited[1]);
    }
    candidates.push({ name: groupName, weight, isPrimary: key === primaryGroup.toLowerCase() });
  }

  candidates.sort((a, b) => b.weight - a.weight || Number(b.isPrimary) - Number(a.isPrimary));
  const rank = candidates[0]?.name || (primaryGroup && primaryGroup.toLowerCase() !== 'default' ? primaryGroup : 'default');

  // Money and playtime are encoded as LuckPerms meta nodes, matching EddyWEB.
  const moneyNode = permissions.find(row => /^meta\.eddy_money\./i.test(String(row.permission || '')));
  const money = moneyNode ? decodeMetaValue(moneyNode.permission, 'eddy_money') : null;
  return { username: player.username || username, uuid: player.uuid, rank, money };
}

function formatMoney(value) {
  if (value == null || value === '') return 'לא זמין';
  const number = Number(String(value).replace(/[$,]/g, '').trim());
  if (!Number.isFinite(number)) return String(value);
  const abs = Math.abs(number);
  for (const [size, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (abs >= size) return (number / size).toLocaleString('en-US', { maximumFractionDigits: 2 }) + suffix;
  }
  return number.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

module.exports = { getPlayerData, formatMoney };
