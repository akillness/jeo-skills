# Exemplos aplicados

[English](examples.md) · [简体中文](examples.zh-CN.md) · [日本語](examples.ja.md) · [Español](examples.es.md) · Português

Execuções reais em apps de código aberto, sem nada plantado. Cada número vem das [execuções](runs/), onde estão todos os relatórios, aparelho por aparelho.

## Não é só acessibilidade

Texto grande rende as capturas mais chamativas, mas é uma parte pequena do que os agentes relatam. Cada persona tem um objetivo ("terminar uma tarefa sem inglês", "preencher cada campo de texto com caracteres turcos, emojis e textos muito longos", "sair do app no meio e voltar depois") e tenta chegar lá como um usuário novo, então os agentes relatam tudo o que atrapalha:

- **Fluxos quebrados e falhas silenciosas**: uma lista de dispositivos que carrega para sempre e nunca diz que não achou nenhum (12 de 20 celulares), um envio que falha e só diz "Error", um diálogo que espera para sempre quando um endereço não responde, um diálogo de texto que descarta o que você digitou depois de um único toque fora.
- **Onboarding e permissões**: o AnkiDroid bloqueia a configuração até você liberar o acesso a todos os arquivos numa tela do sistema, sem nenhuma explicação (8 dos seus 10 agentes).
- **Traduções**: "Get started" em inglês em celulares em português, espanhol e japonês, a aba # chamada "Jogo da velha" em português, tamanhos escritos "B 14" em árabe, datas no formato ISO em vez do formato do celular, uma política de privacidade só em inglês.
- **Textos**: um erro de digitação no exemplo oficial do Flutter, uma mensagem de texto contada como "Files: 1", "#16 #15" na tela inicial sem explicação.
- **Dispositivos**: tablets que mostram o layout de celular numa coluna estreita, o teclado por cima de Cancelar e Confirmar, a barra de navegação do Android por cima dos últimos itens de uma lista, um app que ignora o modo escuro.
- **Dados**: nada salvo depois de reabrir o app (no app de demo).

No LocalSend, 34 dos 46 bugs não tinham nada a ver com tamanho de texto nem com acessibilidade. Cada relatório também termina com a opinião da persona e uma nota de 0 a 10 (ela continuaria com o app?), então uma execução mostra onde os usuários novos se perdem, não só o que está quebrado.

## LocalSend: 20 agentes, 20 aparelhos, 14 idiomas

<p align="center"><img src="../assets/real-findings-localsend-20.png" alt="Quatro telas do LocalSend com as faixas de overflow do Flutter, cada problema marcado em vermelho: um Pixel 7 com texto a 200% em que os seis botões de envio transbordam, um iPhone SE em sueco com o maior tamanho de texto em que o diálogo de mensagem transborda 149 pixels e esconde o campo de texto e o Confirmar, um iPad Air em alemão em que o botão Adicionar sai 114 pixels do cartão, e um iPhone SE em francês com o tamanho de texto padrão em que uma linha transborda 28 pixels" width="100%"></p>

O [LocalSend](https://github.com/localsend/localsend) é um app Flutter com 100 mil estrelas. O que os agentes encontraram:

- iPhone SE em sueco com o maior tamanho de texto do iOS: o diálogo de mensagem transborda 149 px, o campo de texto e o Confirmar ficam fora da tela e não dá para enviar texto.
- Pixel 7 com a fonte do Android a 200%: os seis botões de envio transbordam e cortam os rótulos pela metade. O mesmo num iPhone 16 Plus em italiano no primeiro tamanho de acessibilidade.
- iPad Air em alemão com texto grande: "Hinzufügen" sai 114 px do cartão, e os valores dos Ajustes quebram no meio da palavra.
- iPhone SE em francês com o tamanho de texto padrão: "Recevoir via un lien" transborda 28 px e esconde uma caixa de seleção.
- Pixel Tablet em espanhol: o teclado cobre o Cancelar e o Confirmar do diálogo de endereço.
- Um envio manual que falha diz apenas "Error", "Erreur", "Fehler", "エラー", "Hata" ou "Erro", sem motivo. No iOS, um endereço que não responde deixa o diálogo esperando sem mostrar progresso (três agentes).

103 relatórios no total (1 bloqueador, 15 graves). Agrupados à mão, são 46 bugs distintos, e a maioria foi vista por um único celular:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bugs-per-phone-dark.svg">
  <img src="../assets/bugs-per-phone-light.svg" alt="29 dos 46 bugs do LocalSend foram vistos por um único celular, incluindo o único bloqueador. 6 bugs foram vistos por 2 celulares, 6 por 3, e um cada por 4, 5, 6, 10 e 12 celulares. Nenhum bug foi visto por mais de 12 dos 20." width="100%">
</picture>

69 minutos do início ao último relatório (o plano gratuito roda 5 jobs de macOS ao mesmo tempo), US$ 4,62 de uso do modelo para os 20. Cada relatório, aparelho por aparelho: [docs/runs/localsend-20.md](runs/localsend-20.md). Rode você mesmo:

```bash
gh workflow run agent-testers.yml -f source_repo=localsend/localsend -f app_dir=app \
  -f app_id=org.localsend.localsend_app -f android_personas=all -f ios_personas=all -f record_video=true
```

## AnkiDroid: 10 agentes, direto do APK publicado

<p align="center"><img src="../assets/real-findings-ankidroid.png" alt="Quatro telas do AnkiDroid, cada problema marcado em vermelho: um Pixel 7 com texto a 200% em que os botões Again, Hard, Good e Easy aparecem cortados pela metade (ampliado), a página de Estatísticas do mesmo celular em que as linhas saem pela direita, e a tela de boas-vindas em português e em japonês em que o botão Get started continua em inglês" width="100%"></p>

O [AnkiDroid](https://github.com/ankidroid/Anki-Android) é um app Kotlin com 12 mil estrelas. 10 agentes em 10 emuladores de Android, com o APK da versão publicada no GitHub, sem build:

- Pixel 7 com a fonte do Android a 200%: os botões Again / Hard / Good / Easy aparecem cortados pela metade, e o texto das Estatísticas sai pela borda direita. Um segundo agente viu os botões ainda cortados no alfa 2.26, nas duas fileiras quando "Show large answer buttons" está ativado.
- A tela de boas-vindas mostra "Get started" em inglês em aparelhos configurados em português, espanhol e japonês, enquanto o resto da tela está traduzido (três agentes, cada um por conta própria).

83 relatórios, que se agrupam em 43 problemas distintos (dois vêm do WebView do sistema, antigo demais, das imagens de emulador do Android 10 e 11, e não do app). Menos de 10 minutos do início ao último relatório, US$ 4,69 de uso do modelo para os 10. Cada relatório: [docs/runs/ankidroid-10.md](runs/ankidroid-10.md). Rode você mesmo:

```bash
gh workflow run agent-testers.yml -f app_dir=. -f app_id=com.ichi2.anki -f brief=briefs/ankidroid.md \
  -f android_build="curl -fsSL -o anki.apk https://github.com/ankidroid/Anki-Android/releases/download/v2.25.3/AnkiDroid-2.25.3-full-universal.apk" \
  -f apk_path=anki.apk -f android_personas=all -f ios_personas=none -f block_hosts="ankiweb.net www.google-analytics.com"
```

## O exemplo oficial de animações do Flutter

<p align="center"><img src="../assets/real-finding-flutter.png" alt="Dois celulares na mesma tela do app de exemplo de animações do Flutter, um Pixel 7 e um iPhone SE em francês, com o título Streamling your courses circulado: os dois agentes relataram esse erro de digitação por conta própria" width="100%"></p>

No [app de exemplo do flutter/packages](https://github.com/flutter/packages/tree/main/packages/animations/example), um agente num Pixel 7 e outro num iPhone SE em francês relataram, cada um, o mesmo erro de digitação, "Streamling your courses" ([linha 110](https://github.com/flutter/packages/blob/main/packages/animations/example/lib/shared_axis_transition.dart#L110)), e o do Android percebeu que o app ignora o modo escuro. 19 minutos, US$ 0,47 de uso do modelo.

Rodou no seu app? [Compartilhe o que ele encontrou](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Finding:%20) e isso entra nas [execuções](runs/). Se você mantém um desses apps e acha que um bug relatado está errado, abra uma issue: ele é corrigido e a execução é refeita.
