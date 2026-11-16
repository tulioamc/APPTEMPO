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

/* Chamado pelo app do Mac: [{ contato, texto }] */
function nfseReport(itens) {
  if (!Array.isArray(itens)) return;
  itens.forEach(it => {
    try {
      const n = nfseParse(it.texto); if (!n) return;
      const nome = NFSE_CONTATO_LINHA[it.contato] || null;
      if (!nome) return;
      const feitos = db.all('tempo_notices').some(x => x.key === 'nfse:' + n.chave);
      if (feitos) return;
      const existente = db.all('tempo_reimb_rows').find(r => r.month === n.ym && r.name === nome);
      const base = { pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') };
      if (existente) {
        if (Math.abs(Number(existente.amount) - n.valor) > 0.005) db.update('tempo_reimb_rows', existente.id, { amount: n.valor, suggested_amount: null });
      } else {
        db.insert('tempo_reimb_rows', { month: n.ym, name: nome, note: '', date: `${n.ym}-10`, order: db.all('tempo_reimb_rows').filter(r => r.month === n.ym).length, amount: n.valor, ...base });
      }
      addNotice({ kind: 'reembolso', key: 'nfse:' + n.chave, title: `Nota de ${nome} lida: ${fmtMoney(n.valor)}`, body: `${n.prestador || 'Prestador'} · competência ${fmtDate(n.day)} · lançado em ${rbLabel(n.ym)}. Confira na aba Reembolsos.`, entity: 'reimb', data: { month: n.ym, chave: n.chave } });
      db.emit();
    } catch (e) { console.warn('nfseReport', e); }
  });
}
