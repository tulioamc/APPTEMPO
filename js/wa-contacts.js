/* WhatsApp: contagem de mensagens que você mandou, por contato e dia.
   O app do Mac manda a contagem (window.TempoBridge.reportWhatsApp). Só nome, tipo e quantidade; nunca o texto.
   Contato novo entra como "amigo" (pausa), como combinado. Quem já tem tipo mantém o tipo (ignoreDuplicates). */
async function waReport(linhas) {
  const c = window.tempoClient;
  if (!c || !Array.isArray(linhas) || !linhas.length) return;
  try {
    const { data: { user } } = await c.auth.getUser();
    if (!user) return;
    const contatos = new Map();
    linhas.forEach(l => contatos.set(l.jid, { user_id: user.id, jid: l.jid, name: l.name || l.jid, tipo: l.grupo ? 'grupo' : 'amigo' }));
    await c.from('tempo_wa_contacts').upsert([...contatos.values()], { onConflict: 'user_id,jid', ignoreDuplicates: true });
    const diario = linhas.map(l => ({ user_id: user.id, jid: l.jid, day: l.dia, sent: l.enviadas }));
    await c.from('tempo_wa_daily').upsert(diario, { onConflict: 'user_id,jid,day' });
  } catch (e) { console.warn('waReport', e); }
}
