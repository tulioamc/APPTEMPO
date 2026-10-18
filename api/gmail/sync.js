// Lê os OFX da Nubank no Gmail e grava as movimentações em tempo_bank_txns.
// Chamado pelo botão do app (com token do usuário) ou pela tarefa agendada (com x-sync-secret).
const {
  userFromRequest, rest, parseOfx, classify, gmailAccessToken, gmail, collectOfx,
} = require('../../lib/tempo-server');

async function syncOne(integ) {
  const token = await gmailAccessToken(integ.refresh_token);
  const since = integ.last_message_date
    ? new Date(new Date(integ.last_message_date).getTime() - 3 * 864e5)
    : new Date(Date.now() - 60 * 864e5);
  // a Nubank manda do mesmo remetente; o FITID evita duplicar se houver sobreposição
  const q = `from:todomundo@nubank.com.br filename:ofx after:${Math.floor(since.getTime() / 1000)}`;
  const list = await gmail(token, 'messages?maxResults=100&q=' + encodeURIComponent(q));

  let lidas = 0;
  let newest = integ.last_message_date;
  for (const m of list.messages || []) {
    const msg = await gmail(token, 'messages/' + m.id + '?format=full');
    const date = new Date(Number(msg.internalDate));
    const subject = ((msg.payload.headers || []).find(h => h.name.toLowerCase() === 'subject') || {}).value || '';
    const entity = /Nu Empresas/i.test(subject) ? 'pj' : 'pf';
    for (const a of collectOfx(msg.payload)) {
      const att = await gmail(token, `messages/${m.id}/attachments/${a.attachmentId}`);
      const text = Buffer.from(att.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const rows = parseOfx(text).map((t) => ({ ...classify(t), user_id: integ.user_id, source: 'nubank', entity }));
      lidas += rows.length;
      if (rows.length) {
        await rest('tempo_bank_txns?on_conflict=user_id,fitid', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify(rows),
        });
      }
    }
    if (!newest || date > new Date(newest)) newest = date.toISOString();
  }

  await rest(`tempo_integrations?id=eq.${integ.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_sync_at: new Date().toISOString(), last_message_date: newest }),
  });
  return { conta: integ.account_email, mensagens: (list.messages || []).length, transacoes_lidas: lidas };
}

module.exports = async (req, res) => {
  let integrations;
  const isScheduled = process.env.SYNC_SECRET && req.headers['x-sync-secret'] === process.env.SYNC_SECRET;
  if (isScheduled) {
    integrations = await rest('tempo_integrations?provider=eq.gmail&refresh_token=not.is.null&select=*');
  } else {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'não autorizado' });
    integrations = await rest(`tempo_integrations?provider=eq.gmail&refresh_token=not.is.null&user_id=eq.${user.id}&select=*`);
  }
  const results = [];
  for (const integ of integrations || []) results.push(await syncOne(integ));
  res.json({ results });
};
