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
