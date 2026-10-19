# Tempo para Mac (casca nativa)

Abre o site do Tempo numa janela própria e observa, no Mac, o app em primeiro plano, a pasta e (opcionalmente) o nome do arquivo da janela ativa, e a ociosidade. Tudo vira **sugestão** no Time Sheet, com Aceitar ou Ignorar. Nada é gravado sem você aceitar.

## Antes de começar
1. Defina o endereço do site: `defaults write com.tulio.tempomac siteURL "https://SEU-SITE.vercel.app"`
2. Tenha o Xcode (ou só as Command Line Tools) instalado.

## Rodar
```
cd repo-extra/mac
swift build -c release
.build/release/TempoMac
```
Na primeira vez, o macOS pede permissão de **Acessibilidade** (Ajustes → Privacidade e Segurança → Acessibilidade). Ela é necessária para ler a pasta e o arquivo da janela ativa. Sem ela, o app ainda registra o nome do app e a ociosidade.

Se estiver rodando pelo Terminal, a permissão vai para o Terminal. Para um app próprio com ícone, o próximo passo é empacotar como `.app` (Xcode), o que deixa a permissão associada ao Tempo.

## Privacidade
- Nome do arquivo: **desligado por padrão**. Ative no menu da barra (⏱) só se quiser.
- Pasta: ligada por padrão, desligável no menu.
- Segmentos com menos de 2 minutos são descartados.
- Apps podem ser excluídos pela chave `excludedApps` (lista de bundle IDs).
- O Tempo não registra a própria janela.

## Limites conhecidos
- Se o site não estiver aberto, a atividade não é guardada (o site precisa estar carregado para receber).
- Pasta e arquivo dependem de cada app expor o documento pela Acessibilidade. Muitos apps só expõem o título da janela.
- Não testado ainda no seu Mac. Os primeiros testes devem confirmar: app em primeiro plano, pasta de um arquivo aberto no Illustrator/After Effects/Preview, e a sugestão aparecendo no Time Sheet.
