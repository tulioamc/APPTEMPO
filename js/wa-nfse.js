/* NOTAS FISCAIS (NFS-e) RECEBIDAS PELO WHATSAPP → TABELA DE REEMBOLSOS
   O app do Mac envia só o nome do contato e o texto do PDF (window.TempoBridge.reportNfse).
   Mês da linha = janela de datas (20 do mês anterior a 19 do mês atual).
   Cada arquivo vira um aviso (chave única), então não duplica. Valor real só entra com a sua confirmação. */

/* Contato do WhatsApp → nome da linha na tabela de reembolsos. */
const NFSE_CONTATO_LINHA = {
  'Carol AT': 'AT',
  'Dra Raquel Barreto Psicopedagoga': 'Raquel',
  'Aloma Consultório': 'Aloma',
  'Erika Gomes (Clau/Aconchego)': 'Claudiane',
  'Homero Futebol/ Bicicleta/ Skate': 'Homero',
  'ARGOS FINANCEIRO HUGO VIANA': 'Patrícia',
  // dentista do Rafa: só comprovante (não tem nota nem reembolso); pode vir de qualquer uma das duas conversas
  'Cristiana da Fonte (Dentista Rafa)': 'Dentista',
  'CrescerOdonto Dentista': 'Dentista'
};
/* Nome da conversa sem diferença de maiúsculas, acentos, espaços e marcas invisíveis do WhatsApp. */
const nfseChave = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nfseLinhaDoContato = (contato) => { const k = nfseChave(contato); const e = Object.entries(NFSE_CONTATO_LINHA).find(([n]) => nfseChave(n) === k); return e ? e[1] : null; };

/* Lê os campos da nota a partir do texto do PDF. Retorna null se não for NFS-e. */
function nfseParse(texto) {
  const t = String(texto || '');
  // A chave tem 44 dígitos. No PDF vem colada; na foto, o leitor de texto quebra em grupos com espaços e pontos.
  const bruta = (t.match(/CHAVE DE ACESSO[^\n]*?NFS-?e[\s\S]{0,20}?((?:\d[\s.]{0,3}){44})/i) || [])[1];
  const chave = bruta ? bruta.replace(/\D/g, '') : null;
  const comp = t.match(/COMPET[ÊE]NCIA DA NFS-?e[\s\S]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i);
  // Foto de nota: sem a chave inteira, ainda vale se o documento se identificar como NFS-e (o mês vem da data da mensagem).
  const ehNota = /NFS-?e|NOTA FISCAL DE SERVI/i.test(t);
  if ((!chave || chave.length !== 44) && !(ehNota && comp)) {
    if (!ehNota) return null;
  }
  const antes = t.split(/INFORMAÇÕES COMPLEMENTARES/i)[0];
  const valores = [...antes.matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => Number(m[1].replace(/\./g, '').replace(',', '.')));
  const valor = valores.length ? Math.max(...valores) : null;
  const linhas = t.split('\n'); const i = linhas.findIndex(l => /Nome \/ Nome Empresarial/i.test(l));
  const prest = i >= 0 ? ((linhas.slice(i + 1).find(l => l.trim()) || '').trim().split(/\s{2,}/)[0] || '') : '';
  if (valor === null) return null;   // sem valor não há o que lançar
  return { chave: chave && chave.length === 44 ? chave : null, prestador: prest.trim(), valor,
           ym: comp ? `${comp[3]}-${comp[2]}` : null, day: comp ? `${comp[3]}-${comp[2]}-${comp[1]}` : null };
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
  const atual = Array.isArray(r.files) ? r.files : [];
  if (atual.some(f => f.path === caminho)) return;
  const tipo = rotulo === 'LINK NF' ? 'nota' : 'comprovante';
  db.update('tempo_reimb_rows', rowId, { files: [...atual, { tipo, path: caminho }] }, true);
}
const nfseIsoBR = (txt) => { const m = String(txt || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const nfseValorBR = (txt) => { const v = [...String(txt || '').matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => Number(m[1].replace(/\./g, '').replace(',', '.'))); return v.length ? v[0] : null; };

/* Linha do contato no mês (cria se não existir, sem valor real). */
function nfseLinha(nome, ym, criar) {
  const achar = () => db.all('tempo_reimb_rows').find(r => r.month === ym && r.name === nome);
  const r = achar(); if (r || !criar) return r || null;
  db.insert('tempo_reimb_rows', { month: ym, name: nome, note: '', date: `${ym}-10`, order: db.all('tempo_reimb_rows').filter(x => x.month === ym).length, amount: null,
    pay_id: rbStatusId('reimb_pay', 'a Pagar'), refund_id: rbStatusId('reimb_refund', 'a Pagar'), req_id: rbStatusId('reimb_req', 'a Fazer') }, true);
  return achar();
}
const nfseIgual = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) < 0.005;

/* Aplica o que o aviso propõe (botão "Usar" do aviso, ou direto quando o valor já bate). */
function nfseAplicar(d) {
  const row = nfseLinha(d.nome, d.ym, true); if (!row) return false;
  if (d.tipo === 'comprovante') {
    const pago = rbStatusId('reimb_pay', 'Pago');
    db.update('tempo_reimb_rows', row.id, { pay_id: pago || row.pay_id, paid_on: d.pagoEm || row.paid_on || null, ...(!row.amount && d.valor ? { amount: d.valor, suggested_amount: null } : {}) }, true);
    nfseNota(row.id, 'LINK PAGAMENTO', d.arquivo);
  } else {
    db.update('tempo_reimb_rows', row.id, { amount: d.valor, suggested_amount: null }, true);
    nfseNota(row.id, 'LINK NF', d.arquivo);
  }
  return true;
}
ACTIONS['nfse-usar'] = (el) => {
  const n = db.get('tempo_notices', el.dataset.id); if (!n) return;
  if (nfseAplicar(n.data || {})) { decideNotice(n, 'accepted', n.data.tipo === 'comprovante' ? 'Marcado como Pago' : 'Valor da nota usado'); toast('Lançado em Reembolsos'); }
  db.emit();
};

/* Chamado pelo app do Mac: [{ id, contato, tipo: 'nota' | 'comprovante', texto, data, arquivo }].
   Devolve os ids recebidos, para o Mac não reenviar. Nada entra como valor real sem confirmação,
   exceto quando só confirma o que já está na linha (mesmo valor). */
function nfseReport(itens) {
  if (!Array.isArray(itens) || !db.loaded) return [];
  const recebidos = [];
  itens.forEach(it => {
    try {
      const nome = nfseLinhaDoContato(it.contato);
      const ym = nfseJanelaMes(it.data);
      if (!nome || !ym) { recebidos.push(it.id); return; }
      const visto = (chave) => db.all('tempo_notices').some(x => x.key === chave);
      // já lançado antes (ex.: "Reler notas" no Mac): não avisa de novo, só põe o link do arquivo na linha que existir
      const soLink = (rotulo) => { const r = nfseLinha(nome, ym, false); if (r) nfseNota(r.id, rotulo, it.arquivo); };
      const base = { tipo: it.tipo, nome, ym, arquivo: it.arquivo || null };

      if (it.tipo === 'comprovante') {
        const chave = 'comp:' + it.id;
        if (visto(chave)) soLink('LINK PAGAMENTO');
        else {
          const valor = nfseValorBR(it.texto);
          const d = { ...base, valor, pagoEm: nfseIsoBR(it.texto) || it.data };
          const row = nfseLinha(nome, ym, false);
          const jaPago = row && rbName('reimb_pay', row.pay_id) === 'Pago';
          if (row && !jaPago && nfseIgual(row.amount, valor)) {
            // mesmo valor da linha: é o pagamento dela
            nfseAplicar(d);
            addNotice({ kind: 'reembolso', key: chave, title: `Comprovante de ${nome}: ${fmtMoney(valor)} · marcado como Pago`, body: `Pago em ${fmtDate(d.pagoEm)} · ${rbLabel(ym)}. O valor bateu com a linha.`, entity: 'reimb', data: d });
          } else {
            const motivo = !row ? 'não há linha desse contato no mês' : jaPago ? 'a linha já está como Pago' : `a linha tem ${fmtMoney(row.amount) || 'valor vazio'}`;
            addNotice({ kind: 'nfse', key: chave, title: `Comprovante de ${nome}: ${fmtMoney(valor) || 'valor não lido'}`, body: `${rbLabel(ym)} · ${motivo}. Confirme para marcar como Pago em ${fmtDate(d.pagoEm)}.`, entity: 'reimb', data: d });
          }
        }
        recebidos.push(it.id); return;
      }

      const n = nfseParse(it.texto);
      if (!n) {
        // nota que não deu para ler: avisa em vez de sumir calada
        const erro = 'nfse-erro:' + it.id;
        if (!visto(erro)) addNotice({ kind: 'reembolso', key: erro, title: `Nota de ${nome}: não consegui ler`, body: `${rbLabel(ym)} · chegou pelo WhatsApp, mas o valor não foi lido. Lance na mão em Reembolsos.`, entity: 'reimb', data: { ...base } });
        recebidos.push(it.id); return;
      }
      // nota lida de foto não tem a chave: a identidade do arquivo (sha) faz as vezes dela, então também não duplica
      const chave = n.chave ? 'nfse:' + n.chave : 'nfse-foto:' + it.id;
      if (visto(chave)) soLink('LINK NF');
      else {
        const d = { ...base, valor: n.valor, chave: n.chave };
        const row = nfseLinha(nome, ym, true);
        nfseNota(row.id, 'LINK NF', it.arquivo);
        if (!n.chave) {
          // veio de foto: o valor pode ter sido lido errado, então nunca entra sozinho
          if (!row.amount) db.update('tempo_reimb_rows', row.id, { suggested_amount: n.valor }, true);
          addNotice({ kind: 'nfse', key: chave, title: `Nota de ${nome} (foto): ${fmtMoney(n.valor)}`, body: `${rbLabel(ym)} · lida de uma foto, confira o valor antes de usar${row.amount ? ` · a linha tem ${fmtMoney(row.amount)}` : ''}.`, entity: 'reimb', data: d });
        } else if (nfseIgual(row.amount, n.valor)) {
          addNotice({ kind: 'reembolso', key: chave, title: `Nota de ${nome} lida: ${fmtMoney(n.valor)}`, body: `${n.prestador || 'Prestador'} · ${rbLabel(ym)}. O valor já estava na linha.`, entity: 'reimb', data: d });
        } else {
          // sem valor real na linha: mostra o da nota em cinza até você confirmar
          if (!row.amount) db.update('tempo_reimb_rows', row.id, { suggested_amount: n.valor }, true);
          addNotice({ kind: 'nfse', key: chave, title: `Nota de ${nome}: ${fmtMoney(n.valor)}`, body: `${n.prestador || 'Prestador'} · ${rbLabel(ym)}${row.amount ? ` · a linha tem ${fmtMoney(row.amount)}` : ''}. Confirme para usar o valor da nota.`, entity: 'reimb', data: d });
        }
      }
      recebidos.push(it.id);
    } catch (e) { console.warn('nfseReport', e); }
  });
  db.emit();
  return recebidos;
}
