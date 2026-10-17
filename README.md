# Tempo

Time sheet, projetos, tarefas, orçamentos, financeiro e relatórios — app pessoal do Tulio.
Funciona no navegador do Mac e no iPhone (instalado na Tela de Início). Depois vira app de Mac usando este mesmo site como base.

> **Versão 2.01.** Ainda sem banco de dados: tudo roda em memória e some ao recarregar.
> Abre com dados fictícios para testar; o botão **Começar vazio** limpa tudo.
> Para levar dados de uma sessão para outra, use **Preferências › Dados e backup**.

## Estrutura

```
index.html              página única do app
css/styles.css          visual (tema claro/escuro, celular)
js/                     código, carregado nesta ordem:
  store.js              camada de dados (MemoryAdapter agora, HttpAdapter depois)
  colors.js             cores das etiquetas e siglas das agências
  domain.js             regras de negócio, cálculos e dados fictícios
  ui.js · combo.js · table.js   componentes (dropdown com busca, tabela estilo Notion)
  app.js                navegação, cronômetro, inatividade, lembretes
  view-*.js             telas
manifest.webmanifest    instalação no iPhone/Mac (PWA)
sw.js                   funciona offline e sempre busca a versão mais nova
icons/                  ícones do app
db/schema.sql           banco planejado (ainda não usado)
BACKLOG.md              ajustes pedidos e próximas etapas
vercel.json             configuração de publicação
```

Não tem build: são arquivos estáticos. Editou, subiu, publicou.

## Publicar (GitHub → Vercel)

1. Suba **o conteúdo desta pasta** na raiz do repositório `tulioamc/APPTEMPO`
   (no GitHub: *Add file › Upload files*, arraste tudo, *Commit changes*).
2. Na Vercel: *Add New › Project* → importe `APPTEMPO` → **Framework Preset: Other** →
   sem Build Command, Output Directory vazio → *Deploy*.
3. A cada novo commit no GitHub, a Vercel publica sozinha.

## Instalar no iPhone

Abra o endereço da Vercel no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.

## Próximas etapas

1. Banco de dados (Supabase ligado à Vercel) + login → sincronizar Mac e iPhone. Schema em `db/schema.sql`.
2. App de Mac (Tauri) abrindo este site + recursos do sistema (ociosidade, app em uso, barra de menus, atalhos).
   O site já expõe `window.TempoBridge.reportIdle(inicioISO, fimISO, nomeDoApp)` para o app de Mac avisar inatividade.
3. Sugestões que ficaram para a 2.02, listadas no `BACKLOG.md`.

## Fonte

A interface usa **BR Sonoma** quando está instalada no aparelho; senão, **Manrope** (Google Fonts).
A BR Sonoma é paga (Brink). Com a licença web, coloque os arquivos `.woff2` em `fonts/` e adicione o `@font-face` no topo de `css/styles.css`.
