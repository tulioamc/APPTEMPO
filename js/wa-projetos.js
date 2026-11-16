/* WhatsApp de trabalho somado ao projeto.
   Conversa com contato de trabalho (cliente, agência, colega…) que aconteceu FORA do cronômetro vira tempo do projeto;
   dentro de uma sessão ela já está nas horas (não conta duas vezes).
   Para qual projeto vai: o projeto ligado ao contato (grupo de projeto); senão o projeto daquele cliente (ou de um
   cliente daquela agência) trabalhado por último antes da conversa, até 14 dias; senão o primeiro trabalhado depois,
   até 14 dias; senão fica "sem projeto". */
let _waProj = null;
const WA_PROJ_JANELA = 14 * 864e5;
function waTempoProjetos() {
  const arr = db.data.tempo_settings || [], ents = db.data.tempo_time_entries || [], cts = db.data.tempo_wa_contacts || [];
  const rev = `${db.setRev || 0}|${ents.length}|${cts.length}|${(db.data.tempo_projects || []).length}`;
  if (_waProj && _waProj.arr === arr && _waProj.ents === ents && _waProj.rev === rev) return _waProj;
  const sess = [], inicios = [];
  ents.forEach(e => (e.segments || []).forEach(s => {
    if (!s.s) return;
    const a = Date.parse(s.s), b = s.e ? Date.parse(s.e) : Date.now();
    if (b > a) sess.push([a, b]);
    if (e.project_id) inicios.push([a, e.project_id]);
  }));
  sess.sort((x, y) => x[0] - y[0]); inicios.sort((x, y) => x[0] - y[0]);
  const coberto = (a, b) => { let t = 0; for (const [x, y] of sess) { if (x >= b) break; if (y > a) t += Math.min(b, y) - Math.max(a, x); } return Math.min(t, b - a); };
  const doContato = (c, pid) => {
    const p = db.get('tempo_projects', pid); if (!p) return false;
    if (c.client_id) return p.client_id === c.client_id;
    if (c.agency_id) { const cl = db.get('tempo_clients', p.client_id); return !!cl && cl.agency_id === c.agency_id; }
    return false;
  };
  const alvo = (c, t) => {
    if (c.project_id) return c.project_id;
    if (!c.client_id && !c.agency_id) return null;
    let antes = null;
    for (const [ts, pid] of inicios) { if (ts > t) break; if (t - ts <= WA_PROJ_JANELA && doContato(c, pid)) antes = pid; }
    if (antes) return antes;
    for (const [ts, pid] of inicios) if (ts > t && ts - t <= WA_PROJ_JANELA && doContato(c, pid)) return pid;
    return null;
  };
  const ms = {}; let sem = 0; const porCli = {};
  arr.forEach(r => {
    if (!String(r.key || '').startsWith('actlog:') || !Array.isArray(r.value)) return;
    r.value.forEach(x => {
      if (!/whatsapp/i.test(String(x.app || '')) || !x.doc) return;
      const c = cts.find(k => k.name === x.doc) || waContato(x.doc);
      if (!c || !waEhTrabalho(c)) return;
      const a = Date.parse(x.from), b = Date.parse(x.to); if (!(b > a)) return;
      const fora = (b - a) - coberto(a, b); if (fora <= 0) return;
      const pid = alvo(c, a);
      if (pid) ms[pid] = (ms[pid] || 0) + fora; else sem += fora;
    });
  });
  return (_waProj = { arr, ents, rev, ms, sem });
}
/* WhatsApp de trabalho fora do cronômetro, já atribuído a este projeto. */
const waMsDoProjeto = (pid) => waTempoProjetos().ms[pid] || 0;
/* R$/hora contando também o WhatsApp fora do cronômetro. */
function effectiveRateComWa(p) {
  const ms = projectMs(p.id) + waMsDoProjeto(p.id); if (ms < 60000) return null;
  const base = Number(p.budget) || paidOf(p); if (!base) return null; return base / hours(ms);
}
