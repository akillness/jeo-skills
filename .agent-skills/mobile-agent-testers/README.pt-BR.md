# mobile-agent-testers

<a href="https://www.producthunt.com/posts/mobile-agent-testers?utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=mobile-agent-testers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=dark"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=light" alt="Mobile Agent Testers on Product Hunt" width="250" height="54"></picture></a>
<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>

**20 testadores com IA em 20 celulares diferentes, em paralelo, nos runners gratuitos do GitHub.**

**[Exemplos](docs/examples.pt-BR.md)** · **[Comparação](docs/compare.md)** · **[Perguntas frequentes](#perguntas-frequentes)** · **[Personas](personas.json)** · **[Versões](https://github.com/pierridotite/mobile-agent-testers/releases)**

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Español](README.es.md) · Português

<sub>Tradução do README em inglês: pode estar atrasada, a referência é o [README.md](README.md).</sub>

Nenhum script de teste para escrever. Cada testador é um agente do Claude Code com seu próprio simulador de iOS
ou emulador de Android no GitHub Actions. Ele interpreta uma persona (iPhone SE em sueco com o maior tamanho de
texto, Pixel 7 a 200%, iPad em alemão, árabe da direita para a esquerda...), usa o seu app como um usuário novo (ou percorre a função que você indicar) e
escreve um relatório de bugs com capturas de tela. Flutter, React Native, Expo, Kotlin e Swift nativos, Kotlin
Multiplatform, Capacitor e .NET MAUI.

Os runners do GitHub são gratuitos para repositórios públicos. Você paga só o modelo, com sua assinatura do
Claude ou chave de API: de US$ 0,15 a US$ 0,55 por celular [nestas execuções](docs/runs/).

<p align="center"><a href="assets/localsend-20.mp4"><img src="assets/localsend-20.gif" alt="Gravações de tela reais de 20 testadores com IA usando o LocalSend ao mesmo tempo: 10 emuladores de Android e 10 simuladores de iOS em 14 idiomas, de um Pixel pequeno a um iPad de 13 polegadas. Quando um testador termina, o celular mostra quantos problemas ele encontrou. Abre o vídeo." width="100%"></a><br>
<sub>Gravações de tela reais da execução no LocalSend, sem os tempos de espera. <a href="assets/localsend-20.mp4">Vídeo completo (MP4)</a> · <a href="docs/runs/localsend-20.md">A execução, aparelho por aparelho</a></sub></p>

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)
[![Last commit](https://img.shields.io/github/last-commit/pierridotite/mobile-agent-testers)](https://github.com/pierridotite/mobile-agent-testers/commits/main)

## O que ele faz

Um uso por execução, escolhido com os parâmetros de [Teste o seu próprio app](#teste-o-seu-próprio-app).

- **Explorar como usuários novos** (o padrão). Cada persona tenta chegar ao seu objetivo e conta o que atrapalha, com capturas numeradas.
- **Percorrer uma função do começo ao fim.** O seu próprio brief manda cada agente por uma mecânica inteira: uma reserva em várias etapas, um editor com desfazer, uma sincronização entre duas telas. Os agentes tocam, pressionam e seguram, deslizam e digitam, saem do app e voltam, reiniciam o app para conferir o que foi salvo ou abrem um deep link para começar direto na função, e um brief pode aumentar o orçamento de cerca de 30 ações. [O do AnkiDroid](briefs/ankidroid.md) encontrou o campo do verso de um cartão novo escondido atrás do teclado.
- **Reproduzir um relato de bug** em cada celular: você passa uma issue ou os passos, e cada agente responde sim, não ou incerto, com capturas ([briefs/reproduce.md](briefs/reproduce.md)).
- **Gerar um relatório de melhorias.** Cada persona usa o app uma vez e depois diz onde hesitou, o que esperava e o que mudaria primeiro, por área e impacto ([briefs/improve.md](briefs/improve.md)).
- **Comparar duas versões.** As mesmas personas em dois branches ou builds, e depois uma tabela: objetivos alcançados, ações, notas, problemas vistos em uma versão só ([docs/compare-versions.md](docs/compare-versions.md)). Uma checagem antes de um teste A/B de verdade, não um substituto.
- **Usar um modelo mais barato**: Claude Haiku, ou qualquer API compatível com a Anthropic (OpenRouter, DeepSeek, Kimi, GLM, MiniMax, Qwen). Os achados dependem de quão bem o modelo lê as capturas e raciocina ([docs/cheaper-models.md](docs/cheaper-models.md)).

## Exemplos aplicados

Execuções reais em apps de código aberto, sem nada plantado.

| App | Celulares | O que os agentes encontraram | Tempo, uso do modelo |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend) (Flutter, 100 mil estrelas) | 20: 10 Android, 10 iOS, 14 idiomas | 46 bugs distintos, 1 bloqueador: num iPhone SE em sueco com o maior tamanho de texto, não dá para enviar nenhuma mensagem de texto | 69 min, US$ 4,62 |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android) (Kotlin, 12 mil estrelas, APK publicado) | 10 Android | 43 problemas distintos, entre eles os botões de resposta cortados pela metade com a fonte a 200% e "Get started" em inglês em três idiomas | menos de 10 min, US$ 4,69 |
| [Exemplo de animações do Flutter](https://github.com/flutter/packages/tree/main/packages/animations/example) | 1 Android, 1 iOS | O mesmo erro de digitação, encontrado pelos dois agentes, cada um por conta própria, e um app que ignora o modo escuro | 19 min, US$ 0,47 |

No LocalSend, 34 dos 46 bugs não tinham nada a ver com tamanho de texto nem com acessibilidade: fluxos quebrados, falhas silenciosas, traduções faltando, layouts de tablet. Capturas de tela, cada bug encontrado e os comandos para rodar de novo: [docs/examples.pt-BR.md](docs/examples.pt-BR.md).

## Começo rápido

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # par de chaves + secrets + token do Claude (Windows: .\setup.ps1)
gh workflow run agent-testers.yml     # demo: 2 testadores Android + 2 iOS, ~20 min
bash scripts/collect.sh <run id>      # descriptografa os relatórios e agrupa duplicados: runs/<id>/SUMMARY.md
```

O app de demo tem [11 bugs colocados de propósito](demo-app/BUGS.md). Em [uma execução](docs/runs/), os 4 testadores da demo encontraram 9 deles (de 2 a 7 minutos por agente, cerca de 21 minutos no total, builds incluídos), além de problemas reais que ninguém colocou (um botão debaixo da barra de navegação do Android, dados que não ficam salvos depois de reabrir). Uso do modelo: US$ 0,87 para os 4.

Ou deixe o Claude configurar para o seu app:

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

## Por que não Maestro, Appium ou agent-device?

Eles rodam os testes que você escreve. Estes agentes procuram o que ninguém pensou em testar.

| | mobile-agent-testers | Maestro, Appium, Detox, e2e |
|---|---|---|
| Você escreve | Nada: escolhe personas da lista | Fluxos ou código de teste |
| Ele pega | Fluxos quebrados, erros silenciosos, textos sem tradução, layout com texto grande, modo escuro, textos confusos | O que cada teste verifica |
| Mesmo resultado a cada execução | Não: cada execução explora, então confira as capturas | Sim |

O [agent-device](https://github.com/callstackincubator/agent-device) dá a um agente de programação o controle de um simulador. Este projeto roda uma sessão inteira: faz o build do app, dá a cada persona seu próprio aparelho e junta relatórios criptografados. Use agentes antes de uma versão e fluxos com script para regressões.

Comparação completa, com Firebase Test Lab Robo, mobile-mcp, phonedriver e beta testers humanos: [docs/compare.md](docs/compare.md) (em inglês).

## Teste o seu próprio app

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| Entrada | |
|---|---|
| `source_repo`, `ref` | Repositório e branch do app (vazio = este repositório). Repositório privado: adicione um secret `SOURCE_REPO_TOKEN` somente leitura |
| `app_dir`, `app_id` | Pasta do app, pacote Android / bundle id iOS (se a outra plataforma usa outro id, ele é lido do app compilado) |
| `android_personas`, `ios_personas` | Ids do [personas.json](personas.json), um celular cada, `all`, ou `none` para pular uma plataforma. 20 prontas: 14 idiomas, direita para a esquerda, tablets, texto do pequeno ao maior tamanho de acessibilidade |
| `brief` | Instruções para os agentes: [AGENT_BRIEF.md](AGENT_BRIEF.md) para explorar, [briefs/improve.md](briefs/improve.md) para um relatório de melhorias, ou o seu para uma função |
| `bug_report` | Um bug para reproduzir em vez de explorar: uma issue (`owner/repo#123` ou a URL dela) ou os passos em texto. Cada agente segue os passos no próprio aparelho ([briefs/reproduce.md](briefs/reproduce.md)) |
| `model`, `llm_base_url` | `sonnet` por padrão, `haiku` para gastar menos, ou qualquer API compatível com a Anthropic com a chave em um secret `LLM_API_KEY` ([docs/cheaper-models.md](docs/cheaper-models.md)) |
| `framework` | `auto` (padrão) ou force um dos frameworks abaixo |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | Seu próprio comando de build, ou o download de um app já compilado (caminhos relativos a `app_dir`) |
| `block_hosts` | Hosts de analytics bloqueados durante os testes |
| `record_video` | Gravação de tela de cada celular, criptografada com os relatórios |

**Suportados de fábrica** (detecção automática):

| Framework | Android | Simulador de iOS |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| Kotlin / Java, Swift / Objective-C nativos | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | Projeto Xcode do app iOS |
| Capacitor / Ionic | Gradle debug depois de `cap sync` | Xcode depois de `cap sync` |
| .NET MAUI (beta) | `dotnet publish` | `dotnet build` para `iossimulator-arm64` |
| Qualquer outro | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

Os agentes leem a tela pelas capturas e pela árvore de acessibilidade, então qualquer toolkit de interface
funciona. Widgets com rótulo (`Semantics` do Flutter, `contentDescription`, `accessibilityLabel`) dão a eles
toques mais precisos.

## Como funciona

<p align="center"><img src="assets/how-it-works.svg" alt="Como funciona: um workflow faz o build do app, depois um emulador ou simulador com um agente por persona, relatórios criptografados, resumo na sua máquina" width="100%"></p>

- **As personas** definem o aparelho: modelo, sistema, tamanho da fonte, modo escuro, idioma, localização.
- **Três ferramentas por agente**: ver a tela (com coordenadas de toque), gestos, digitação.
- **Verificação de acessibilidade** em cada tela: controles sem nome e áreas de toque menores que 48 dp (Android) ou 44 pt (iOS), que o agente confirma na captura.
- **Resultados criptografados**: os logs de um repositório público são públicos, então tudo é criptografado com a sua chave.
- **Analytics bloqueado** dentro dos celulares, para os testes nunca mexerem nas suas estatísticas reais.
- **Um resumo** na sua máquina: o Claude agrupa os relatórios que descrevem o mesmo bug, então você vê quantas personas encontraram cada um e quais personas encontraram cada tipo de problema.
- **Testes** a cada push, offline e sem celular: verificação de acessibilidade, matriz de personas, resumo, resultados criptografados ([tests/](tests/)).

## Limites

- Os runners do GitHub são gratuitos para repositórios públicos: cerca de 20 jobs ao mesmo tempo, 5 no macOS.
- Em planos com limite de uso a cada 5 horas, 20 agentes podem esgotá-lo em ~15 min: rode lotes de 6 a 10.
- Os runners hospedados são feitos para o projeto do próprio repositório. Para um app de código fechado, rode o workflow no seu repositório privado ou no seu próprio Mac.

## Perguntas frequentes

### 20 agentes não acham o mesmo bug 20 vezes?

Não. No LocalSend, os 103 relatórios eram 46 bugs distintos, e 29 deles foram encontrados por um único agente, incluindo o único bloqueador ([ver a execução](docs/runs/localsend-20.md)). Os bugs de direita para a esquerda só vieram das duas personas em árabe, e os de tablet dos quatro tablets. Os duplicados eram estados do app inteiro que todo mundo encontra, como a lista de aparelhos vazia.

### Quanto custa?

Os runners do GitHub são gratuitos para repositórios públicos, macOS incluído. O uso do modelo foi de US$ 0,15 a US$ 0,55 por agente [nestas execuções](docs/runs/), cerca de US$ 5 para 20 celulares. Com uma assinatura do Claude, as execuções contam no uso do seu plano em vez de virar conta. Para gastar menos, use `model=haiku` ou o modelo de outro provedor: [docs/cheaper-models.md](docs/cheaper-models.md).

### Quanto tempo leva uma execução?

Cada agente explora de 1 a 18 minutos. Os 10 agentes Android do AnkiDroid levaram menos de 10 minutos do início ao último relatório. Os 20 aparelhos do LocalSend levaram 69 minutos, builds incluídos, porque o plano gratuito roda 5 jobs de macOS ao mesmo tempo.

### Preciso de um Mac?

Não. Tudo roda nos runners do GitHub: Linux para Android, macOS para iOS. Você precisa da CLI `gh` e de uma assinatura do Claude ou de uma chave de API, e o `./setup.sh` (`.\setup.ps1` no Windows) faz o resto.

### Duas execuções dão o mesmo resultado?

Não. Cada agente explora, então duas execuções nunca seguem o mesmo caminho: espere os mesmos tipos de bug, não a mesma lista. Mantenha os testes com script (Maestro, Appium) para regressões, veja [a comparação](docs/compare.md).

### Meus relatórios são públicos?

Não. Os logs de um repositório público são públicos, então relatórios, capturas e vídeos são criptografados com a sua chave antes de sair do runner, e só você pode descriptografá-los. Os hosts de analytics são bloqueados dentro dos celulares. Use contas de teste, nunca contas reais. Mais em [PRIVACY.md](PRIVACY.md).

### Posso testar um app de código fechado?

Sim. Rode o workflow a partir de um repositório privado, com um `SOURCE_REPO_TOKEN` somente leitura para o repositório do seu app, ou faça `android_build` e `ios_build` baixarem um APK ou um .app já compilado. Repositórios privados usam os seus minutos do Actions, e os minutos de macOS contam dez vezes.

### Posso criar minhas próprias personas?

Sim. Uma persona são algumas linhas no [personas.json](personas.json): aparelho, versão do sistema, idioma, tamanho do texto, modo escuro, localização, quem ela é e o que tenta fazer.

### Onde ele erra?

Às vezes lê uma tela errado: 3 dos 20 agentes do LocalSend apontaram o teclado em inglês do simulador como parte do app. Alguns minutos por agente cobrem os caminhos principais, não cada canto de um app grande. Cada bug relatado vem com capturas numeradas, então confira antes de abrir qualquer issue.

## Versão hospedada para equipes (em estudo)

O fluxo deste repositório continua gratuito, de código aberto e completo. Estou estudando uma versão hospedada para equipes com apps privados: runners macOS incluídos (num repositório privado, o GitHub conta cada minuto de macOS dez vezes) e um painel web para compartilhar os relatórios com a equipe toda, product managers incluídos.

Isso ajudaria a sua equipe? [Responda três perguntas](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml) ou [fale comigo no LinkedIn](https://www.linkedin.com/in/pierre-raffalli/). Já rodou no seu app? [Conte o que ele encontrou e o que atrapalhou](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml).

## Histórico de estrelas

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## Créditos

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

Feito por [@pierridotite](https://github.com/pierridotite) ([LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)) · licença MIT
