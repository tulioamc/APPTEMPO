# Tempo — ajustes pedidos

## Situação na versão 2 (16/10/2026)
- Feitos: 1, 2, 3, 4, 6, 7, 8.
- Item 5: feito no que o navegador permite (computador suspenso + Chrome/Edge com detecção de ociosidade, sugestões Aceitar/Encerrar/Ignorar, ponte `window.TempoBridge.reportIdle`). App em uso (WhatsApp) e ociosidade em qualquer navegador → app de Mac.
- Item 3: decidido por padrão (pode mudar): BV sobre A+B; imposto sobre A+B+C, por fora, com opção "calcular por dentro".

## Rodada 1 (16/10/2026, após a versão 1)

1. **Campos de seleção com busca** — ao clicar em Status, Pagamento etc., abrir um dropdown que permite buscar, selecionar na lista e criar uma opção nova ali mesmo.
2. **Reordenar colunas arrastando** — segurar o cabeçalho de uma coluna e soltar entre outras duas (com indicador de onde vai cair). Hoje só pelo menu "Colunas" com setas, e só em Projetos. Vale para todas as tabelas; ordem fica salva por tabela.
3. **Calculadora de orçamento: encargos e custos extras**
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
8. **Etiqueta do cliente com sigla da agência** — ex.: agência BRENDA, cliente ABA
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
- BV e imposto incidem sobre o quê: só A, ou A + B? E o imposto inclui o BV (A + B + C)?
- O cálculo é "por fora" (soma o % ao valor) ou "por dentro" (o % sai do valor final, como em nota fiscal: total = líquido ÷ (1 − %))?

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
- Decisões que dependem de você: base do BV/imposto e "por dentro"; modelo de reembolso do plano de saúde e de custos fixos pessoais (você explica a partir do seu Notion); desenho detalhado do to-do.
- Login e sincronização com Supabase (o schema existe, a ligação não).

### Adicionado na 2.01 (depois da primeira entrega)
- **Reembolsos** (tela própria, separada dos custos fixos): uma tabela por mês com Despesa, Anotação, Data, Pagamento, Reembolso, Requerimento e Valor. No dia 1 de cada mês a tabela nova é criada sozinha, copiando as linhas do mês anterior com Pagamento "a Pagar", Reembolso "a Pagar", Requerimento "a Fazer" e data no dia 10. Botão "Novo mês" para criar na hora.
- Totais do mês: pago por você, já reembolsado, saldo líquido (custo real) e ainda a reembolsar.
- Importação do CSV do Notion (mês pela coluna Data; linhas sem data seguem o mês anterior). Os dados não ficam no código: são importados dentro do app.
- Pendente: levar o saldo líquido de reembolsos para o balanço mensal do Financeiro (2.02) e persistir no Supabase.
