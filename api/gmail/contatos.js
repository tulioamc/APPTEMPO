// Procura no Gmail quem bate com um nome (remetente ou destinatário) e devolve nome e e-mail.
// Só lê os cabeçalhos From/To/Cc das mensagens; o conteúdo nunca é lido.
const { userFromRequest, rest, gmailAccessToken, gmail } = require('../../lib/tempo-server');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function pares(header) {
  // "Fulana de Tal <fulana@x.com>, outro@y.com"
  return String(header || '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => {
    const m = p.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { nome: m[1].trim(), email: m[2].trim().toLowerCase() };
    const e = p.trim().toLowerCase(); return /@/.test(e) ? { nome: '', email: e } : null;
  }).filter(Boolean);
}
module.exports = async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'entre na sua conta' });
  const q = String((req.query && req.query.q) || '').trim();
  if (q.length < 2) return res.json({ contatos: [] });
  const rows = await rest(`tempo_integrations?provider=eq.gmail&user_id=eq.${user.id}&select=refresh_token`);
  const integ = rows && rows[0];
  if (!integ || !integ.refresh_token) return res.json({ contatos: [], semGmail: true });
  try {
    const token = await gmailAccessToken(integ.refresh_token);
    const termo = q.replace(/"/g, '');
    const lista = await gmail(token, `messages?maxResults=25&q=${encodeURIComponent(`{from:"${termo}" to:"${termo}" cc:"${termo}"} newer_than:3y`)}`);
    const achados = new Map(); const toks = norm(termo).split(/\s+/).filter(Boolean);
    for (const m of (lista.messages || []).slice(0, 25)) {
      const msg = await gmail(token, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`);
      for (const h of (msg.payload && msg.payload.headers) || []) {
        for (const p of pares(h.value)) {
          const alvo = norm(p.nome + ' ' + p.email);
          if (!toks.every(t => alvo.includes(t))) continue;
          const a = achados.get(p.email) || { nome: p.nome, email: p.email, n: 0 };
          a.n++; if (!a.nome && p.nome) a.nome = p.nome; achados.set(p.email, a);
        }
      }
    }
    res.json({ contatos: [...achados.values()].sort((a, b) => b.n - a.n).slice(0, 6) });
  } catch (e) { res.status(500).json({ error: 'gmail: ' + e.message }); }
};
