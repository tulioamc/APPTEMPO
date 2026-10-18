// GET do app (com token do usuário): devolve a URL de autorização do Google.
const crypto = require('crypto');
const { userFromRequest, rest } = require('../../lib/tempo-server');

module.exports = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'entre na sua conta para conectar o Gmail' });

  const state = crypto.randomBytes(24).toString('hex');
  // guarda o state ligado ao usuário; o refresh_token entra no callback
  await rest('tempo_integrations?on_conflict=user_id,provider', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: user.id, provider: 'gmail', oauth_state: state }),
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: 'https://apptempo-abon.vercel.app/api/gmail/callback',
    response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  res.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
};
