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
