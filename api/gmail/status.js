// Diz ao app se o Gmail está conectado (sem devolver o token).
const { userFromRequest, rest } = require('../../lib/tempo-server');

module.exports = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'entre na sua conta' });
  const rows = await rest(`tempo_integrations?provider=eq.gmail&user_id=eq.${user.id}&select=account_email,last_sync_at,refresh_token`);
  const r = rows && rows[0];
  res.json({
    connected: !!(r && r.refresh_token),
    account_email: r ? r.account_email : null,
    last_sync_at: r ? r.last_sync_at : null,
  });
};
