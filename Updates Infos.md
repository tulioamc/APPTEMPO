# Updates Infos

## V2.02.122 (22/10/2026) — versão de teste
- **Time Sheet / timeline:** escala diária ajustada para 00h–24h, de modo que 12h fique exatamente no centro da barra.
- **Indicador de horário atual:** adicionada agulha vertical azul, com acabamento consistente com a cor de destaque do Tempo, exibida apenas no dia atual e atualizada a cada 15 segundos.
- **Acabamento do indicador:** marcador superior alterado para uma bolinha azul com contorno branco e sombra discreta, conforme a referência visual aprovada.
- **Duração em andamento:** escala do cálculo visual ajustada de 17 para 24 horas para acompanhar a nova timeline.
- **Versão exibida:** atualizada para V2.02.122.
- **Feedback visual Cmd+J:** revisão inicial baseada nas capturas de 22/10. Mantidos os estilos existentes em azul; ainda requer validação visual no aplicativo Mac, especialmente máscara azul e área selecionada.
- **Arquivos alterados:** `js/view-timesheet.js`, `css/styles.css`, `js/config.js`.
- **Testes:** revisão estática do código. Não foi possível executar testes de navegador ou compilar o app Mac neste ambiente.
- **Pendências antes de promover para produção:** validar timeline em diferentes horários/dias; testar Cmd+J com clique, seleção pequena e seleção grande no app Mac; confirmar build e preview deployment.
- **Publicação:** branch de teste `chatgpt/v2.02.122`; não mesclar à `main` nem substituir a versão de produção sem autorização separada.

## Continuação V2.02.122 (23/10/2026)
- **Iniciar registro retroativo:** adicionado campo opcional “Comecei às” no modal de início. Quando preenchido, o cronômetro começa no horário selecionado e os registros do log que cruzam esse intervalo são associados à sessão.
- **Esqueci de iniciar:** as sugestões do log são limitadas a horários a partir do fim do último registro do dia; horário manual anterior a esse limite é recusado.
- **Prevenção de sobreposição:** ao iniciar retroativamente dentro de uma sessão existente, o início é deslocado para o fim da sessão conflitante; apontamentos manuais e edições que se sobreponham a outras sessões são recusados com aviso.
- **Produtividade:** corrigido o cálculo de intervalos trabalhados para não incluir pausas entre segmentos. As médias por dia da semana passam a considerar somente dias com registros.
- **Arquivos por app:** o hover inclui caminho completo quando disponível, mantendo o nome do arquivo como rótulo principal.
- **Janelas de sistema:** diálogos comuns de Adobe e Cinema 4D, como Save As e Composition Settings, são agrupados em “Janelas do sistema” quando não há caminho de arquivo.
- **Arquivos alterados:** `js/domain.js`, `js/view-timesheet.js`, `js/activity.js`, `js/view-productivity.js`.
- **Validação:** alterações de código preparadas na branch de teste; ainda requerem testes no navegador e no app Mac com dados reais antes de promover para produção.
