// Retorno do Google: troca o código pelo refresh_token e guarda no banco.
const { rest } = require('../../lib/tempo-server');

module.exports = async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error || !code || !state) return res.redirect(302, '/?gmail=erro');

  const rows = await rest(
    `tempo_integrations?provider=eq.gmail&oauth_state=eq.${encodeURIComponent(state)}&select=id`
  );
  if (!rows || !rows.length) return res.redirect(302, '/?gmail=estado-invalido');

  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://apptempo-abon.vercel.app/api/gmail/callback',
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tr.json();
  if (!tr.ok || !tokens.refresh_token) return res.redirect(302, '/?gmail=sem-refresh-token');

  const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + tokens.access_token },
  });
  const info = await ui.json();

  await rest(`tempo_integrations?id=eq.${rows[0].id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      refresh_token: tokens.refresh_token,
      account_email: info.email || null,
      oauth_state: null,
      updated_at: new Date().toISOString(),
    }),
  });
  // janela pequena do login: avisa o app e fecha; se não for janela, segue para o app
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px">Gmail conectado. Pode fechar esta janela.<script>try{window.opener&&window.opener.postMessage('gmail-ok','*')}catch(e){}window.close();setTimeout(function(){location.href='/?gmail=ok'},400)</script>`);
};
