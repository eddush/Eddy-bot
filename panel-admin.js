// EddyBot Panel administration helpers.
// Settings and role changes are persisted in data/panel-config.json and exposed through the panel API.
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'data', 'panel-config.json');
const DEFAULT_CONFIG = {
  roles: {
    team: '1439948657670754324',
    developers: '1442556761541447720',
    helpers: '1531588090588823614',
    moderators: '1439948877183582208'
  },
  commands: {}
};

function loadPanelConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
}
function savePanelConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
function validSnowflake(id) { return /^\d{17,20}$/.test(String(id || '')); }

function installPanelAdmin(app, client, requirePanel, commands) {
  app.get('/api/panel/admin', requirePanel, (req, res) => {
    const config = loadPanelConfig();
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID || '1417557162875555974');
    const roles = Object.entries(config.roles).map(([key, id]) => {
      const role = guild?.roles.cache.get(id);
      return { key, id, name: role?.name || key, exists: !!role };
    });
    res.json({ ok: true, roles, commands: commands.map(c => ({
      name: c.name,
      description: c.description || '',
      enabled: config.commands[c.name]?.enabled !== false,
      roleId: config.commands[c.name]?.roleId || null
    })) });
  });

  app.post('/api/panel/admin/role', requirePanel, async (req, res) => {
    const { key, id, name } = req.body || {};
    if (!key || !validSnowflake(id)) return res.status(400).json({ ok:false, error:'Invalid role ID' });
    const config = loadPanelConfig();
    config.roles[key] = String(id);
    savePanelConfig(config);
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID || '1417557162875555974');
    const role = guild?.roles.cache.get(String(id));
    if (!role && guild) return res.json({ ok:true, saved:true, exists:false, warning:'Role ID saved, but the role is not visible to the bot.' });
    res.json({ ok:true, saved:true, exists:!!role, role:{id:String(id),name:role?.name || name || key} });
  });

  app.post('/api/panel/admin/role/create', requirePanel, async (req, res) => {
    const { key, name, color } = req.body || {};
    if (!key || !name) return res.status(400).json({ok:false,error:'Role name is required'});
    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID || '1417557162875555974');
    if (!guild) return res.status(503).json({ok:false,error:'Guild unavailable'});
    try {
      const role = await guild.roles.create({ name:String(name).slice(0,100), color: color || undefined, reason:'Created from EddyBot Panel' });
      const config = loadPanelConfig(); config.roles[key] = role.id; savePanelConfig(config);
      res.json({ok:true,role:{id:role.id,name:role.name}});
    } catch (e) { res.status(500).json({ok:false,error:e.message}); }
  });

  app.post('/api/panel/admin/command', requirePanel, (req, res) => {
    const { name, enabled, roleId } = req.body || {};
    if (!name || (roleId && !validSnowflake(roleId))) return res.status(400).json({ok:false,error:'Invalid command or role ID'});
    const config = loadPanelConfig();
    config.commands[name] = { enabled: enabled !== false, roleId: roleId || null };
    savePanelConfig(config);
    res.json({ok:true,command:config.commands[name]});
  });
}

module.exports = { installPanelAdmin, loadPanelConfig };
