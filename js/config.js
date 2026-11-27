/* Configuração pública do app. A chave "publishable" do Supabase é feita para ficar no navegador.
   NUNCA colocar aqui a chave service_role nem qualquer segredo. */
window.TEMPO_CFG = {
  supabaseUrl: 'https://bhupkabvbblcrmdlaukb.supabase.co',
  supabaseKey: 'sb_publishable_uSTceFT6P2pGQP2Rgmkpqg_2tzqTKm9',
  // JSON serializado de colunas por tabela (gerado pelo build.py a partir de db/schema.sql)
};

/* Financeiro pessoal: só há extratos e cartão completos a partir daqui; análises e listas ignoram o que for anterior. */
const FIN_INICIO = '2026-01-01', FIN_INICIO_YM = '2026-01';

/* versão exibida no rodapé da barra lateral; aumentar a cada publicação */
const APP_VERSION = 'V3.00.10';
