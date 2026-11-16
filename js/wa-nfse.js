/* NOTAS FISCAIS (NFS-e) RECEBIDAS PELO WHATSAPP → TABELA DE REEMBOLSOS
   O app do Mac envia só o nome do contato e o texto do PDF (window.TempoBridge.reportNfse).
   Mês da linha = mês da competência da nota (ex.: nota de 03/11 vai para Novembro).
   Cada nota vira um aviso com chave pela chave de acesso, então não duplica. */

/* Contato do WhatsApp → nome da linha na tabela de reembolsos. */
const NFSE_CONTATO_LINHA = {
  'Carol AT': 'AT',
  'Raquel': 'Raquel',
  'Aloma Consultório': 'Aloma',
  'Erika Gomes (Clau/Aconchego)': 'Claudiane',
  'Homero Futebol/ Bicicleta/ Skate': 'Homero',
  'ARGOS FINANCEIRO HUGO VIANA': 'Patrícia'
};

/* Lê os campos da nota a partir do texto do PDF. Retorna null se não for NFS-e. */
function nfseParse(texto) {
  const t = String(texto || '');
  const chave = (t.match(/CHAVE DE ACESSO DA NFS-e\s+(\d{44})/i) || [])[1];
  if (!chave) return null;
  const comp = t.match(/COMPET[ÊE]NCIA DA NFS-e[\s\S]*?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!comp) return null;
  const antes = t.split(/INFORMAÇÕES COMPLEMENTARES/i)[0];
  const valores = [...antes.matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => Number(m[1].replace(/\./g, '').replace(',', '.')));
  const valor = valores.length ? Math.max(...valores) : null;
  const linhas = t.split('\n'); const i = linhas.findIndex(l => /Nome \/ Nome Empresarial/i.test(l));
  const prest = i >= 0 ? ((linhas.slice(i + 1).find(l => l.trim()) || '').trim().split(/\s{2,}/)[0] || '') : '';
  return { chave, prestador: prest.trim(), valor, ym: `${comp[3]}-${comp[2]}`, day: `${comp[3]}-${comp[2]}-${comp[1]}` };
}

/* Mês da linha pela janela: nota/comprovante de 20 do mês anterior a 19 do mês atual entra no mês atual. */
function nfseJanelaMes(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return null;
  let yy = y, mm = m;
  if (d >= 20) { mm++; if (mm > 12) { mm = 1; yy++; } }
  return `${yy}-${String(mm).padStart(2, '0')}`;
}
/* Acrescenta uma linha de link na Anotação, sem repetir. */
function nfseNota(rowId, rotulo, caminho) {
  if (!caminho) return;
  const r = db.get('tempo_reimb_rows', rowId); if (!r) return;
  const atual = r.note || '';
  if (atual.includes(caminho)) return;
  db.update('tempo_reimb_rows', rowId, { note: (atual ? atual + '\n' : '') + `[${rotulo}] ${caminho}` });
}
const nfseIsoBR = (txt) => { const m = String(txt || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const nfseValorBR = (txt) => { const v = [...String(txt || '').matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => Number(m[1].replace(/\./g, '').replace(',', '.'))); return v.length ? v[0] : null; };

/* Chamado pelo app do Mac: [{ id, contato, tipo: 'nota' | 'comprovante', texto, data, arquivo }] */
function nfseReport(itens) {
  if (!Array.isArray(itens)) return;
  itens.forEach(it => {
    try {
      const nome = NFSE_CONTATO_LINHA[it.contato] || null;
      if (!nome) return;
      const ym = nfseJanelaMes(it.data);
      if (!ym) return;
      const base = { pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') };
      const achar = () => db.all('tempo_reimb_rows').find(r => r.month === ym && r.name === nome);
      const criar = (amount) => { db.insert('tempo_reimb_rows', { month: ym, name: nome, note: '', date: `${ym}-10`, order: db.all('tempo_reimb_rows').filter(r => r.month === ym).length, amount, ...base }); return achar(); };

      if (it.tipo === 'comprovante') {
        const chave = 'comp:' + it.id;
        if (db.all('tempo_notices').some(x => x.key === chave)) return;
        const valor = nfseValorBR(it.texto);
        const pagoEm = nfseIsoBR(it.texto) || it.data;
        const row = achar() || criar(valor);
        const pago = rbStatusId('reimb_pay', 'Pago');
        db.update('tempo_reimb_rows', row.id, { pay_id: pago || row.pay_id, paid_on: pagoEm, ...(!row.amount && valor ? { amount: valor, suggested_amount: null } : {}) });
        nfseNota(row.id, 'LINK PAGAMENTO', it.arquivo);
        addNotice({ kind: 'reembolso', key: chave, title: `Comprovante de ${nome} lido: ${fmtMoney(valor) || 'sem valor'}`, body: `Pago em ${fmtDate(pagoEm)} · lançado em ${rbLabel(ym)} como Pago. Confira na aba Reembolsos.`, entity: 'reimb', data: { month: ym } });
        db.emit();
        return;
      }

      const n = nfseParse(it.texto); if (!n) return;
      if (db.all('tempo_notices').some(x => x.key === 'nfse:' + n.chave)) return;
      const existente = achar();
      if (existente) {
        if (Math.abs(Number(existente.amount) - n.valor) > 0.005) db.update('tempo_reimb_rows', existente.id, { amount: n.valor, suggested_amount: null });
      } else criar(n.valor);
      nfseNota(achar().id, 'LINK NF', it.arquivo);
      addNotice({ kind: 'reembolso', key: 'nfse:' + n.chave, title: `Nota de ${nome} lida: ${fmtMoney(n.valor)}`, body: `${n.prestador || 'Prestador'} · competência ${fmtDate(n.day)} · lançado em ${rbLabel(ym)}. Confira na aba Reembolsos.`, entity: 'reimb', data: { month: ym, chave: n.chave } });
      db.emit();
    } catch (e) { console.warn('nfseReport', e); }
  });
}
