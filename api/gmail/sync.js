// Lê os OFX da Nubank no Gmail e grava as movimentações em tempo_bank_txns.
// Chamado pelo botão do app (com token do usuário) ou pela tarefa agendada (com x-sync-secret).
const {
  userFromRequest, rest, parseOfx, classify, gmailAccessToken, gmail, collectOfx,
} = require('../../lib/tempo-server');

// ---------- avisos "Você recebeu uma transferência pelo Pix" (chegam na hora, antes do extrato) ----------
const shiftDay = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function bodyText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) return b64(part.body.data);
  for (const p of part.parts || []) { const t = bodyText(p); if (t) return t; }
  if (part.mimeType === 'text/html' && part.body && part.body.data) return b64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return '';
}
function parsePix(msg) {
  const text = bodyText(msg.payload);
  const valor = (text.match(/Valor recebido[\s\S]{0,80}?R\$\s*([\d.]+,\d{2})/i) || [])[1];
  if (!valor) return null;
  const who = ((text.match(/transfer[êe]ncia pelo Pix de\s+(.+?)\s+e o valor/i) || [])[1] || 'Pix recebido').trim();
  return {
    amount: Number(valor.replace(/\./g, '').replace(',', '.')),
    who,
    posted: new Date(Number(msg.internalDate)).toLocaleDateString('en-CA', { timeZone: 'America/Recife' }),
    entity: /Nu Empresas/i.test(text) ? 'pj' : 'pf',
  };
}
// Acha a linha do extrato (ou o aviso, se o extrato ainda não chegou) que corresponde a um Pix.
const sameName = (memo, who) => !who || String(memo || '').toUpperCase().includes(who.toUpperCase().split(' ')[0]);
async function findPixRow(userId, p, source) {
  const rows = await rest(`tempo_bank_txns?user_id=eq.${userId}&entity=eq.${p.entity}&amount=eq.${p.amount}&flow=eq.in&source=eq.${source}&posted_on=gte.${shiftDay(p.posted, -3)}&posted_on=lte.${shiftDay(p.posted, 3)}&select=id,fitid,memo,counterpart,account_tail,posted_on,scope`);
  return (rows || []).find(r => sameName(r.memo, p.who)) || null;
}

async function syncOne(integ) {
  const token = await gmailAccessToken(integ.refresh_token);
  const since = integ.last_message_date
    ? new Date(new Date(integ.last_message_date).getTime() - 3 * 864e5)
    : new Date(Date.now() - 60 * 864e5);
  // a Nubank manda do mesmo remetente; o FITID evita duplicar se houver sobreposição
  const q = `from:todomundo@nubank.com.br filename:ofx after:${Math.floor(since.getTime() / 1000)}`;
  const list = await gmail(token, 'messages?maxResults=100&q=' + encodeURIComponent(q));

  // avisos de Pix recebido: entram já, como "novo", e o extrato depois só confirma
  const qPix = `from:todomundo@nubank.com.br subject:"transferência pelo Pix" after:${Math.floor(since.getTime() / 1000)}`;
  const pixList = await gmail(token, 'messages?maxResults=100&q=' + encodeURIComponent(qPix));
  let pixLidos = 0;
  for (const m of pixList.messages || []) {
    const msg = await gmail(token, 'messages/' + m.id + '?format=full');
    const p = parsePix(msg);
    if (!p) continue;
    // se o extrato já trouxe esse Pix, não cria aviso duplicado
    if (await findPixRow(integ.user_id, p, 'nubank')) continue;
    await rest('tempo_bank_txns?on_conflict=user_id,fitid', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{
        user_id: integ.user_id, fitid: 'pix-' + m.id, source: 'nubank-pix', entity: p.entity,
        posted_on: p.posted, amount: p.amount, flow: 'in', scope: 'externa',
        memo: 'Transferência recebida pelo Pix - ' + p.who, counterpart: p.who, counterpart_doc: null, account_tail: '', category: null,
      }]),
    });
    pixLidos++;
  }

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
      // o cartão é pessoal (PF), mesmo que o e-mail venha com o nome da empresa
      const rows = parseOfx(text).map((t) => { const r = classify(t); const ent = /d660$/.test(r.account_tail || '') ? 'pf' : entity; return { ...r, user_id: integ.user_id, source: 'nubank', entity: ent }; });
      lidas += rows.length;
      for (const r of rows) {
        if (r.flow !== 'in') continue;
        const aviso = await findPixRow(integ.user_id, { amount: r.amount, entity: r.entity, posted: r.posted_on, who: r.counterpart }, 'nubank-pix');
        if (!aviso) continue;
        // o extrato confirma o aviso: mantém o que você já revisou e troca pelos dados oficiais
        await rest(`tempo_bank_txns?id=eq.${aviso.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ fitid: r.fitid, source: 'nubank', memo: r.memo, counterpart: r.counterpart, account_tail: r.account_tail, posted_on: r.posted_on, scope: r.scope }),
        });
        r.fitid = null; // já está gravado como aviso confirmado
      }
      const novos = rows.filter(r => r.fitid);
      if (novos.length) {
        await rest('tempo_bank_txns?on_conflict=user_id,fitid', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify(novos),
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
  return { conta: integ.account_email, mensagens: (list.messages || []).length, pix_lidos: pixLidos, transacoes_lidas: lidas };
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
