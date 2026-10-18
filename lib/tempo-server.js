// Funções compartilhadas do servidor (Vercel). Nunca vão para o navegador.
const SUPABASE_URL = 'https://bhupkabvbblcrmdlaukb.supabase.co';
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Valida o token do usuário (enviado pelo app) e devolve o usuário do Supabase.
async function userFromRequest(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SECRET, Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

// Acesso ao banco pelo servidor (ignora RLS; por isso só roda aqui).
async function rest(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SECRET,
      Authorization: 'Bearer ' + SECRET,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error('supabase ' + r.status + ': ' + text);
  return text ? JSON.parse(text) : null;
}

// ---------- OFX ----------
function parseOfx(text) {
  const acct = ((text.match(/<ACCTID>([^<\r\n]+)/) || [])[1] || '').trim();
  return text.split('<STMTTRN>').slice(1).map((b) => {
    const f = (tag) => {
      const m = b.match(new RegExp('<' + tag + '>([^<\\r\\n]*)'));
      return m ? m[1].trim() : '';
    };
    const d = f('DTPOSTED').slice(0, 8);
    return {
      fitid: f('FITID'),
      posted_on: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      amount: Number(f('TRNAMT')),
      memo: f('MEMO'),
      account_tail: acct.slice(-4),
    };
  }).filter((t) => t.fitid);
}

// CNPJs das suas próprias empresas: transferência para elas é interna.
const OWN_DOCS = ['55.504.134/0001-31'];
// Caixinhas, aplicações e rendimentos: também são movimento interno.
const INTERNAL_RE = /RDB|Resgate|Aplica[cç][aã]o|Caixinha|Rendimento|Tulio de Azevedo Melo Couceiro/i;
// Pagamento da fatura do cartão: o gasto é contado pelos itens da fatura, não pelo débito.
const CARD_RE = /Pagamento de fatura/i;

function classify(t) {
  const doc = (t.memo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || [])[0] || null;
  const scope = CARD_RE.test(t.memo) ? 'cartao' : (doc && OWN_DOCS.includes(doc)) || INTERNAL_RE.test(t.memo) ? 'interna' : 'externa';
  const parts = t.memo.split(' - ');
  return {
    fitid: t.fitid,
    account_tail: t.account_tail,
    posted_on: t.posted_on,
    amount: t.amount,
    memo: t.memo,
    counterpart: parts.length > 1 ? parts[1].trim() : t.memo,
    counterpart_doc: doc,
    flow: t.amount >= 0 ? 'in' : 'out',
    scope,
  };
}

// ---------- Gmail ----------
async function gmailAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('google token: ' + JSON.stringify(j));
  return j.access_token;
}

async function gmail(token, path) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const j = await r.json();
  if (!r.ok) throw new Error('gmail ' + r.status + ': ' + JSON.stringify(j));
  return j;
}

// Acha os anexos .ofx dentro de uma mensagem (inclusive dentro de multipart).
function collectOfx(part, out = []) {
  if (part.filename && /\.ofx$/i.test(part.filename) && part.body && part.body.attachmentId) {
    out.push({ attachmentId: part.body.attachmentId, filename: part.filename });
  }
  (part.parts || []).forEach((p) => collectOfx(p, out));
  return out;
}

module.exports = { userFromRequest, rest, parseOfx, classify, gmailAccessToken, gmail, collectOfx, SUPABASE_URL };
