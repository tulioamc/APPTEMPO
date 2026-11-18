# Tempo — ajustes pedidos

## Situação na versão 2 (16/10/2026)
- Feitos: 1, 2, 3, 4, 6, 7, 8.
- Item 5: feito no que o navegador permite (computador suspenso + Chrome/Edge com detecção de ociosidade, sugestões Aceitar/Encerrar/Ignorar, ponte `window.TempoBridge.reportIdle`). App em uso (WhatsApp) e ociosidade em qualquer navegador → app de Mac.
- Item 3: decidido por padrão (pode mudar): BV sobre A+B; imposto sobre A+B+C, por fora, com opção "calcular por dentro".

## Rodada 1 (16/10/2026, após a versão 1)

1. **Campos de seleção com busca** — ao clicar em Status, Pagamento etc., abrir um dropdown que permite buscar, selecionar na lista e criar uma opção nova ali mesmo.
2. **Reordenar colunas arrastando** — segurar o cabeçalho de uma coluna e soltar entre outras duas (com indicador de onde vai cair). Hoje só pelo menu "Colunas" com setas, e só em Projetos. Vale para todas as tabelas; ordem fica salva por tabela.
3. **Calculadora de orçamento: encargos e custos extras** — ✅ feito (nota fiscal 9% ligada, BV desligado 10%, custos extras desligados; resumo A/B/C/D/Total).
   - **Nota fiscal** (marcado por padrão) + campo **Imposto %** (padrão 9%). Desmarcado: campo bloqueado e não entra no cálculo.
   - **BV** (desmarcado por padrão) + campo **Comissão %** (padrão 10%). Desmarcado: campo bloqueado e não entra no cálculo. BV = comissão de agência (uso em Recife).
   - **Terceirizado / custo extra** (desmarcado por padrão). Marcado: lista de itens com nome + valor, botões + / −, e total.
     Ex.: Locutor R$ 5.000 · Animador R$ 2.000 · Programa 3D R$ 2.000 → Total R$ 9.000
   - Resumo final, com % e valor de cada linha:
     - A) Subtotal do trabalho (o que já foi calculado: horas × valor-hora + contingência + margem)
     - B) Custos extras
     - C) BV
     - D) Imposto
     - Total

4. **Cores das etiquetas (status, tipos, agências, clientes)**
   - Hoje cada cor tem par claro (fundo) + escuro (texto), mas o seletor mostra o tom escuro. Inverter: o seletor mostra o tom **claro** e o escuro é derivado dele.
   - Nos gráficos (barras dos relatórios, linha do tempo do dia, etc.) usar o tom **claro**, não o escuro.
   - Seletor de cor livre (escolher qualquer cor), além das predefinidas.
   - Paleta = predefinidas (fixas, nunca saem) + personalizadas (criadas ao escolher uma cor nova).
   - Cor personalizada continua na paleta enquanto algum item usar; quando nenhum item usar mais, ela some sozinha. Predefinidas nunca somem.

5. **Detecção de inatividade com sugestões de pausa**
   - Com a sessão rodando, detectar quando mouse/teclado ficam parados por X min (padrão 5 min, configurável) e, opcionalmente, quando outro app (ex.: WhatsApp) está em primeiro plano.
   - Não pausar sozinho: ir acumulando sugestões, ex.: "Você ficou parado 30 min e voltou às 10h30".
   - Lista de sugestões com **Aceitar** / **Ignorar** (e aceitar todas). Aceitar insere a pausa na sessão ativa (divide o intervalo), com registro no histórico de correções.
   - Hoje existe só uma parte: detecta app suspenso/aba fechada (limite 15 min) e mostra um aviso único por vez.
   - Limite técnico: navegador não vê o mouse/teclado fora da própria aba. Caminhos:
     a) Idle Detection API do Chrome/Edge no Mac (com permissão) — só ociosidade geral, não funciona no Safari nem no iPhone;
     b) pequeno app auxiliar no Mac (ex.: dentro do Utilitário do Tulão, pywebview) que lê o tempo ocioso do sistema e o app em primeiro plano e envia para o Tempo — cobre tudo, inclusive WhatsApp;
     c) Tempo como app de Mac (empacotado) com essa leitura embutida.

6. **Largura das colunas arrastando** — segurar a linha vertical entre colunas e arrastar para esquerda/direita (todas as tabelas; largura fica salva por tabela).
7. **Edição direto na tabela** (estilo Notion)
   - Texto: clicar e reescrever na própria célula.
   - Data: clicar abre um calendário para escolher a nova data (prazo continua pedindo motivo e guardando histórico).
   - Valor: digitar só números e formatar sempre como R$ x.xxx,xx (ponto no milhar/milhão/bilhão, vírgula nos centavos).
   - Status/pagamento: usar o dropdown com busca do item 1.
8. **Etiqueta do cliente com sigla da agência** — ✅ feito (sigla editável no cadastro da agência; etiqueta `[BR][ABA]` nas tabelas)
   - Coluna/campo **Agência**: continua `[BRENDA]` (nome completo, cor da agência).
   - Coluna/campo **Cliente**: `[BR][ABA]`.
   - Primeiro bloco do cliente: sigla da agência com a cor da agência. Sigla editável no cadastro; padrão = 2 primeiras letras. Se chocar com outra agência, troca a 2ª letra pela próxima letra do nome (ex.: BRENDA = BR, BRASILB = BA) até ficar única.
   - Segundo bloco: nome do cliente com a cor do cliente.
   - Cor do cliente escolhível no cadastro (já existe o campo; passa a aparecer na etiqueta). Padrão: variação da cor da agência quando o cliente for criado dentro da agência.
   - Cliente direto (sem agência): só o bloco do cliente.

## Ideias para o futuro (lembrar o Tulio ao planejar próximas etapas)
- F1. **Fee mensal** — valor fixo recebido por mês de um cliente, cobrindo vários projetos ao mesmo tempo. Conta diferente no balanço do mês (como distribuir entre projetos / R$ por hora ainda a definir pelo Tulio).
- F2. **Gastos fixos** — programas, Dropbox, hospedagem etc. (entram no balanço mensal e no cálculo de rentabilidade).
- F3. **To-do list** do dia / da semana / geral, gerada a partir de tarefas, prazos e pendências.
- F4. **Painel lateral na tela inicial + aba "Avisos"**
  - Na lateral da tela inicial (Time Sheet): avisos pendentes (pausas sugeridas, lembretes, alertas, sugestões do Gmail/app de Mac) e a to-do list (F3).
  - Nova aba **Avisos**: histórico permanente de todos os avisos, com o que foi **aceito**, **ignorado/declinado** ou **encerrado**, data/hora da decisão e a que sessão/projeto se refere. Nunca apaga.
  - Implicação técnica: guardar cada aviso como registro próprio (tabela `tempo_notices`), em vez de só dentro da sessão como hoje.

## Sugestões — Avisos (a validar)
- A1. Ordenados por data (pedido do Tulio) + agrupados por dia ("Hoje", "Ontem", "Esta semana").
- A2. Filtros por tipo (pausa, lembrete, prazo, cobrança, Gmail), por decisão (aceito/ignorado/pendente) e por projeto; busca.
- A3. Adiar ("me lembre em 1 h / amanhã") além de aceitar/ignorar.
- A4. Desfazer uma decisão a partir do histórico (ex.: remover uma pausa aceita por engano).
- A5. Contador de pendentes no menu lateral e no ícone do app.

## Sugestões — Orçamentos (a validar)
- O1. Proposta em PDF com a identidade do Tulio, gerada da calculadora (escopo, etapas, prazo, rodadas, condições de pagamento, validade).
- O2. Versões do orçamento (v1, v2, v3 da negociação) com histórico de valores.
- O3. Modelos/pacotes reutilizáveis (ex.: "Vinheta 30s", "KV + desdobramentos") com horas e preço base.
- O4. Preço sugerido pelo histórico: projetos parecidos (mesmo tipo/cliente) levaram X h e saíram por R$ Y.
- O5. Alerta de preço abaixo do R$/hora mínimo; taxa de urgência para prazo curto (+%).
- O6. Valor líquido sempre visível: quanto sobra depois de BV, imposto e terceirizados.
- O7. Condições de pagamento (50/50, 3x, entrada + entrega) → ao converter, já cria as parcelas previstas no financeiro.
- O8. Funil: taxa de aprovação por agência/cliente/tipo, tempo médio de resposta, lembrete automático de follow-up.

## Sugestões — Financeiro e relatórios (a validar)
- R1. Contas a receber por parcela, com vencimento → calendário + status "Atrasado" automático.
- R2. Contas a pagar: terceirizados (ex.: "Pagar André R$ 1.500", que hoje está na observação do Notion) + gastos fixos (F2).
- R3. Fluxo de caixa mensal: recebido, previsto, saídas → saldo do mês e dos próximos 3 meses.
- R4. Bruto × líquido: descontando imposto, BV e terceiros → lucro real e R$/hora líquido.
- R5. Impostos: provisão mensal (% configurável sobre o faturado) e faturamento acumulado de 12 meses com alerta de limite (MEI/Simples, limite configurável).
- R6. Concentração de receita: % do faturamento por agência/cliente (risco de depender de um só).
- R7. Prazo médio de recebimento por agência (quem paga rápido / quem atrasa).
- R8. Meta mensal de faturamento com barra de progresso; comparativo mês a mês e ano a ano.
- R9. Fechamento do mês em PDF (horas, faturado, recebido, a receber, despesas, lucro).

## Futuro — vida financeira pessoal (pedido do Tulio, 17/10/2026)
- Contexto: a empresa é basicamente ele; gastos da empresa são poucos (Dropbox, imposto, Adobe, Cinema 4D, etc.). F2 fica simples: lista de assinaturas/gastos fixos.
- Evoluir depois para organizar a vida financeira dele, incluindo gastos do cartão de crédito.
- Caminho proposto:
  1. Importar fatura do cartão e extrato da conta (OFX/CSV do banco; PDF da fatura como alternativa) com categorização automática e regras ("ADOBE → Programas").
     - Incluir **Pix enviados e recebidos** (vêm no extrato da conta). Pix recebido de cliente/agência → sugerir vincular ao pagamento do projeto (dá baixa no "a receber"). Pix enviado a terceirizado → vincular à conta a pagar. Regras por nome/CPF/CNPJ de quem enviou ou recebeu.
  2. Separar Empresa × Pessoal (PJ/PF), com "retirada" da empresa para o pessoal.
  3. Visão do mês: entrou, saiu por categoria, parcelas futuras do cartão, assinaturas.
  4. Mais adiante, se quiser: sincronização automática via Open Finance (serviço agregador terceirizado; avaliar custo e segurança).

## Futuro — controle de reembolsos do plano de saúde (pedido do Tulio, 17/10/2026)
- Contexto: terapias do filho pagas pelo Tulio e reembolsadas (total ou parcialmente) pelo plano. Hoje registrado no Notion. Volume grande (~R$ 20 mil/mês entre saída e entrada) distorce o balanço: parece que ganha e gasta mais do que de fato.
- Tabela própria **Reembolsos**, fora do balanço de receitas e despesas. No balanço entra só o **custo líquido** (pago − reembolsado) e o valor **"a receber do plano"**.
- Cada atendimento/pagamento: data, profissional/clínica, terapia, valor pago, recibo/NF (anexo), data da solicitação, protocolo, status, valor reembolsado, data do crédito, motivo da negativa, observações.
- Status: A solicitar → Solicitado → Em análise → Reembolsado / Parcial / Negado → Em recurso → (nova tentativa) …; cada tentativa fica no histórico, nunca apaga.
- Painel: pago no mês, já reembolsado, aguardando o plano, negados para recorrer, custo líquido do mês/ano; alerta de prazo para solicitar e de solicitações paradas há X dias.
- Ligação com o extrato: Pix/cartão para a clínica → sugerir lançar o atendimento; crédito do plano → sugerir vincular às solicitações (dá baixa).
- Importar a base atual do Notion (pedir CSV de exemplo).
- O Tulio já organiza bem reembolsos e **custos fixos pessoais** no Notion; vai explicar o modelo dele quando formos implementar. Custos fixos pessoais também entram como funcionalidade (junto da vida financeira pessoal). Não desenhar sem ouvir ele antes.

## Proposta de relatórios a partir do CSV real do Notion (17/10/2026)
Achados no CSV (67 projetos, 12 subitens): R$ 335.100 recebidos em 53 projetos pagos; ticket médio ~R$ 6,3 mil (mediana R$ 6 mil); BRENDA = 63% do recebido e 41 dos 67 projetos; R$ 42.900 em aberto (LEAN 19,7 mil, TRAMPOLIM 8 mil, BAQUESOLTO 6,5 mil, Satyros 5,7 mil, TALL PIET 3 mil); 7 cancelados; descontos e custos de terceiros só aparecem em "Observação"; 39 sem prazo; sem datas de pagamento estruturadas, sem horas, sem cliente final separado, sem tipo de trabalho.
- RP1. Concentração de receita por agência e por cliente final (EDS, HB, ABA… dentro da BRENDA).
- RP2. A receber com "idade" (há quantos dias está em aberto) e quem costuma atrasar.
- RP3. Dinheiro que ficou na mesa: cancelados + descontos (valor original × final, com motivo: atraso, viagem, renegociação).
- RP4. Lucro real por projeto: recebido − terceiros (André, locução, design) − imposto − BV.
- RP5. Ticket médio e R$/hora por tipo de trabalho (KV, Marca, Vídeo, 3D, Desdobramentos).
- RP6. Faturamento por mês/ano pela data real do pagamento (sazonalidade e comparação 2024 × 2025).
- RP7. Previsão: a receber + propostas em aberto × taxa de aprovação.
- Importação inteligente (cards Aceitar/Editar/Ignorar): cliente pelo prefixo do nome ("EDS - …", "HB // …"); datas de pagamento na observação ("pago em Junho", "Pago 24/10/2024"); "Era 9.000" → valor original; "Pagar André R$ 1.500" → custo de terceiro; "Pgt em 2x" → parcelas; "LIQUIDO 15.000" → valor líquido; tipo de trabalho por palavra-chave do nome.

## Decisão de plataforma (16/10/2026)
- Tempo como **app de Mac** que usa o **site como base** (mesmo código, mesmo banco). No iPhone, o mesmo site instalado na Tela de Início (PWA).
- Arquitetura proposta: site na Vercel + banco → app de Mac = "casca" nativa que abre o site e adiciona recursos do sistema (ociosidade, app em primeiro plano, barra de menus, atalhos, notificações). Atualizou o site, atualizou o Mac e o iPhone juntos.
- Casca a decidir: Tauri (leve, recomendado) ou pywebview (já usado no Utilitário do Tulão).

## Sugestões — aprovadas para entrar junto com o app de Mac
### Só no app de Mac
- S1. Cronômetro na barra de menus (projeto atual + iniciar/pausar/trocar).
- S2. Atalho global de teclado para iniciar/pausar/trocar de tarefa.
- S3. Detectar arquivo aberto (After Effects, Illustrator, Cinema 4D, Blender…) e sugerir o projeto pelo nome do arquivo.
- S4. Tipo de trabalho pelo app em uso (After Effects → Motion, Illustrator → Ilustração, Cinema 4D/Blender → 3D, Zoom/Meet → Reunião).
- S5. Detectar reunião (Zoom/Meet/Teams) e sugerir sessão "Reunião".
- S6. Abrir ao ligar o Mac e perguntar se quer iniciar o registro.
- S7. Notificações nativas com botões (Encerrar / Continuar / Pausar).
### Time Sheet inteligente
- S8. Lacunas do dia: "entre 14h e 14h40 não há registro — lançar?".
- S9. Resumo ao encerrar o dia (total, projetos, lacunas, sessões sem tipo).
- S10. Trocar de tarefa sem parar (divide a sessão em duas).
- S11. Ao registrar tempo em projeto já "Enviado", perguntar se é rodada de revisão.
- S12. Meta de horas por dia/semana.
### Alertas de projeto e dinheiro
- S13. Projeto chegou a 80% / 100% das horas estimadas.
- S14. R$/hora do projeto caiu abaixo de um mínimo definido.
- S15. Cobrança: concluído há X dias e não pago → aviso + texto de cobrança pronto para copiar.
- S16. Previsão de recebimentos por mês.
### iPhone e integrações
- S17. Atalhos da Siri / app Atalhos: "Iniciar Tempo no projeto X" via link.
- S18. Google Agenda: reuniões viram sugestões de apontamento.
- S19. Relatório de horas por cliente/agência para enviar (PDF).

### Dúvidas a confirmar antes de implementar o item 3
- [x] DECIDIDO (17/10/2026): BV sobre A+B; imposto sobre A+B+C. Cálculo "por dentro", como nota fiscal: total = líquido ÷ (1 − %).

---

## Versão 2.01 — status

### Feito nesta versão
- **Avisos** (`src/notices.js`): tabela única `tempo_notices` para sugestões de pausa, prazos, cobranças, orçamentos com validade próxima e lembretes exibidos. Cada aviso fica registrado para sempre com decisão (aceito, ignorado, adiado) e data; aba **Avisos** com filtros (Pendentes, Adiados, Aceitos, Ignorados, Todos) agrupada por dia.
- Sugestões de pausa migradas para avisos (Aceitar, Ignorar, Aceitar todas); ao encerrar a sessão, as pausas não aceitas viram "ignoradas" no histórico.
- Varredura automática (ao abrir e a cada 5 min): prazo vencido ou em até 2 dias, cobrança atrasada, orçamento que vence em até 3 dias.
- Adiar 1 dia (volta a aparecer automaticamente).
- **To-do** manual com painel lateral na tela inicial (Time Sheet), marcar como feito e remover.
- Painel lateral com avisos pendentes na tela inicial.
- Coluna `tempo_notices` adicionada a `db/schema.sql` (RLS aplicada na lista de tabelas).
- Versão exibida no rodapé da barra lateral (v2.01).

### Ainda não feito (fica para 2.02)
- S8 lacunas, S9 resumo do dia, S10 trocar de tarefa sem parar, S11 revisão ao enviar, S12 metas, S17 link de início.
- Financeiro: parcelas a receber (R1), contas a pagar com terceiros (R2), fluxo de caixa (R3), bruto × líquido (R4), valor original/desconto, tipo principal, gastos fixos (F2).
- Relatórios e orçamentos: RP1–RP7, O2–O8, R5–R8.
- Importação do Notion mais inteligente (cliente pelo prefixo, datas de pagamento na observação, "Era X" como valor original, terceiros, LIQUIDO, tipo por palavra-chave) — tudo como sugestão a aprovar.
- Decisões: base do BV/imposto e "por dentro" já decididas (ver item 3). Pendentes: modelo de reembolso do plano de saúde e de custos fixos pessoais (o Tulio explica a partir do Notion); desenho detalhado do to-do.
- Login e sincronização com Supabase (o schema existe, a ligação não).

### Adicionado na 2.01 (depois da primeira entrega)
- **Reembolsos** (tela própria, separada dos custos fixos): uma tabela por mês com Despesa, Anotação, Data, Pagamento, Reembolso, Requerimento e Valor. No dia 1 de cada mês a tabela nova é criada sozinha, copiando as linhas do mês anterior com Pagamento "a Pagar", Reembolso "a Pagar", Requerimento "a Fazer" e data no dia 10. Botão "Novo mês" para criar na hora.
- Totais do mês: pago por você, já reembolsado, saldo líquido (custo real) e ainda a reembolsar.
- Importação do CSV do Notion (mês pela coluna Data; linhas sem data seguem o mês anterior). Os dados não ficam no código: são importados dentro do app.
- Pendente: levar o saldo líquido de reembolsos para o balanço mensal do Financeiro (2.02) e persistir no Supabase.

### Banco online e login (2.01)
- Login por e-mail e senha (Supabase Auth). Sem sessão, aparece a tela de entrar. "Sair" fica no rodapé da barra lateral.
- Dados gravados no Supabase (tabelas tempo_*, com RLS por usuário). Gravações são enfileiradas na ordem em que acontecem, para respeitar as chaves estrangeiras.
- Sem login (ou sem a biblioteca do Supabase), o app continua em modo memória com dados fictícios.
- Chave pública em src/config.js. Nunca colocar a service_role no repositório.
- Campos sem coluna no banco aparecem no console como aviso; tabela tempo_reminders guarda o conteúdo em jsonb.
- Pendente: migração completa do Notion (Terapias e Freelas) e teste real com a conta no navegador.

## Terapias — notas fiscais, comprovantes e reembolso (pedido do Tulio, 17/10/2026)
Adendo ao item de reembolsos acima. Tudo que o app lê ou sugere vai para a fila de avisos; nada muda a tabela sem confirmação, exceto onde indicado.

### Upload de nota fiscal
- Área para subir o PDF da nota fiscal. O app lê o **valor** e identifica a **terapeuta** (pelo CNPJ ou pelo nome no documento).
- Se identificar: preenche a linha daquela terapeuta no mês de referência com o valor. O valor pode ser editado depois.
- Se não identificar: aviso pedindo para você informar quem é a terapeuta. Na primeira vez, você escolhe; depois, o app reconhece aquele CNPJ ou nome como a terapia X ou Y e não pergunta de novo.
- O PDF fica anexado à linha da terapia no mês.

### Mês de referência (janela de datas)
- Notas enviadas de **20 do mês anterior até 19 do mês atual** entram no **mês atual**.
  - Exemplo: nota enviada entre 20/09 e 19/10 → Outubro. Nota enviada a partir de 20/10 → Novembro.
- Confirmado pelo Tulio: o mês do nome do arquivo é o mês da **janela** (o mês que será pago), não o mês em que a nota foi enviada.

### Arquivo no iCloud
- Pasta: `iCloud/Terapias/Ano_Mes` (ex.: `Terapias/2026_11`).
- Nota fiscal renomeada para `NotaFiscal_Ano_Mes_NomeDaTerapeuta.pdf`.
- Comprovante de pagamento renomeado para `Comprovante_Ano_Mes_NomeDaTerapeuta.png`, salvo na mesma pasta do mês. Ao subir o comprovante, a linha vai para **Pagamento: Pago**.
- Decidido: o app de Mac faz a gravação na pasta do iCloud. A versão web não grava em pasta do iCloud, então sem o Mac o salvamento seria manual.

### Leitura de documentos (OCR)
- Nem todas as notas são texto: algumas vêm como imagem ou PDF escaneado. Os comprovantes de pagamento vêm sempre como PNG.
- Por isso a leitura precisa de OCR como caminho padrão, com texto nativo do PDF como atalho quando existir.
- Sugestão: no app de Mac, usar o reconhecimento de texto nativo do macOS (Vision), que roda localmente e não envia documentos para fora. Decisão a confirmar.
- Campos a extrair: valor, CNPJ, nome da terapeuta, data de emissão e, no comprovante, data do pagamento e valor pago.
- Se a leitura tiver baixa confiança, o app não preenche sozinho: cria aviso para você confirmar.

### Requerimento
- Continua manual. O app não preenche "Requerimento" sozinho.

### Reembolso (futuro, com Open Finance)
- O app identifica os pagamentos do plano (ex.: Aloma 2000, Raquel 3000, Patrícia 1000) e sugere como o reembolso foi feito, inclusive combinações (Aloma + Raquel = 5000; Patrícia = 1000; ou Raquel 3000 + Aloma e Patrícia somadas).
- Se houver uma combinação óbvia, marca automaticamente.
- Se não for óbvia, cria aviso perguntando qual foi feita, para você confirmar.
- Exemplos de valores são apenas referência.
- Depende do Open Finance, que ainda será projetado.

### Ordem sugerida (quando formos implementar)
1. Cadastro de terapeutas com CNPJ e nomes alternativos (aprendidos com a confirmação).
2. Leitura de PDF e PNG: texto nativo quando houver, OCR (Vision, no Mac) quando não houver; extração de valor, CNPJ e nome.
3. Avisos de "não identificado" e confirmação.
4. Renomear e salvar na pasta do mês no iCloud (app de Mac).
5. Comprovante → status Pago.
6. Sugestão de reembolso via Open Finance.

### Exemplos reais recebidos (17/10/2026) — para testar a leitura
- Identificação pelo conteúdo do documento, nunca pelo nome do arquivo (o arquivo enviado se chamava "Homero_Nota" mas a nota é da Raquel).
- Nota fiscal de Raquel Barreto Gama de Oliveira (psicopedagoga), NFS-e nº 77, emitida em 31/08/2026, R$ 2.250,00, veio como foto de impresso (precisa de OCR). Mês de referência: Setembro (janela 20/08–19/09).
- Pix de R$ 1.250,00 em 14/09/2026 para Homero Pedrosa Almeida, da equipe Funcional. Não se relaciona com a nota de Raquel: é outra terapia, com outro fornecedor.
- Próximo passo: receber uma nota e um comprovante do mesmo mês, da mesma terapeuta, para testar a correspondência completa.
- Par de teste (mesmo mês): nota nº 77 da Raquel (R$ 2.250,00, emitida 31/08) e Pix de 14/09/2026 de R$ 2.250,00 para Raquel Barreto Gama de Oliveira. Resultado esperado: valor exato e nome do emitente igual ao destinatário do Pix, então a linha de Raquel em Setembro fica Pago. Nomes de arquivo esperados: NotaFiscal_2026_09_Raquel.pdf e Comprovante_2026_09_Raquel.png.

### Migração do Notion — TERAPIAS (feita em 17/10/2026)
- Importadas 149 linhas com data, de 2024-06 a 2026-10 (29 meses). Soma R$ 393.140,04, igual ao Notion menos as linhas excluídas abaixo.
- Excluídas: 7 linhas-modelo sem data (Homero (2), Claudiane (2), AT (2), Patrícia (2), Raquel (2), Aloma (2), Dentista (2)); a linha "Feito em 15.09" (só observação); "EXTRA HOMERO DE MARCO" (R$ 500, a própria nota pede para apagar quando pago); 3 linhas em branco.
- Pendente de confirmação: "Dentista (2)" (R$ 255, sem data) e "EXTRA HOMERO DE MARCO".
- Bug corrigido: a coluna `kind` de tempo_status_options não aceitava os status de reembolso (reimb_pay, reimb_refund, reimb_req). Corrigido no banco e no db/schema.sql. Os status foram criados na conta.
- Nomes mantidos como no Notion (ex.: "Patricia (1)"). Limpeza do sufixo "(n)" fica para depois.
- FREELAS ainda não migrado.

### Migração do Notion — FREELAS (feita em 17/10/2026)
- 67 projetos (agência, status, orçamento, prazo, observação) e 12 subtarefas viradas em tarefas dentro do projeto pai (NUVEM SHOP V01, V02 e V03).
- Valor Pago gravado como um pagamento por projeto, sem data (53 pagamentos, soma R$ 335.100, igual ao Notion). Valor Restante foi para "remaining_override".
- Conferido: 67 projetos, orçamento total R$ 83.300 (igual ao Notion). Um projeto sem agência (FILME SATYROS), que fica sem cliente.
- Suposição a validar: cada agência virou também um cliente de mesmo nome. Se a agência e o cliente final forem coisas diferentes, o ajuste é renomear ou separar depois.
- Mapeamento de status: Standby → "Stand by"; Não iniciada → "A fazer"; Pagamento "Nota Fiscal Emitida" → não tinha equivalente (nenhuma linha usava). Pagamento vazio em "NETFLIX BTS 2026 - AP 01" → "Não faturado" (confirmar).
- Pendente: "Cancelado" no campo de pagamento ficou sem status de pagamento (o app só tem o status do projeto "Cancelado").

## Bugs (reportados pelo Tulio, 17/10/2026)
- [x] Ao clicar em "Pago" para mudar o status, abre a janelinha mas a página rola até o fim (base). Corrigido: o foco do campo de busca do combo rolava a página; agora usa preventScroll. Provável foco/scroll em um elemento da base ao abrir o popover de status (combo). Investigar.

## Custos pessoais — modelo (Notion "DESPESAS", explicado pelo Tulio em 17/10/2026)
- Uma tabela por mês, como Reembolsos: Despesa (nome com emoji), Valor, Pagamento (Pago / a Pagar), Data, Anotação. Total do mês por soma.
- Sinal do Valor: positivo = saída (gasto); negativo = entrada (ex.: Salário, parte que outra pessoa paga do plano). Total do mês = soma (negativo = sobra).
- Exemplo set/2025 (total −R$ 8.950): Imposto Simples 1.370, Fenix 200, Michele 180, Plano de Saúde 2.300, Energia 260, Diarista 800, Escola + taxa 100, Claro (celular e net) 190, Cartão Nubank 7.900, Aluguel 3.500; entradas: Salário −23.400, Plano de Saúde Amanda −2.350.
- Freela pode aparecer sem valor (linha de lembrete do mês).
- Layout: entradas em cima (+), saídas embaixo (−), cada uma com subtotal. Resumo do mês: previsto, realizado e saldo.
- Sinal fixo: valor guardado positivo + tipo (entrada/saída); a tela mostra + ou − fixo.
- Repetir todo mês: copia o mês anterior, mantém a data, Pagamento volta para "Não pago" (saída) ou "Não recebido" (entrada). Valores editáveis por mês.
- Parcelas: "parcela X de Y", com fim. Status "Não teve" pula o mês sem apagar histórico.
- Coluna "Paga em" (data do pagamento/recebimento), para ligar ao Open Finance depois.
- Vencimento: quando passa do dia sem pagamento, entra como aviso de atrasado (sistema de avisos).
- Plano de Saúde: NÃO é reembolsado. Fica como saída comum, sem ligação com Reembolsos. Os reembolsos são só das terapias do filho (tela de Reembolsos).
- Pendente: categorias (opcional) e quais itens são da empresa.

## Categorias dos custos (confirmado pelo Tulio, 17/10/2026)
- Categoria principal: PESSOAL ou EMPRESA. Dentro de cada uma, subcategorias.
- PESSOAL
  - Moradia: Aluguel
  - Contas da casa: Energia, Claro (celular e net)
  - Casa e serviços: Diarista
  - Saúde: Plano de Saúde (não reembolsado; reembolsos são só das terapias do filho)
  - Educação: Escola + taxa
  - Cartão e dívidas: Cartão Nubank
  - Renda: Pró-labore fixo (entrada), Plano de Saúde Amanda (entrada)
- EMPRESA
  - Impostos: Imposto Simples
  - Contabilidade: Fenix (contador)
  - Assinaturas e programas: Dropbox, Adobe, Cinema 4D
  - Freelas (entrada): Freela (PEDRO, BOTICARIO/REBU, TAL PIET)
- Pró-labore: tratado como entrada pessoal fixa. Confirmar se a empresa também registra como saída.

## Próximos — avisos (pedido do Tulio, 17/10/2026)
- [ ] **Botão "Resolver" nos avisos**: leva até o item que causou o aviso (ex.: a conta ou o recebimento em Despesas, o projeto, a sessão). Não altera nada no aviso; ele só muda para "resolvido" quando o Tulio volta e clica em "Ok, visto".
- [ ] **Conta sem nome em Despesas**: a linha de 10/10/2026 aparece como "Conta vencida: sem nome". É uma linha vazia importada; apagar ou preencher. Também conferir se há outras linhas sem nome.

## Regra das pausas automáticas (definida pelo Tulio, 17/10/2026)
- Qualquer parada (tela bloqueada, mouse/teclado inativo, WhatsApp em primeiro plano) vira **sugestão de pausa** na lista de Avisos. Nada para o cronômetro sozinho.
- **Aceitar:** a pausa fica registrada na sessão e aparece como um intervalo vazio na linha do tempo.
- **Ignorar:** o tempo continua contando normalmente.
- O WhatsApp gera o aviso depois do fato ("WhatsApp: X min, pausar?"), não em tempo real.
- Mac: incluir detecção de tela bloqueada e de app em primeiro plano (WhatsApp) no monitor; o site já cria e registra a pausa aceita.

## Integração com e-mail (pedido do Tulio, 17/10/2026)
- E1. **Demanda por e-mail**: e-mail que chega num endereço/etiqueta dedicado vira projeto ou tarefa em rascunho (cliente e agência pelo remetente; assunto vira o nome; corpo vira notas). Nada é criado sem aprovação.
- E2. **Sugestão de orçamento**: e-mail com pedido de cotação ("quanto custaria…", "pode orçar…") vira um orçamento em rascunho na calculadora, com o cliente já preenchido.
- E3. **Lembrete de retorno**: orçamento enviado sem resposta há X dias gera aviso de follow-up com texto pronto para copiar.
- E4. **Confirmação de pagamento**: e-mail de comprovante ou aviso de recebimento sugere a baixa do pagamento do projeto.
- E5. **Notas fiscais e cobranças**: NF emitida por e-mail anexa o PDF ao projeto/terapia certa (ligação com o item de Terapias).
- E6. **Atualização de prazo**: cliente pede mudança de prazo por e-mail → aviso com a data proposta para o Tulio aceitar.
- E7. **Resumo diário**: e-mails não respondidos de clientes e agências listados no fim do dia, junto com o To-do.
- Cuidados: só ler as pastas/etiquetas escolhidas; nunca enviar e-mail sozinho; tudo que vier por e-mail passa pela fila de Avisos com Aceitar/Ignorar.
- Caminho técnico a avaliar: Gmail API (conector já disponível) com webhook ou leitura periódica.

## Padrão estético (pedido do Tulio, 17/10/2026)
- Controles compactos, sem poluição visual: dropdowns pequenos, nada gigante.
- Nomes de meses com inicial maiúscula (ex.: "Outubro de 2026").
- Tabelas no mesmo padrão da lista de Projetos: ícone no cabeçalho, nome em negrito, etiquetas coloridas.
- Esse padrão vale para tudo que for feito daqui para frente.

## To-do (próximos)
- Aviso na hora do prazo: to-do com horário gera aviso na lista de Avisos quando chega a hora (hoje só fica vermelho depois de vencido).
- Duração no to-do: "reunião de 1h às 14h" preenche início e fim.
- Vínculo com cliente ou projeto: se o texto citar um cliente ou projeto conhecido, o to-do fica ligado a ele.

## Financeiro automático — Organizze + Nubank (decidido pelo Tulio, 18/10/2026)
- Fonte: API REST v2 do Organizze (Basic auth com e-mail + chave de API; conta paga ativa). Conexões Open Finance do Organizze trazem contas e cartões da Nubank (PF e PJ a confirmar).
- Quando consultar: (1) ao abrir o app; (2) a cada 2h; (3) botão "Atualizar" na tela de Financeiro.
- Chave de API fica só no servidor (variável de ambiente), nunca no navegador.
- Os lançamentos novos entram direto na tela de Financeiro, marcados como "novos" até o Tulio revisar (sem passar pela lista de Avisos). Categoria pode ser ajustada depois.
- Pendências: (a) Tulio gera a chave de API no Organizze e confirma se PF e PJ da Nubank conectam; (b) limite de requisições e frequência de sincronização do Organizze não confirmados; (c) a consulta de 2h depende do plano do Vercel (cron de hora em hora/2h pode exigir o plano Pro) ou de uma tarefa agendada do Claude.

## Fixos e conciliação automática (anotado 2026-10-18)
- Tela de Fixos: nome, categoria, valor esperado, dia de vencimento.
- Regras de vínculo: nome do favorecido/estabelecimento → fixo. Criada ao aprovar ou vincular manualmente; não pergunta de novo depois.
- Casamento por frequência + valor parecido: mesmo valor (ex.: 3900 todo mês) ou aproximado (tolerância de arredondamento, ex.: 1900 vs 1923,29 ISAAC). Sugere a conexão na primeira vez; depois do casamento, não pergunta mais.
- Se já marcado como pago manualmente: atualiza o valor pelo documento (fatura/boleto), guarda o histórico da diferença.
- Se não marcado: marca como pago com a data e o valor do documento.
- Documentos com validade (plano de saúde, seguro, assinatura): ler Gmail e atualizar vigência/próximo vencimento.
- Ambiguidade (dois fixos com valor parecido): prioriza o nome do favorecido; pergunta só se ainda empatar.

## Valores herdados de mês anterior (anotado 2026-10-18)
- Ao virar o mês e duplicar um fixo/lançamento, o valor copiado aparece em cinza claro (placeholder).
- Ao clicar e editar, ou quando o app preencher com dado coletado (fatura/boleto/Gmail), o texto volta ao preto normal.

## Decisão atual (2026-10-18)
- Conciliação financeira via e-mail da Nubank por enquanto (OFX da Nu Empresas e da conta PF, PDF da fatura do cartão).
- Organizze fica para reavaliar depois de 14/11/2026 (lembrete agendado).

## Pendências consolidadas (anotado 2026-10-18)

### Financeiro PF (Conta, Investimentos, Cartão, Visão geral)
- Abas do Financeiro PF: Conta Corrente, Investimentos, Cartão e Visão geral (resumão, relatório e gráfico de gastos por categoria). Hoje existe só a lista única com filtro Tudo / Conta / Cartão.
- Investimentos: um card por caixinha do Nubank com saldo e entradas/saídas do mês. Caixinhas: Giro, Reserva, Especial (aviso do teto de R$ 10 mil) e Freelas. Caixinha nova criada no Nubank aparece sozinha.
- Movimentos de caixinha (RDB, Resgate, Aplicação, Caixinha, Rendimento) seguem como "Interna", fora dos totais.
- Cartão: ler o PDF da fatura mensal (precisa de biblioteca de PDF no servidor e de um PDF de exemplo para testar). Os itens entram como gastos no lugar do débito "Pagamento de fatura", que já fica fora das saídas (scope "cartao").
- Conta de cartão (final d660) já vai para PF; a regra está no servidor (api/gmail/sync.js).
- Confirmar transferências da conta PJ: "Tulio de Azevedo Melo Couceiro" (3 movimentos, R$ -46.791) e "BRENDA" (2 movimentos, R$ 40.396). Se for transferência para você ou entre empresas, marcar como interna.
- Categorias: padrão + criação livre. Ao definir a categoria de uma contraparte, vale para todos os lançamentos com esse nome. Falta sugerir categoria automaticamente.
- Mostrar "onde foi" também pelo vínculo automático com gastos (hoje o vínculo é manual, como o do Dentista).
- Fechar mês: decidir se trava edições no mês fechado.

### Sincronização automática do Gmail (a cada 2 horas, app fechado)
- Criar SYNC_SECRET (uma string longa e aleatória) e colocar no Vercel (variável de ambiente) e no GitHub (Settings > Secrets and variables > Actions).
- Ativar o workflow de agendamento: arquivo pronto em /tmp/claude-0/-home-claude/7ff19e21-23d4-5897-a91a-cb413343fd03/scratchpad/.github/workflows/sync-email.yml. Mover para repo-extra/.github/workflows/ depois que o segredo existir. O Vercel no plano gratuito só roda cron uma vez por dia, por isso o GitHub Actions.
- Testar ponta a ponta: conexão, leitura de OFX e recarga com o app fechado.

### Custos fixos e reembolsos
- Conciliação automática de fixos (regras por favorecido, casamento por valor com tolerância, validade pelo Gmail): ver seção "Fixos e conciliação automática".
- Reembolso da SulAmérica: hoje a data é marcada à mão ("Reembolsado em"). Falta sugerir o lote quando entrar um crédito da SulAmérica.
- Dentista: recorrência mensal (só outubro/2026 foi criado).
- Cliente REBU CONSULTORIA LTDA (CNPJ 38.540.017/0001-04, R$ 6.000 em 23/09): aguardando confirmação para cadastrar.
- Organizze: decidir depois de 14/11/2026 (lembrete agendado).

### Integração com e-mail
- Ver seção "Integração com e-mail" (E1 a E7). Próxima etapa depois do financeiro.

### Tipos de trabalho e preferências
- Verificar em uso: Arquivar / Mesclar / Apagar com destino / Arquivados (V2.01.55).
- Verificar visualmente: largura automática das colunas, editor de notas crescente, prévias de altura das linhas (geral e financeiro).

### Geral
- Rotacionar a chave secreta do Supabase (recomendado, não confirmado).
- Conferir o schema.sql contra o banco (tempo_bank_txns já tem category e scope "cartao"; tempo_integrations e tempo_reimb_rows.refunded_on também).

### Status em 2026-10-18 (V2.01.55)
- Feito: abas do Financeiro PF (Visão geral, Conta corrente, Cartão, Investimentos); separação conta × cartão; cartão em PF; cancelados fora do restante; linhas do financeiro mais finas, com preferência separada; tipos de trabalho com Mesclar / Arquivar / Apagar com destino; categorias por contraparte; lista completa de "Para onde foi o dinheiro".
- Bloqueado por você: SYNC_SECRET (Vercel e GitHub) e ativação do workflow; PDF de exemplo da fatura; decisão sobre travar o mês fechado; confirmação das transferências PJ→"Tulio de Azevedo Melo Couceiro" e "BRENDA"; confirmação do cliente REBU; chave do Supabase.
- Bloqueado pelo extrato: o OFX só diz "Resgate RDB", sem a caixinha. Para separar Giro, Reserva, Especial e Freelas, preciso que você informe de qual caixinha é cada movimento ou outra fonte de dados.
- Não iniciado: conciliação automática de fixos, sugestão de reembolso SulAmérica, recorrência do Dentista, integração de e-mail (E1–E7).

### V2.01.56 (2026-10-18)
- Feito: sugestão de vínculo de custo fixo (nome parecido, mês igual, valor dentro de R$ 5 ou 3%); ao vincular, o valor e a data do extrato passam para o custo fixo e ele vai para Pago. Sugestão de lote SulAmérica (crédito igual à soma de um mês pendente); ao confirmar, marca "Reembolsado em" com a data do crédito.
- Dentista: a recorrência mensal já existe (o mês novo copia o anterior); confirmar no próximo mês.
- Não iniciado, com decisões pendentes: integração de e-mail E1–E7 (qual endereço ou etiqueta ler, e se orçamento sugerido pode criar rascunho sem aprovação).
- V2.01.56 (ajuste): "Saídas do mês" mostra cada lançamento com data, descrição, valor, conta (PF/PJ, clicável para trocar), categoria e onde foi, com rolagem. Lançamento marcado como PJ entra no resumo do PJ mesmo estando no cartão PF (ex.: Dropbox). A barra cinza foi removida.
- Categorias por sugestão: regras por palavra-chave no nome (mercado/atacadão → Alimentação; bar → Lazer; restaurante/iFood → Alimentação; posto → Transporte; farmácia → Saúde; Amazon/Shopee → Compras; assinaturas → Assinaturas; energia/água/telefone → Casa). A sugestão aparece como "sugerido" e só vira categoria quando você confirma; a confirmação vale para o nome inteiro. Ajustar as regras conforme os nomes reais aparecerem.
- V2.01.57: vínculo de pagamentos de terapia (PF) com a linha de reembolso do mesmo mês: sugestão automática quando o valor bate com uma única linha; botão "Vincular…" para escolher terapia ou custo fixo manualmente. Ao vincular a terapia, a categoria vira Saúde. Coluna reimb_row_id adicionada em tempo_bank_txns.
- V2.01.58: categoria Burocracia (PJ por padrão; contador, cartório, junta, DAS, INSS, Receita). Ao escolher a categoria de um nome, dá para marcar PF ou PJ para todos os lançamentos desse nome. Pendente: gastos fixos (Gastos) ainda usam o prefixo PESSOAL/EMPRESA no campo categoria; confirmar se a escolha PF/PJ deve ir também para lá.
- V2.01.58 (ajuste): Gastos ganhou o botão "Filtrar" (escondido por padrão): busca por nome (sem acento), categoria, status e faixa de valor. Quando há filtro ativo, o painel continua aberto.
- V2.01.58 (ajuste 2): saídas do extrato mostram o meio (Crédito pela conta de cartão; Pix e Débito pelo texto do extrato; Outro no resto). Gastos ganhou o filtro "Meio", que usa o meio do lançamento vinculado a cada gasto; gasto sem vínculo aparece como "Sem vínculo".
- V2.01.59 (ajuste 3): saídas agrupadas por mês, recolhíveis (o mês selecionado abre; os outros começam fechados); caixa ajustada ao conteúdo; relatório ao lado com barras por categoria, por meio e top 10 de "onde foi" do mês selecionado.
- V2.01.59 (ajuste 4): Entradas e Saídas não contam mais reembolsos recebidos nem terapias pagas; saem em KPIs próprios. Bolinha verde para entradas e vermelha para saídas. Ao confirmar o lote de reembolso, o crédito fica com categoria "Reembolso".
- V2.01.59 (ajuste 5): Saídas do PF mostram PF e PJ (PJ mostra só PJ); busca e filtro escondidos na lista de Saídas (nome, categoria, meio, conta, valor); bolinhas de cor em PF/PJ e nas categorias; gráfico de rosca por categoria e por meio no relatório.
- V2.01.59 (ajuste 6): terapia reembolsável tem categoria própria ("Terapia"), separada de Saúde; no relatório aparece sempre no fim da lista de categorias, em cinza. Lançamentos já vinculados foram atualizados.
- V2.01.60 (ajuste 7): relatório com uma visualização por vez (abas Categoria, Meio, PF/PJ, Onde foi); rosca centralizada; legenda em chips claros com as cores das categorias.
- Ideias para os relatórios (a escolher): evolução mensal empilhada por categoria; comparação com o mês anterior (variação por categoria); média móvel de 3 meses; top 10 maiores gastos do mês; frequência (quantas vezes por semana/mês foi a cada lugar); gasto por dia da semana e por horário; parcelas futuras do cartão; assinaturas ativas e total anual; gastos sem categoria para revisar.
- Ideias de filtros: período (últimos 30/90 dias, ano); valor acima de X; só itens sem categoria; só PJ ou só PF; só cartão ou só Pix; por nome de estabelecimento; só reembolsáveis; só vinculados ou não vinculados a gasto.

## Limpeza do código das telas (revisão de 16/11/2026, deixado para depois pelo Tulio)
A revisão V2.03.15 cuidou de segurança e funcionamento (fila de gravação, sincronização, testes). A limpeza das telas ficou para depois:
- Telas com linhas muito longas e HTML montado dentro do JavaScript: separar em funções menores, uma por bloco da tela.
- Muitas funções e variáveis soltas que todo arquivo enxerga: agrupar por tela, para uma mudança não quebrar outra.
- A divisão de Finanças (view-finance-reports.js, finance-bank.js, finance-links.js) foi mecânica: falta reorganizar por assunto dentro dos arquivos.
- Fazer uma tela por vez, com testes antes de mexer. Começar pelo Time Sheet ou pelo Financeiro (os mais complexos).

## Pendências da revisão de 16/11/2026
- App do Mac: aplicar a correção da leitura de notas (o app marcava o arquivo como lido antes de o site receber; nova versão guarda a fila até o site confirmar) e gerar o app de novo.
- Supabase: ligar a proteção contra senha vazada (Authentication, no painel). Só o Tulio consegue.
- Banco: decidir se apaga as tabelas antigas (4 de backup de 17/10 e 25/10, 11 gpt_old_*).

## Juntar os dois apps do Mac num só (pedido do Tulio, 16/11/2026)
Hoje rodam dois apps, os dois abrindo o site:
- **App antigo (Swift, `~/Applications/Tempo.app`, código em `mac/` deste repositório)** — o principal. Programa e arquivo em uso (reportActivity), pausas por ociosidade e por sono (reportIdle), cronômetro na barra de menu, notificações, ⌃⌥T to-do rápido, atualização sozinha via `~/APPTEMPO/mac/update.sh`. O site só aceita pausas e atividade dele (`isMacApp()` = `window.webkit.messageHandlers.tempo`).
- **App novo (Python/pywebview, `/Applications/Tempo.app`, repositório `tulioamc/tempo-mac`, pasta `~/tempo-build`)** — WhatsApp (contagem de mensagens enviadas), notas fiscais e comprovantes das conversas de terapia (PDF, PDF escaneado, fotos), cópia no iCloud `Terapias/AAAA_MM`, print de feedback (Cmd+J), lembretes no app Lembretes, atualização sozinha.

Plano: levar tudo para o app antigo (Swift), sem tirar nada dele.
- WhatsApp: ler `ChatStorage.sqlite` com SQLite3 (somente leitura, nunca ZTEXT), mesma consulta do `wa.py`.
- Notas: PDFKit para texto do PDF; Vision (VNRecognizeTextRequest) para foto e PDF escaneado; fila até o site confirmar (`reportNfse` devolve os ids).
- iCloud, feedback e lembretes: mesmas funções do `main.py`, chamadas pelo site via `messageHandlers.tempo` (o site hoje chama `window.pywebview.api`; aceitar os dois).
- Segurança: se a compilação falhar, o `update.sh` para antes de trocar o app (o instalado continua funcionando). Testar cada parte no Mac antes de desligar o app novo.
- Ao final: aposentar o app Python e a pasta `~/tempo-build`.


## Passagem para a conversa APP TEMPO [V2.04.00] (16/11/2026)
Estado ao fim da conversa V2.03 (site em V2.03.17):

**Como as coisas estão**
- Site: `tulioamc/APPTEMPO` (main publica na Vercel, https://apptempo-abon.vercel.app). Testes em `tests/` rodam no GitHub a cada envio (`node --test tests/*.test.js`).
- Banco: Supabase `bhupkabvbblcrmdlaukb`. Novidades de hoje: colunas `tempo_reimb_rows.suggested_amount` e `req_on`; gatilho `tempo_touch` (carimba updated_at) e função `tempo_sync_state()` (sincronização leve).
- Dois apps do Mac abertos ao mesmo tempo (ver "Juntar os dois apps do Mac num só"): o **antigo (Swift, ~/Applications)** é o principal — atividade, pausas, cronômetro na barra de menu; o **novo (Python, /Applications, repositório `tulioamc/tempo-mac`, pasta ~/tempo-build)** faz WhatsApp, notas/comprovantes e iCloud e se atualiza sozinho quando o VERSION da pasta muda (atualizar.sh, certificado "Tempo Local").
- Gravação: fila no aparelho (`tempo-outbox-v1`) que reenvia até o banco confirmar. Tela: `js/morph.js` atualiza só o que mudou (preserva foco e digitação); `window.TEMPO_NO_MORPH = true` volta ao jeito antigo se algo estranhar.

**Feito nesta conversa (V2.03.05 → V2.03.17)**
- Reembolsos: "Não se aplica" repete no mês novo; valor do mês anterior vira sugestão cinza; colunas na ordem Despesa, Pagar até, Pagamento, Pago em, Requerimento, Req em, Valor, Reembolso, Reembolsado em, Anotação; datas automáticas ao marcar Pago/Feito/Feito!; "Pagar até" mostra atraso; extrato marca reembolso como Feito! e avisa.
- Notas fiscais e comprovantes do WhatsApp (contatos de terapia), com janela de datas 20→19, cópia no iCloud e links na Anotação; valor só vira real com confirmação (comprovante marca Pago sozinho se o valor bater).
- To-dos: automático apagado não volta; página inicial só com abertos; "adiou" conta só quando a data vencida é trocada.
- Revisão geral (V2.03.15): fila de gravação, backup seguro, carga em paralelo, sincronização leve, atualização da tela sem redesenho, testes, finanças dividido em três arquivos. Corrigiu: agenda do Rafa e "Reembolsado em" não eram salvos.
- Resumo: selecionar na barra abre o mesmo menu da Sessão atual (Zoom, Transferir, Alterar tipo, Excluir). Testado na barra Por programa; na barra Arquivo / site falta conferir com dados reais.

**Pendências, por ordem**
1. Juntar os dois apps do Mac no antigo (plano acima).
2. Conferir se notas/comprovantes do WhatsApp chegam (avisos "Nota de …" na página inicial; tabela `tempo_notices` com key `nfse:`/`comp:`).
3. Cortar a sessão de APP PROMPT de 14/11 (08h04–11h42, 20h02 "Não especificado"): falta o Tulio dizer a hora em que fechou o Mac.
4. Pausa ao abrir o app quando o cronômetro ficou rodando sem atividade (ex.: Mac fechado).
5. Supabase: ligar proteção contra senha vazada (só o Tulio); decidir se apaga as tabelas antigas (backup_* e gpt_old_*).
6. Limpeza do código das telas (seção acima).
7. Item antigo ainda aberto: OFX do Nubank (novembro em diante) e PDF da fatura do cartão (aguardando arquivos).

**V2.05.03 — Análises (relatórios com gráficos e PDF)**
- Aba "Análises" (menu, depois de Metas; `js/view-analises.js`): abas Semana, Mês, 3 meses, 6 meses e Ano, com histórico. Lê `tempo_settings`: prodSemanal:AAAA-MM-DD, prodMensal:AAAA-MM, relTrimestral:AAAA-Tn, relSemestral:AAAA-Sn, relAnual:AAAA. Formato documentado no topo do arquivo (resumo, kpis, graficos colunas/linha/barras em SVG, secoes, comparacoes, sugestoes, acompanhamento, metas, ideias_tempo). Análises antigas (só "numeros") continuam aparecendo.
- PDF: botão gera A4 com capa; no app do Mac (`mac/Sources/TempoMac/PDFExport.swift`, mensagem `pdf`) salva em iCloud Drive/Tempo/Análises e abre; no navegador abre a janela de imprimir.
- Tarefas agendadas (Opus, só leitura no banco, gravam uma chave): semanal (seg 7h13), mensal (dia 1 7h20), trimestral (1/jan, abr, jul, out 7h27), semestral (1/jan e 1/jul 7h34), anual (1/jan 7h41). Juntam produtividade com as áreas do épico Tempo Intelligence (negócio, inadimplência, finanças PJ/PF separadas, reembolsos, WhatsApp, acompanhamento das sugestões anteriores). O épico deixa de usar API da OpenAI: análise fica nas tarefas agendadas do Claude.
- Reembolsos: links com acento (Patrícia) não duplicam mais (compara em NFC).
- Regras comuns das análises ficam no banco: `tempo_settings` chave `analiseGuia` (value.texto). Cada tarefa agendada só tem período, chave e foco, e lê o guia primeiro. Para corrigir uma regra, atualize só essa linha. Atenção: classificação do WhatsApp é `tempo_wa_contacts.tipo_id` (a coluna `tipo` é antiga); no extrato, PJ/PF é `entity`/`biz_entity` e `scope` é externa/interna/cartao.
- V2.05.05: Reembolsos, "Falta você requerer" só conta requerimento "a Fazer"/"Falta Nota" ("Refeito…" é requerido); "Não se aplica" só passa pela etapa de pagar.
- V2.05.04: gráficos com reais curtos ("R$ 32,8 mil") e rótulos de barra mais largos.

**Lição desta conversa:** antes de apagar ou trocar qualquer app/arquivo do Mac, conferir o que ele faz (o app "1.0" parecia velho e era o principal).


## Conversa APP TEMPO [V2.04.00] (16/11/2026)
**V2.04.01 — os dois apps do Mac juntos no antigo (Swift)**
- `mac/Sources/TempoMac/WhatsApp.swift`: contagem de mensagens enviadas (SQLite somente leitura, nunca ZTEXT), notas e comprovantes das conversas de terapia (PDFKit; Vision para foto e PDF escaneado), cópia no iCloud `Terapias/AAAA_MM`, fila até o site confirmar. Usa o mesmo registro do app em Python (`~/Library/Application Support/Tempo/wa_notas_v2.json`), então nada é lido duas vezes.
- Lembretes (alarme de to-do no app Lembretes): o site manda `{type:'reminder'}` por `messageHandlers.tempo` e recebe `TempoBridge.reminderDone`. O caminho `window.pywebview` continua aceito.
- Botão "Atualizar app do Mac" do site funciona no app Swift (`{type:'update'}`). Menu da barra ganhou "Ler WhatsApp agora". A versão do app instalado passa a ser a do site (antes era sempre "1.0").
- Nota do WhatsApp que não der para ler vira aviso "Nota de …: não consegui ler" (antes sumia calada).
- O GitHub compila o app do Mac a cada mudança em `mac/` (workflow "App do Mac (compila)"): erro de compilação aparece lá antes de chegar no Mac.
- Não levado: print de feedback (Cmd+J), que o Tulio já tinha desistido de usar e o site não chama mais.
- **Falta no Mac do Tulio:** atualizar o app (⌘U), dar Acesso Total ao Disco ao Tempo de `~/Applications`, fechar o app em Python e conferir a próxima nota/comprovante. O texto do PDF agora vem do PDFKit (antes pypdf): se uma nota não for lida, aparece o aviso acima. Só depois de conferido: apagar `/Applications/Tempo.app` e `~/tempo-build`.
- Sessão de APP PROMPT de 14/11: removidas 19h12 de "Não especificado" (14:23 de 14/11 a 09:36 de 15/11), direto no banco, com o estado anterior no histórico de edições. Pendência 3 resolvida; a 4 (pausa quando o cronômetro roda com o Mac fechado) continua.

**V2.04.02 — nota fiscal que chega como foto**
- A nota da Raquel (foto, não PDF) não entrava: o leitor exigia a chave de 44 dígitos colada e a linha de competência, que o reconhecimento de texto quebra em grupos. Agora a chave é remontada mesmo com espaços e pontos; sem a chave, a nota ainda entra pelo identificador do arquivo (sha), com o valor em cinza e aviso "Nota de … (foto)" que só vale depois da confirmação dele.
- Foto de nota e de comprovante também ganham cópia no iCloud (antes só PDF e PNG).
- Registro de arquivos lidos (`~/Library/Application Support/Tempo/wa_notas_v2.json`): o que já foi marcado como lido nunca é relido. Apagar esse arquivo faz os 60 dias serem lidos de novo sem duplicar nada (o site reconhece pela chave da nota e pelo sha do arquivo).

**V2.04.03 — excluir um intervalo vazio (lacuna)**
- "Excluir" dizia "Nada para excluir" quando o trecho selecionado não tinha nenhum registro, que é o caso da noite com o computador fechado. Agora a lacuna é marcada como "fora" no segmento anterior (`segsMarkFora` em `js/domain.js`): sai do bruto e das pausas, como já acontecia com trecho movido para outro projeto.
- Sessão de APP PROMPT de 14/11 arrumada no banco do mesmo jeito (a noite de 14 para 15 deixou de contar como ociosidade; ela mostrava "Ocioso 24h 40").

**V2.04.04 — WhatsApp: cliente conta como trabalho, o resto é pausa; link da nota abre o arquivo**
- WhatsApp nunca mais pede aprovação. Conversa com contato de trabalho (Cliente, Agência, Colega, Fornecedor, Administrativo, Misto mais cliente) conta como trabalho na sessão; qualquer outra vira pausa sozinha, que entra como Distração nos relatórios.
- Nova aba "Contatos WhatsApp" em Agências e clientes: lista os contatos com quantas mensagens ele mandou e deixa marcar o tipo (as mesmas caixinhas coloridas do resto do app). Sem marcar, o contato conta como amigo (pausa).
- O app do Mac passa a mandar, junto da atividade do WhatsApp, com quem era a conversa (a que teve mais mensagens no período, com 2 min de folga dos dois lados). Só o nome da conversa; o texto nunca é lido.
- Banco: `tempo_wa_contacts` ganhou `id`, `tipo_id` e `updated_at`, entrou no carregamento do site, no `tempo_sync_state()` e no gatilho `tempo_touch`. Tipos novos em `tempo_status_options` com kind `wa_tipo` (category `trabalho` ou `pausa`).
- Anotação dos reembolsos: o caminho `[LINK NF]`/`[LINK PAGAMENTO]` virou botão. No app do Mac abre o arquivo (só dentro do iCloud); no navegador copia o caminho.

**V2.04.05 — a aba Contatos WhatsApp não abria**
- A contagem de mensagens lia `tempo_wa_daily`, que o site não carregava: a tela quebrava e o botão da aba parecia morto. Agora a tabela entra no carregamento (e no `tempo_sync_state()`), e as leituras dessas duas tabelas são defensivas.
- Teste novo (`tests/telas.test.js`): a tela de Agências e clientes abre nas três abas com o banco vazio, e o tipo do contato manda no "Conta como". Era o tipo de erro que só aparecia clicando.

**V2.04.06 — contatos do WhatsApp mais completos**
- Coluna "Mensagens enviadas", com dica do período ao passar o mouse (as recebidas não entram na conta).
- Conversa em que ele só recebeu mensagem também entra na lista (com zero enviadas): antes um cliente novo que escreveu primeiro não aparecia para ser classificado. Muda o app do Mac (precisa de ⌘U).
- Renomear o contato no WhatsApp atualiza o nome no Tempo; a classificação continua, porque fica presa à conversa (jid), não ao nome.

**V2.04.07 — Contatos WhatsApp: ordem do WhatsApp, novos e atualização sozinha do app do Mac**
- O app do Mac ainda estava na versão antiga às 11h20 (nenhuma conversa só recebida tinha entrado): o ⌘U não foi feito ou não pegou. Agora o app procura atualização sozinho a cada 15 min, quando o Tulio está parado há 5 min (a troca fecha e reabre o app).
- Ordem padrão da lista = a do WhatsApp: última mensagem (enviada ou recebida) primeiro. Coluna "Última mensagem". Banco: `tempo_wa_contacts.last_at`, que só é gravado quando o app do Mac manda a hora (versão antiga não apaga).
- "Só novos (N)": filtra quem nunca foi classificado. Botão "Marcar N sem tipo como Amigo".
- Aviso "N contato(s) do WhatsApp sem classificar" quando algum fica 3 dias ou mais sem tipo, com botão "Classificar agora" (abre a aba já filtrada). Some sozinho quando todos estiverem classificados.

**V2.04.08 — a atualização do site estava travada desde a V2.04.05 (erro meu)**
- `tempo_wa_daily` entrou no carregamento sem `id` e `created_at`, e a leitura do site ordena toda tabela por esses dois campos. A leitura dela falhava e derrubava a atualização inteira: com dados salvos no aparelho, o site seguia mostrando o retrato antigo, sem aviso. Gravações não foram afetadas (a fila de envio é separada).
- Banco: `tempo_wa_daily` ganhou `id`, `created_at`, `updated_at` e o gatilho `tempo_touch`; as duas tabelas do WhatsApp entraram no `tempo_sync_state()` com a fórmula padrão.
- Site mais resistente: uma tabela que falhar fica de fora e é lida de novo na próxima vez, sem travar as outras (`fetchTables` em `js/auth.js`, `sigLidas` em `js/store.js`).
- Teste novo (`tests/tabelas.test.js`): toda tabela carregada tem `id` e `created_at`, e está no `tempo_sync_state()` do schema.
- **Lição:** ao incluir tabela no carregamento do site, conferir se ela segue o formato das outras (id, created_at, updated_at, gatilho e sincronização). O teste agora pega isso.

**V2.04.09 — tela Contatos (fora de Agências e clientes)**
- Item "Contatos" no menu, logo abaixo de Agências e clientes (`js/view-contacts.js`). Três blocos: Não classificados (com "Marcar N como Amigo"), Trabalho (todos que não são amigo) e Outros (pausa). Em cada bloco, a ordem do WhatsApp.
- Contato de trabalho liga a um cliente; contato do tipo Agência liga a uma agência (coluna "Cliente / agência"). O bloco Trabalho mostra quantos estão sem ligação.
- "Tempo no WhatsApp" por contato, somado do registro de atividade (o app do Mac manda o nome da conversa desde a V2.04.04). Coluna "WhatsApp" em Agências e em Clientes soma o tempo dos contatos ligados a cada um.
- O aviso de contatos sem classificar abre esta tela.

**Decisões do Tulio (16/11, 11h40)**
- Travar mês financeiro fechado: não quer. Item encerrado.
- Compra "May" (R$ 36, 03/10): ignorar. Item encerrado.
- Viagem: conta como férias, de 23/10 a 15/11 (volta ao trabalho em 16/11). Ajustado em Férias e folgas (antes ia até 16/11, o que pausava os avisos de hoje).
- Transferências PJ: as dele mesmo ("Tulio de Azevedo…") já estão como internas. Sobram 28 recebimentos da BRENDA de 09/2024 a 01/2026 sem categoria (R$ 184.600; desde 02/2026 estão como Fee) e um Pix de R$ 200 dele mesmo em 11/09/2026 marcado como externo. Aguardando ele confirmar.
- Extratos já importados até o fim de outubro (conta d660 até 31/10). Falta o OFX de novembro em diante e um PDF de fatura do cartão.

**16/11, 11h45 — "Não consegui salvar (inserir em status_options)" ao abrir**
- O banco só aceitava os kinds work, payment, quote e reimb_*: os tipos de contato (`wa_tipo`) eram recusados a cada abertura. Check ampliado no banco e no schema; os 8 tipos criados no banco reaproveitando os ids que o site já tinha usado (Agência e Amigo), para as classificações feitas não se perderem.
- Teste novo: todo kind de `DEFAULT_STATUS` precisa estar no check do schema.
- 16/11, 11h50: os 28 recebimentos antigos da BRENDA (09/2024 a 01/2026) eram freelas de projetos que ele não sabe separar: categoria "Freelas", marcados como revisados.
- 16/11: Pix de R$ 200 dele mesmo (11/09/2026) marcado como interno. Transferências PJ encerradas.

**V2.04.10 — WhatsApp: sugestões, celular, "Responder" e resposta média**
- Sugestão pelo nome (`waSugestao`): contato cujo nome contém o de um cliente, agência (ou sigla) ou, nos grupos, de um projeto ativo ganha sugestão com botão Aceitar (e "Aceitar N sugestões"). Grupo aceito fica ligado ao projeto (`tempo_wa_contacts.project_id`) e ao cliente dele.
- App do Mac manda a cada 5 min `reportWhatsAppConversas`: por conversa, última mensagem recebida e enviada e tempo médio de resposta (30 dias, até 72 h, sem grupos); e os horários das mensagens enviadas nas últimas 24 h. Só horários e nomes.
- Celular rotula pausas (`waRotularPausas`): pausa de parado/sem motivo com mensagem sua a quem não é de trabalho no mesmo horário vira "WhatsApp". Nunca cria pausa; não mexe em computador fechado, trecho movido nem trabalho.
- "Responder [contato]" no To-Do (`waResponder`): cliente e misto mais cliente após 1 h útil sem resposta, os outros de trabalho após 2 h; horário de trabalho = seg a sex, 9h às 19h, fora das férias. Fecha sozinha quando ele responde. Grupos não geram.
- Colunas novas em Contatos: Sugestão, Resposta média, Esperando você. Aviso diário "Hoje: X no WhatsApp com amigos" ao passar do limite (padrão 30 min, ajustável no bloco Outros).
- Pendente: silenciar o WhatsApp por 90 min no horário mais produtivo — falta o Tulio dizer o que "silenciar" deve fazer.

---

## Épico — Tempo Intelligence: inteligência integral, analista autônomo e assistente conversacional
**Proposta consolidada em 16/11/2026.** Funcionalidade futura, sem alteração do código nesta etapa. O objetivo é transformar o Tempo em um sistema que não apenas registra dados, mas investiga, interpreta, identifica oportunidades e ajuda a tomar decisões.

### 1. Assistente conversacional com dados reais
- Área central **Tempo Intelligence**, com conversa em linguagem natural e acesso contextual aos dados do próprio Tempo.
- Perguntas livres, por exemplo: "Quanto faturei nos últimos 3 meses?", "Qual agência mais atrasou pagamentos?", "Quais projetos deram menor R$/hora?", "Como foi minha produtividade nas manhãs?".
- Responder com números calculados a partir dos registros reais, período explícito, critérios usados e links para abrir os registros/telas de origem.
- Permitir investigação em várias etapas: a IA formula perguntas auxiliares, solicita consultas adicionais ao Tempo, cruza resultados e aprofunda a análise antes de responder. Não ficar limitada a um resumo fixo ou a um único conjunto pré-carregado.
- Guardar histórico de conversas e investigações, com possibilidade de retomar análises anteriores.

### 2. Analista autônomo e proativo
- O GPT pode iniciar análises sem uma pergunta do usuário, formular hipóteses, decidir quais dados precisa consultar e pedir ao Tempo consultas adicionais por ferramentas controladas.
- Identificar padrões, desvios, riscos, oportunidades e tendências; explicar evidências, período, grau de confiança e limitações.
- Gerar relatório diário opcional, relatório semanal operacional e relatório mensal estratégico.
- Acompanhar recomendações anteriores: aceita, recusada ou ignorada; depois verificar se o resultado esperado ocorreu.
- Não confundir correlação com causa. Sinalizar quando os dados não permitem concluir algo.
- Apresentar recomendações acionáveis, com impacto estimado quando possível, e permitir abrir os registros que sustentam cada conclusão.

### 3. Áreas de análise
**Trabalho e negócio**
- Projetos, clientes, agências, contatos, propostas, aprovações, prazos, revisões, horas estimadas x realizadas, faturamento, recebimentos, inadimplência, concentração de receita, ticket médio e rentabilidade.
- Investigar relações entre agência, cliente final, tipo de trabalho, preço, tempo gasto e resultado financeiro.
- Detectar contatos sem vínculo, possíveis duplicidades, projetos sem apontamento, lacunas, propostas sem retorno e cobranças pendentes.

**Finanças PJ e PF**
- Manter PJ e PF separadas por padrão, com análises cruzadas somente quando autorizadas.
- Distinguir receita, transferência interna, retirada, reembolso, despesa e custo; não contar transferências entre contas próprias como receita/despesa.
- Analisar fluxo de caixa, contas a pagar/receber, cartão, parcelas futuras, assinaturas, gastos recorrentes, impostos, saldo e previsões.
- Considerar a estrutura atual de reembolsos: destacar custo líquido e valores a receber do plano, sem inflar receitas e despesas.
- Identificar lançamentos possivelmente duplicados, sem categoria, fora do padrão ou que mereçam conciliação, sempre sugerindo antes de alterar.

**Produtividade e rotina**
- Analisar tempo total, produtivo, pausado e não produtivo conforme as classificações já existentes no Tempo.
- Cruzar produtividade por horário, dia da semana, projeto, tipo de atividade e categoria de aplicativo; identificar interrupções, dispersão, lacunas e padrões recorrentes.
- Separar taxa de produtividade, aproveitamento do tempo e entrega efetiva. Tempo em aplicativo classificado como produtivo não comprova, sozinho, resultado entregue.
- Descobrir os horários de maior rendimento a partir dos dados reais, sem assumir previamente que manhã ou tarde é melhor.
- Sugerir experiências de rotina (por exemplo, proteger blocos de criação e concentrar mensagens/administrativo em horários menos produtivos) e comparar os resultados antes/depois.

**Melhoria do próprio Tempo**
- Observar fluxos repetitivos, tarefas manuais, telas pouco usadas, correções recorrentes e ações que poderiam ser automatizadas.
- Sugerir novas funcionalidades, simplificações e automações com justificativa baseada no uso real.
- Encaminhar ideias para uma seção própria do backlog, sem implementar mudanças no aplicativo por conta própria.

### 4. Tempo Inteligente: sugestões e automações
- Detectar novos contatos e sugerir vínculo com agência, cliente ou projeto, usando nome, histórico e contexto disponível.
- Sugerir classificação de contatos e conversas do WhatsApp, vínculo de tempo a projetos, preenchimento de lacunas e identificação de revisões.
- Sugerir conciliação entre extratos, pagamentos, parcelas, notas, reembolsos e contas a pagar/receber.
- Detectar anomalias e avisar sobre prazos, projetos próximos do limite de horas, queda de R$/hora, concentração de receita e pagamentos atrasados.
- Cada sugestão deve mostrar motivo, dados que a sustentam, confiança e impacto esperado, com ações **Aceitar**, **Editar**, **Ignorar** ou **Adiar**, quando aplicável.
- Registrar permanentemente a sugestão e a decisão no histórico. Evitar repetir sugestões já resolvidas.

### 5. Integração com Siri e Atalhos da Apple
- Evoluir o atalho/link de início já previsto no item S17 para uma integração consistente com **Siri, app Atalhos e App Intents**, quando aplicável à arquitetura do app.
- Comandos de voz para iniciar, pausar, retomar, encerrar e trocar a sessão; selecionar projeto, cliente ou tipo de trabalho; consultar a sessão atual e o tempo registrado hoje.
- Exemplos: "E aí Siri, iniciar Tempo no projeto X"; "Pausar meu Tempo"; "Quanto trabalhei hoje?"; "Qual é minha próxima tarefa?".
- Permitir ações rápidas sem abrir a interface, respeitando autenticação, estado da sessão e confirmação quando houver ambiguidade.
- Criar atalhos configuráveis pelo usuário para registrar tarefa/to-do, adicionar anotação rápida e abrir um relatório ou projeto.
- Considerar limitações e diferenças entre iPhone e macOS; oferecer fallback por link universal/URL scheme quando App Intents não estiver disponível.

### 6. Integração com Alexa
- Criar uma **Skill do Tempo** para Alexa, com vinculação segura da conta (account linking/OAuth) e comunicação com uma API do Tempo autenticada.
- Comandos de voz para iniciar, pausar, retomar, encerrar e trocar sessões; consultar projeto atual, horas do dia/semana, tarefas e avisos pendentes.
- Exemplos: "Alexa, peça ao Tempo para iniciar o projeto X"; "Alexa, quanto trabalhei hoje?"; "Alexa, quais são minhas tarefas pendentes?".
- Permitir consultas ao Tempo Intelligence por voz, com respostas curtas e opção de aprofundar pelo app ou por novas perguntas.
- Definir permissões por intenção: consultas não alteram dados; comandos que iniciam/encerram sessões ou criam registros exigem validação do contexto e confirmação quando necessário.
- Avaliar disponibilidade regional/idioma da Alexa, requisitos de publicação da Skill e dependência de conexão com a internet. Não presumir suporte a todos os dispositivos ou idiomas.


#### To-do por voz: criar, organizar e consultar tarefas (Siri e Alexa)
- Criar tarefas por comando de voz, com título e, quando informado, prazo, horário, prioridade, observação e vínculo com projeto, cliente ou agência.
- Exemplos: "Adicionar tarefa: enviar orçamento para Brenda"; "Criar tarefa para amanhã às 10h: finalizar animação"; "Cobrar pagamento do projeto X".
- Interpretar a frase e extrair os campos automaticamente. Se houver ambiguidade relevante, como mais de um projeto com nome parecido, perguntar antes de salvar.
- Consultar tarefas: listar as de hoje, atrasadas, próximas tarefas e tarefas de um projeto específico.
- Atualizar tarefas por voz: marcar como concluída, alterar prazo, prioridade ou descrição; confirmar quando a identificação da tarefa não for inequívoca.
- Usar a lista To-do já existente no Tempo como fonte única. Siri e Alexa não devem criar listas paralelas nem duplicar tarefas.
- Permitir captura rápida sem abrir o app, respeitando autenticação, permissões e confirmação para alterações ambíguas.

### 7. Arquitetura da IA e segurança
- Usar **API oficial da OpenAI (GPT)** para o Tempo Intelligence; não usar API da Anthropic/Claude para esse recurso.
- A assinatura do ChatGPT não inclui créditos da API: prever faturamento, limites e monitoramento próprios da API OpenAI.
- Chave da API exclusivamente no backend/servidor; nunca embutida no JavaScript, app de Mac, PWA ou repositório.
- O GPT não recebe acesso irrestrito ao banco e não executa SQL livre. O Tempo oferece ferramentas de consulta com escopo, filtros, limites e permissões definidos.
- Fluxo: pergunta/hipótese do GPT → solicitação de consulta estruturada → validação e execução pelo Tempo → retorno dos dados necessários → análise do GPT → resposta ou nova consulta.
- Cálculos determinísticos, somas, agrupamentos e métricas simples devem ser feitos localmente pelo Tempo; usar GPT para interpretação, hipóteses, linguagem natural e análises que agreguem valor.
- Separação rigorosa de dados por usuário e por domínio PF/PJ. Dados sensíveis só entram em análises autorizadas.
- A IA pode investigar e recomendar com autonomia, mas não pode apagar dados, alterar históricos, editar lançamentos financeiros, enviar cobranças ou executar ações irreversíveis sem confirmação explícita.
- Registrar consultas, ações propostas, aprovações e resultados para auditoria.

### 8. Controle de custos e desempenho
- Agregar e resumir dados no Tempo antes de enviar à API; enviar apenas o necessário para cada pergunta.
- Evitar reenviar histórico inteiro e repetir análises sem mudança relevante nos dados.
- Cache de resultados, deduplicação de consultas e análises agendadas com frequência configurável.
- Escolher modelo conforme complexidade: modelo econômico para classificação/resumo simples e modelo mais capaz para investigações complexas.
- Definir orçamento mensal, alertas de consumo, limite por usuário e painel de uso/custo por recurso.
- Permitir desligar análises automáticas e controlar quais áreas podem ser analisadas.

### 9. Relatórios e memória de decisões
- Diário opcional: resumo do dia, horas, projetos, pendências e alertas importantes.
- Semanal: produtividade, andamento dos projetos, prazos, contatos, financeiro e prioridades da próxima semana.
- Mensal: visão estratégica do negócio, rentabilidade, fluxo de caixa, concentração de receita, tendências e comparação histórica.
- Cada recomendação deve manter: data, pergunta/hipótese, consultas realizadas, evidências, conclusão, confiança, ação sugerida, decisão do usuário e resultado observado.
- Permitir configurar horário, frequência, áreas incluídas e entrega dentro do app; notificações externas poderão ser avaliadas depois.

### 10. Sequência sugerida de implementação
1. Infraestrutura da API OpenAI no backend, autenticação, ferramentas de consulta controladas, logs e controle de custos.
2. Assistente conversacional que responde com dados reais e consegue pedir consultas adicionais.
3. Relatórios automáticos e analista proativo, com histórico de investigações e recomendações.
4. Análise de produtividade e rotina, com hipóteses e experimentos mensuráveis.
5. Inteligência financeira PF/PJ, conciliação e previsões, respeitando as separações.
6. Tempo Inteligente: sugestões contextuais e automações com fila de aprovação.
7. Integração Siri/Atalhos/App Intents.
8. Skill Alexa com vinculação de conta e comandos de voz.
9. Análise de uso do próprio Tempo e sugestões de evolução do produto.

**Escopo desta entrada:** registrar o épico no backlog. Não altera código, banco, configurações, integrações ou comportamento do aplicativo. Todos os itens acima permanecem como proposta/backlog até priorização e implementação.

**V2.04.11 — encerrar corta o ócio do fim; sugestões com aceitar/negar; "Responder" desligado**
- Encerrar (`stopPlan` / `stopEntryAsk` em `js/domain.js`): a sessão termina no começo da última parada grande (mais de 15 min), atravessando pausas. Parada = tudo que não é atividade de programa dentro da sessão (pausa, ocioso, WhatsApp e apps de pausa). Uso de programa no meio da parada: até 5% e menos de 5 min → ignorado e cortado junto; 5 min ou mais (ainda até 5%) → pergunta, com a opção de cortar depois desse uso. Antes, 10 s no Claude antes do clique em encerrar salvavam toda a parada.
- Contatos: botão "Analisar N sugestões" abre uma lista com Aceitar e Negar em cada uma e "Aplicar". Negada não volta (setting `waSugNegadas`, por contato).
- "Responder [contato]" desligado a pedido do Tulio (não funcionou bem: muitos números sem nome). As tarefas já criadas ficam para apagar.
- Link da Anotação vira caixinha igual às outras tags, com ícone de documento.

**V2.04.12 — To-do**
- Clicar no to-do (ou no chip do projeto/cliente) abre a janela "Editar to-do": tarefa, dia, hora, fim, "é prazo", projeto ou cliente, estimativa, alarme e anotação; Excluir. A ligação escolhida ali não é refeita pelo texto (`data.link_manual`).
- Concluídas hoje ficam no fim da lista, riscadas, no painel da tela inicial e na aba Hoje; no dia seguinte saem do painel (continuam no To-do).
- Aba "Todas": por dia (dia marcado ou, sem dia, o da criação), com "X abertas · Y concluídas · Z atrasadas"; abre e fecha com um clique; hoje começa aberto.
- Relatório à direita da página To-do: Semana / Mês / Ano até hoje, "Não contar fim de semana"; concluídas, média por dia, atrasadas, adiadas (e quantas vezes), criadas, % no prazo e barras de concluídas por dia (ou por mês no ano).

**V2.04.13 — Produtividade: gráfico e Comparações**
- Gráficos de produtividade menos arredondados (cantos de 2–4 px, como as outras barras) e em tons pastel (verde #9FD6AE, vermelho #EFAFAF, amarelo #EED9A0), nas colunas do relatório e na barrinha da sessão e do Resumo.
- Comparações refeitas: primeiro um resumo em palavras (quanto trabalhou, contra o mesmo ponto da semana e do mês passados, % de trabalho de verdade e o que mudou); depois dois cartões, Semana e Mês, com linhas "▲ mais / ▼ menos" contra o mesmo ponto do período passado, o período passado inteiro, a média e o mesmo mês do ano passado; e o mês a mês em barras. Médias não contam os dias de férias. Saíram a tabela de trimestres e os textos técnicos (pp, Δ).

**Para fazer (combinado por voz em 16/11)**
- Modo foco (pedido por voz, 16/11): é o Tulio quem liga, quando quiser, num botão "Ativar foco" na tela inicial e na barra de menu do Mac; escolhe 90 min ou outro tempo. Durante o foco o Tempo esconde o WhatsApp no Mac e, se ele abrir, pergunta "Você está no foco, abrir mesmo assim?" (não tira o acesso). Mensagem de cliente avisa mesmo no foco.
  - Mesma pergunta para os outros apps e sites de distração (Telegram, Mensagens e os sites que já contam como pausa, ex.: Instagram e YouTube no Chrome).
  - Ao ligar o foco, ativar o "Não perturbe" do Mac e, por um atalho, o foco do iPhone. O resto dos avisos do Tempo continua normal.
- Cruzar contatos com projetos: somar o tempo de WhatsApp com cada cliente às horas do projeto, para ver quanto custa atender cada um e se o preço cobre.

**V2.04.14 — Dentista nos reembolsos**
- Comprovantes da dentista do Rafa entram na linha "Dentista", vindos de "Cristiana da Fonte (Dentista Rafa)" ou de "CrescerOdonto Dentista" (app do Mac e site). Ela não passa nota nem tem reembolso: linhas Dentista de out e nov marcadas "Não se aplica" em Reembolso e Requerimento (repete nos meses novos).
- Nome da conversa agora é comparado sem diferença de maiúsculas, acentos, espaços e marcas invisíveis do WhatsApp, no Mac e no site.

**V2.04.15 — notas e comprovantes: nome novo e link abre o Finder**
- Arquivos em iCloud/Terapias/AAAA_MM passam a se chamar NomeDaTerapia_AAAA_MM_Nota.ext ou NomeDaTerapia_AAAA_MM_Comprovante.ext (extensão do arquivo original). O app do Mac renomeia os antigos (NotaFiscal_…/Comprovante_…) ao abrir, sem sobrescrever; as Anotações dos reembolsos foram atualizadas no banco.
- O link na Anotação abre o Finder com o arquivo selecionado (antes abria o arquivo). Link antigo ainda funciona; se o arquivo sumiu, abre a pasta do mês.

**V2.04.16 — nota em PDF ganha cópia em JPG**
- Todo PDF salvo em iCloud/Terapias ganha ao lado uma cópia em JPG com o mesmo nome (primeira página, ~180 dpi). O app do Mac também cria o JPG dos PDFs que já estavam lá. O link continua abrindo o Finder na pasta, com os dois arquivos.

## Passagem para a conversa APP TEMPO [V2.05.00] (16/11/2026)
Estado ao fim da conversa V2.04 (site em V2.04.16). Detalhes de cada versão nas seções "V2.04.xx" acima.

**Como as coisas estão**
- Um app do Mac só: o Swift (`~/Applications/Tempo.app`, código em `mac/`), com WhatsApp, notas/comprovantes, iCloud, lembretes e atualização sozinha (ao abrir e a cada 15 min se ele estiver parado há 5 min). O GitHub compila o app a cada mudança em `mac/`. O app em Python (`/Applications/Tempo.app`, pasta `~/tempo-build`) ainda existe, fechado; aposentar depois de conferir os itens abaixo.
- Banco: `tempo_wa_contacts` (tipo, cliente/agência/projeto, última msg, recebida/enviada, resposta média) e `tempo_wa_daily` entram no carregamento do site e no `tempo_sync_state()`. Toda tabela carregada precisa de id, created_at e updated_at (teste `tests/tabelas.test.js`); todo kind de status precisa estar no check do banco.
- Testes: 45, em `tests/` (rodar `node --test tests/*.test.js`).

**Feito na V2.04** WhatsApp (tela Contatos com blocos, tipos, sugestão pelo nome com Aceitar/Negar, ligação a cliente/agência/projeto, tempo por contato e por cliente, celular rotulando pausas, resposta média, alerta de amigos); encerrar corta o ócio do fim; To-do (janela de edição, Todas por dia, relatório, concluídas riscadas); Comparações e gráficos de produtividade; notas em foto; dentista; nomes Terapia_AAAA_MM_Tipo.ext e link que abre o Finder; correção da atualização do site que travava.

**Pendências, por ordem**
1. ~~Apagar as 28 tarefas "Responder …"~~ (feito em 16/11, V2.05).
2. ~~Conferir no Mac~~ (16/11, V2.05: o ~/APPTEMPO estava parado na V2.04.10; depois de rodar o update.sh, arquivos renomeados, JPG das notas, nota da Raquel e comprovante da dentista ok; app em Python aposentado, `~/tempo-build` esvaziada). Falta o Tulio confirmar o link que abre o Finder e o alarme de to-do virando lembrete.
3. ~~Pausa ao abrir o app quando o cronômetro ficou rodando sem atividade~~ (V2.05.01: o app grava o último uso uma vez por minuto e, ao abrir, manda o intervalo parado como pausa; "sono" se o Mac dormiu ou foi ligado nesse meio-tempo).
   - V2.05.02: coluna "Arquivos" em Reembolsos (campo `files` jsonb: tipo nota/comprovante + caminho); a Anotação fica só com o texto do Tulio. Os [LINK NF]/[LINK PAGAMENTO] antigos foram movidos da anotação para `files`.
   - Também na V2.05.01: menu "Reler notas dos últimos 3 meses" na barra do Mac (relê mesmo o que está no registro e salva no iCloud o que faltar; no site, item já lançado não gera aviso, só ganha o link na linha de Reembolsos).
4. ~~Modo foco~~ (V2.05.06: `js/foco.js` + `mac/Sources/TempoMac/Foco.swift`. Cartão na tela inicial e item "Ativar foco" na barra do Mac (30/60/90/120 min); estado em `tempo_settings` 'foco', histórico em 'focoLog'. Mac esconde os apps de "Apps que pausam" e pergunta ao abrir; sites de "Sites que pausam" no navegador também perguntam; "Abrir mesmo assim" libera 10 min e conta como abertura. Não perturbe pelos atalhos "Tempo Foco" e "Tempo Fim do Foco" do app Atalhos (o Tulio cria); iPhone acompanha se o foco for compartilhado entre dispositivos. Cliente/agência avisa por notificação do Tempo; WhatsApp lido a cada 1 min no foco. Falta testar no Mac.)
- V2.05.07: WhatsApp de amigo (e outros apps/sites de distração) vira pausa a partir de 10 s, não mais 1 min; a maior parte do uso eram espiadas de 20 a 50 s que contavam como trabalho. Pausa abaixo de 1 min entra sem aviso na tela.
- V2.05.08: WhatsApp separado nos gráficos e faixas: "WhatsApp Cliente" (contato de trabalho, verde pastel #47BD86, liso) e "WhatsApp Distração" (verde claro #6cf1ae, listrado nas pausas). `toolName`/`waToolName` em `js/activity.js`. Modo foco virou botão "Modo foco" ao lado do "Iniciar registro" (pergunta 30/60/90/120 ou outro); saiu o cartão grande, o "Iniciar registro" repetido do topo da tela inicial e o botão de setinha da barra de cima (sem sessão).
- V2.05.09: WhatsApp de trabalho fora do cronômetro entra no projeto (`js/wa-projetos.js`): grupo ligado ao projeto vai direto; contato de cliente/agência vai para o projeto daquele cliente trabalhado por último (até 14 dias antes, senão o primeiro depois); dentro de sessão não conta de novo. Projeto: cartão "WhatsApp" e R$/hora com WhatsApp; colunas "WhatsApp" e "R$/hora c/ WhatsApp" na lista (ocultas por padrão). Limpeza: saíram 8 funções sem uso (waResponder e o teste dele, stopCutAt, clientFromPath, longDate, prodDowDays, logEditField, exCatOptions, valOf). Doc "Ideias organizadas": "Próxima conversa" atualizada para V2.06.00. Tela inicial: "Modo foco" + "Iniciar registro" voltam ao topo (lado a lado), além dos botões do cartão.
- V2.06.02: (publica o V2.05.09 depois do ícone novo) pausa de app (WhatsApp de amigo etc.) entra já aplicada, sem piscar o cartão "pausa sugerida" com Aceitar/Ignorar.
- V2.06.28: "loginwindow" (tela de bloqueio do macOS) aparece como "Mac bloqueado" no registro e conta como pausa, nunca como trabalho.
- V2.06.27: Contato da proposta ligado à aba Contatos (calc.proposta.contatoId): lápis ao lado do campo abre a busca nos contatos salvos, telefone e e-mail editáveis e opção de ligar o contato ao cliente da proposta; sugestão do WhatsApp já liga; etiqueta "ligado a Contatos".
- V2.06.26: prazo pedido de cada entrega já vem com os dias úteis previstos pela montagem (sem urgência até você mexer) e a data de entrega correspondente (hoje + dias úteis, `dataAposDiasUteis`); mudar os dias muda a data e vice-versa; campo de data menor. Com prazo pedido, as condições do PDF dizem "Entrega até DD/MM" e a agenda usa essa data.
- V2.06.25: Contato da proposta sugere nomes enquanto digita: contatos do WhatsApp (telefone pelo número da conversa) e do Gmail (`api/gmail/contatos.js`, só cabeçalhos From/To/Cc); escolher preenche nome, telefone e e-mail (calc.proposta.contatoTel/contatoEmail), mostrados embaixo do campo.
- V2.06.24: "Contato" no topo da proposta, ao lado do Cliente (vem do cadastro do cliente; editado aqui ou na tela do PDF, os dois ficam iguais: calc.proposta.contato).
- V2.06.23: orçamento em horas fechadas: cada etapa (com qtd, duração e complexidade) arredonda para cima, reuniões inteiras, campos de horas com passo 1 e textos em "42 h" no lugar de "42:00".
- V2.06.22: prazo pedido e desconto por entrega (no fim de cada entrega: dias úteis ou data → dias úteis até lá, `diasUteisAte`; urgência própria = fechado da entrega ÷ pedido, teto 2×; desconto em R$ ou %); o painel virou "Desconto geral, pagamento e rodadas" (desconto geral sobre tudo, depois dos das entregas). Terceirizado em paralelo agora tem campo de valor. Valor do terceirizado aparece na coluna Valor e passa a contar (era lido como texto e virava 0).
- V2.06.21: modelos de orçamento — na proposta só os favoritos aparecem como botões + "Outros…", que abre a janela de modelos (`js/modelos.js`): clicar usa, ★ favorita ('modelosFav'), lápis edita, lixeira apaga ('modelosOcultos' para os prontos; "Restaurar os prontos apagados"), "Criar novo" do zero. Editor de modelo: nome, "É vídeo", etapas com tipo, qtd, horas (ou R$ no terceirizado), dias, aprovação, paralelo, terceirizado, setas para reordenar. Editar um pronto grava a versão sua por cima ('modelosProprios').
- V2.06.20: PDF da proposta — caixinhas "Terceirizados" (separa o valor dos terceirizados do seu em cada entrega), "Separar etapas" (entrega com subtotal e etapas embaixo) e "Imposto" (itens sem imposto + subtotal, imposto e total no fim); itens agora são por entrega por padrão (`propItens(x, sep)`, níveis). Ao aprovar, abre "Previsão de pagamento" com as parcelas pela condição escolhida (datas pela agenda; editáveis) — ficam em 'previsoes' (`js/previsoes.js`), entram na previsão de entradas do Financeiro e no projeto viram pagamento com "Recebido". Na proposta, "projeto" virou "entrega" (cada entrega vira um projeto ao aprovar).
- V2.06.19: orçamento — coluna Qtd por etapa (multiplica horas e terceirizado; PDF mostra R$/und × und); condições de pagamento (100% no final, 50+50, 3 parcelas, mensal; texto no PDF); "Incluir datas na proposta" (início e entrega pela agenda do Planejamento); "Na agenda" no resumo (quando cabe e o efeito de aprovar também os orçamentos em aberto); histórico de versões com Abrir (Mac abre arquivos da pasta do Dropbox); Duplicar proposta; Salvar projeto como modelo (modelos próprios em 'modelosProprios', apagáveis); média real por etapa discreta (bolinha ≈ no campo de horas, só com 2+ projetos concluídos e diferença ≥ 1 h); condições do PDF por projeto (projetos iguais juntos, ex.: "Motion 2D (2 vídeos)") com prazo de cada um e prazo total; follow-up de orçamento ignora Rascunho e cria 2ª cobrança aos 15 dias; projeto mostra a hora orçada × a real (margem ao vivo); "Montar pelo texto" com o Claude (chave da API em Ajustes › Claude; `escopoPorTexto`). Grade das etapas corrigida (quebrava com a coluna Terc.).
- V2.06.18: proposta — "Clonar projeto" ao lado de "+ Projeto" (escolhe qual, copia etapas/horas/prazos/terceirizados logo depois do original) e setas ↑↓ no cabeçalho de cada projeto para mudar a ordem (vale para o PDF e para os projetos criados).
- V2.06.17: modelo "Tradução de vídeo" (Tradução e Locução terceirizadas, Adaptação Estática e Animada 4 h/2 dias). Checkbox "Terc." por etapa: conta prazo, não conta horas; pede o valor pago (entra no terceirizado, sem multiplicar). Duração do vídeo por projeto de vídeo (cada um com a sua; não multiplica identidade nem terceirizado). "Converter para outra moeda" (dólar, euro, libra pela cotação do dia via AwesomeAPI; tela e PDF convertidos, por dentro continua em reais; `st.moeda`). Arquivo: NÚMERO+versão_AGÊNCIA_CLIENTE_ANOMÊSDIA tudo junto (1021_BRENDA_BEMBRASIL_2026NOV17); alterar depois de salvo gera versão: o original vira 1021A (renomeado no Mac, `pdfRenomear`) e a nova 1021B, depois C… (`propVersionar`, assinatura do conteúdo do PDF).
- V2.06.16: proposta ganha "Texto da proposta" no formulário (Cliente, Contato, Descrição, Condições, já preenchidos e editáveis; só o editado fica em calc.proposta). Ao salvar, ganha número (a partir de 1021; 'propostaNum') e o app do Mac grava o PDF calado em ~/BAQUER Dropbox/Tulio Couceiro/_TULIO COUCEIRO LTDA/_ADMIN/Orçamento ('propostaPasta'), nome NÚMERO_Agência_Cliente_ANO_MÊS (cliente direto sem agência). Mac: PDFExport aceita pasta absoluta (dir) e abrir=false.
- V2.06.15: proposta com vários projetos (`st.grupos`, etapa com `grp`): cada modelo adicionado vira um projeto (Identidade, Manual, Vídeo 2D…), com nome editável, horas e valor próprios; "+ Projeto" cria um vazio; ao aprovar cria um projeto no app por grupo (valor e horas proporcionais, tarefas das etapas). Etapas reordenáveis arrastando pela alça (também entre projetos). "Paral." é checkbox: etapa em paralelo não conta horas nem prazo e fica junto com a de cima. Duração do vídeo vale só para os projetos de vídeo. PDF lista um item por projeto quando há mais de um.
- V2.06.14: proposta — "Data da proposta" (hoje por padrão) e "Validade" em dias (30 por padrão; grava valid_until e entra no texto do PDF); imposto por dentro marcado por padrão; botão "Criar PDF da proposta" sempre visível (salva antes); mais de um modelo por proposta: ao clicar outro modelo pergunta "Adicionar" ou "Apagar e substituir"; clicar num modelo já usado tira as etapas dele (`st.modelos`, `escolhaBox` em ui.js); duas colunas viram uma em janela estreita.
- V2.06.13: proposta com calculadora em duas colunas: formulário mais compacto à esquerda e "Resumo" fixo à direita (acompanha o scroll, total no topo, composição, parecidos e total final), atualizando enquanto digita; "Modelo" no topo do bloco de horas.
- V2.06.12: resumo da calculadora com a linha do total contínua. Tela nova "Planejamento" (etapa 1, `js/planejamento.js`): horas que faltam (estimado − real) dos projetos ativos distribuídas por prazo na semana, até 8 h por dia útil, 9h–19h com almoço 12h–14h e segunda 11h30–14h (Rafa); feriados e férias fora; esticar/encurtar o dia (+/−, 'planoDias'); bloqueios avulsos ('planoBloqueios'); aviso do que não cabe no prazo; "Hoje: planejado × feito". Falta: arrastar blocos, Google Agenda, jantar/noites com o Rafa, melhor horário por tipo.
- V2.06.11: cliente/agência ganha "Relatório do mês" em PDF (horas por projeto e tarefa, entregas e rodadas reenviadas, sem valores; `js/relatorio-cliente.js`), no visual da proposta; no Mac salva em iCloud/Tempo/Clientes.
- V2.06.10: duração do vídeo só aparece e só conta nos modelos Motion 2D/3D (horas do modelo são por minuto). Financeiro PJ: painel "Para o contador" (entradas do mês no extrato, de quem, projetos pagos sem nota, botão copiar resumo). Relatório Produtividade: seção WhatsApp (com quem, trabalho × amigos por dia, horários, clientes que mais chamam) no período escolhido.
- V2.06.09: proposta mostra a média de projetos/propostas parecidos (comparar antes de mandar); projeto ganha "Orçado × realizado" por etapa (lê "Estimado: X h" das tarefas); Orçamentos ganha "Taxa de aprovação" por tipo/modelo e por cliente com média de aprovados × recusados; fee mensal mostra a sua hora no fee e se cobre as horas pela hora base.
- V2.06.08: "Aprovações" virou "Reuniões de aprovação" (quantidade × horas por reunião, padrão 1 h) e o total mostra etapas + reuniões separados.
- V2.06.07: proposta — cliente por campo de busca (dropdown com busca, "+" ao lado cadastra); modelos na calculadora (Identidade visual 34 h/12 dias, Manual 16 h/5, Motion 2D 42 h/21 dias por min, Motion 3D 62 h por min; `MODELOS` em `js/orcamento.js`) com coluna de dias úteis por etapa, prazo fechado e provável (+40% de ajuste nas etapas com aprovação); tarefas criadas levam horas e prazo. Proposta em PDF (`js/proposta.js`) no visual dos orçamentos dele (DM Mono, data vermelha, itens entre linhas vermelhas, condições, assinatura `icons/assinatura.png`, rodapé em 'propostaRodape', numeração 'propostaNum' a partir de 1021): tela com edição e prévia; no Mac salva em iCloud/Tempo/Propostas e abre.
- V2.06.06: "Nova proposta" abre com a calculadora dentro (nome, cliente, status, datas + valor-hora, horas, prazo, desconto, NF/BV/terceirizado, total); botão "Orçamento simplificado" no topo volta ao formulário curto (valor e horas). Proposta antiga sem a calculadora nova abre no simplificado. Ao salvar como aprovada (ou "Converter em projeto"), cria o projeto com uma tarefa por etapa (tipo de trabalho e horas estimadas nas notas) + "Reuniões e aprovações". Saiu o botão separado "Calculadora".
- V2.06.05: calculadora completa (conta da seção 5 do doc, em `js/orcamento.js`): duração do vídeo (mín. 30 s) × complexidade (1 / 1,3 / 1,7) + 1 h por aprovação; × hora × porte × mercado; urgência = prazo fechado ÷ pedido (teto 2×); desconto em R$ ou %; total digitado ajusta só a minha parte; total das etapas redistribui na proporção; valor por etapa e "sua hora neste orçamento". Saíram contingência e margem. WhatsApp: colunas "Mensagens/semana" e "Fora do horário" em Contatos (`msgs_7d`, `fora_30d`, lidos pelo app do Mac). A trava de sessões sobrepostas (tempo_time_claims) já estava aplicada.
- V2.06.04: calculadora com os multiplicadores combinados em out/2026: hora base (R$ 200) × porte (pequeno 0,85 / médio 1,15 / grande 1,5) × mercado (local/Recife 1 / nacional 1,5 / internacional 2,5), todos ajustáveis e salvos em `tempo_settings` 'precoBase'; escolher o cliente lembra porte e mercado dele ('clientePreco'); "Outro valor-hora" ignora os multiplicadores. Saiu o valor-hora fixo por perfil ('rates', nunca salvo).
- V2.06.03: calculadora de preços — valores digitados sumiam no app do Mac (Safari não dispara "change" em campo de dinheiro). Agora o estado lê no "input": resumo, total e botão atualizam enquanto digita; valor-hora salva nas preferências.
- V2.06.01: ícone novo do Tempo (relógio azul em quadrado branco) no site, atalho do celular, favicon e app do Mac.
5. ~~Tempo de WhatsApp com cada cliente~~ (V2.05.09) somado às horas do projeto.
6. Supabase: proteção contra senha vazada (só o Tulio) e decidir sobre as tabelas antigas (backup_* e gpt_old_*).
7. Limpeza do código das telas.
8. OFX do Nubank de novembro em diante e PDF da fatura (aguardando arquivos).
9. Doc "APP TEMPO — Ideias organizadas": a seção "Próxima conversa" está desatualizada (vários itens feitos na V2.04).

**V2.05.03 — Análises (relatórios com gráficos e PDF)**
- Aba "Análises" (menu, depois de Metas; `js/view-analises.js`): abas Semana, Mês, 3 meses, 6 meses e Ano, com histórico. Lê `tempo_settings`: prodSemanal:AAAA-MM-DD, prodMensal:AAAA-MM, relTrimestral:AAAA-Tn, relSemestral:AAAA-Sn, relAnual:AAAA. Formato documentado no topo do arquivo (resumo, kpis, graficos colunas/linha/barras em SVG, secoes, comparacoes, sugestoes, acompanhamento, metas, ideias_tempo). Análises antigas (só "numeros") continuam aparecendo.
- PDF: botão gera A4 com capa; no app do Mac (`mac/Sources/TempoMac/PDFExport.swift`, mensagem `pdf`) salva em iCloud Drive/Tempo/Análises e abre; no navegador abre a janela de imprimir.
- Tarefas agendadas (Opus, só leitura no banco, gravam uma chave): semanal (seg 7h13), mensal (dia 1 7h20), trimestral (1/jan, abr, jul, out 7h27), semestral (1/jan e 1/jul 7h34), anual (1/jan 7h41). Juntam produtividade com as áreas do épico Tempo Intelligence (negócio, inadimplência, finanças PJ/PF separadas, reembolsos, WhatsApp, acompanhamento das sugestões anteriores). O épico deixa de usar API da OpenAI: análise fica nas tarefas agendadas do Claude.
- Reembolsos: links com acento (Patrícia) não duplicam mais (compara em NFC).
- Regras comuns das análises ficam no banco: `tempo_settings` chave `analiseGuia` (value.texto). Cada tarefa agendada só tem período, chave e foco, e lê o guia primeiro. Para corrigir uma regra, atualize só essa linha. Atenção: classificação do WhatsApp é `tempo_wa_contacts.tipo_id` (a coluna `tipo` é antiga); no extrato, PJ/PF é `entity`/`biz_entity` e `scope` é externa/interna/cartao.
- V2.05.05: Reembolsos, "Falta você requerer" só conta requerimento "a Fazer"/"Falta Nota" ("Refeito…" é requerido); "Não se aplica" só passa pela etapa de pagar.
- V2.05.04: gráficos com reais curtos ("R$ 32,8 mil") e rótulos de barra mais largos.

**Lição desta conversa:** mudança no banco (tabela nova, coluna, tipo de status) precisa ir junto no schema, no carregamento do site e na sincronização; uma tabela fora do formato travou a atualização do site inteiro sem aviso.

- V2.06.29: Mac bloqueado (loginwindow) vira pausa sozinha e nunca conta como trabalho; "Ajustar automaticamente" tira bloqueios ao salvar intervalo.
- V2.06.30: bloqueio aparece como "Tela bloqueada"; sessões antigas corrigidas.
- V2.06.31: tempo sem nenhum registro do computador (2 min+) vira pausa sozinha ("Sem registro"); retroativo desde 16/11.
- V2.06.32: janela única para projeto/cliente/agência, com o timesheet completo (mesma barra do Resumo) embutido.
- V2.06.33: pausa por falta de registro e bloqueio também leem a lixeira do log; correção retroativa desde 19/10 (só onde o log existe).
- V2.06.34: setinha dos grupos abre a lista; caminho no Editar sessão com links (agência, cliente, projeto, tarefa).
- V2.06.35: faixa do timesheet troca entre por tarefa, por projeto e por cliente.
- V2.06.36: chaves "Mostrar alternância em outro projeto" e "Esconder pausas" (ambas desligadas por padrão).
- V2.06.37: prazo rápido — "Hoje", "Amanhã" e "em X dias" no Editar to-do; "em X dias" (dias corridos) também no prazo do projeto (cadastro e detalhe) e das tarefas (`emDiasHTML` em js/ui.js, bloco dentro de `data-dias-wrap`). "Esconder pausas" também tira as pausas do Log e o bloco "Pausas" do Editar sessão. To-do: "adiado Nx" conta toda troca de data para um dia depois (vencida ou não; trazer para antes não conta).
- V2.06.38: seletor do Iniciar registro com "+ Nova agência / Novo cliente / Novo projeto / Nova tarefa / Nova subtarefa" no topo de cada coluna (`pkNovoBtn`/`pkNovo`); só clicável com o nível anterior escolhido, senão avisa o que falta. "Esconder pausas/tempo ocioso" também tira o "Não especificado" (faixas e chip). Editar sessão: chaves novas "Aglomerar" (um bloco por programa/arquivo) e "Corrido" (sem os espaços parados), desligadas por padrão (`actStripJuntoHTML`, `actToggleClick`). Pausa "Sem registro" não se perde mais quando outra pausa (sono) entrou antes dela: `suggestPause` usa o maior trecho trabalhado do período, não o início do último intervalo.
- V2.06.39: WhatsApp com contato/grupo de trabalho entra nas faixas e chips de programa e arquivo da sessão (`actWaTrabalho` em actList); antes contava como trabalho mas aparecia como "Não especificado". Tela bloqueada vira pausa a partir de 10 s (antes, só com 2 min ou mais). Sessão de 18/11 corrigida no banco (8h14–8h24 sem registro e 10h09 tela bloqueada viraram pausa).
- V2.06.40: revisão das pausas pelo registro do computador (`js/pausas.js`): fonte única do "tempo parado". Todo tempo da sessão sem trabalho registrado vira pausa ("Sem registro" com 2 min ou mais; tela bloqueada e apps de pausa a partir de 10 s, com o motivo; WhatsApp de trabalho é trabalho). Roda no app do Mac a cada registro, a cada minuto e ao abrir; só acrescenta pausas; cada trecho é revisto uma vez (`tempo_settings.pausasAte`), para não desfazer correção manual; retroativo desde 16/11; reunião e sessão sem registro ficam de fora. Testes em tests/pausas.test.js. Também: "Cores das faixas" nas Preferências (listra e fundo de Não especificado, pausas, WhatsApp Distração e WhatsApp Produtivo; `FAIXA_CORES`, `faixaCor`, variáveis --fx-*); WhatsApp Produtivo listrado verde/branco e Distração verde/verde escuro; Não especificado âmbar; total do "Não especificado" agora conta todo trabalho sem programa (sem mínimo de 1 min), para os chips somarem o Produtivo; mudar a cor do programa limpa a cor própria dos arquivos dele (`actLimparCoresArquivos`).
- V2.06.41: passar o mouse no chip "WhatsApp Distração" (sessão e Resumo) mostra as conversas que mais tomaram tempo (`waDistracaoTop`).
- V2.06.42: WhatsApp Produtivo liso, verde clarinho (#A7F3D0, uma cor só nas Preferências); todas as pausas (parado, distração, WhatsApp, Instagram…) com listras horizontais em todas as faixas, inclusive a de uso.
- V2.06.43: parado continua sendo 2 min de mouse E teclado sem uso (decisão do Tulio: lendo conta como trabalho). Buraco menor que 2 min entre dois registros fica com o programa de antes (actList estende o registro), em vez de "Não especificado"; o que sobra de não especificado é o programa em uso agora, que só entra no registro na troca de app. Chip e trecho do trabalho sem programa viram "Em uso agora" com a sessão rodando (o programa atual só entra no registro na troca de app); "Não especificado" só em sessão encerrada.
