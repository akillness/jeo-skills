# mobile-agent-testers

<a href="https://www.producthunt.com/posts/mobile-agent-testers?utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=mobile-agent-testers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=dark"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1326513&amp;theme=light" alt="Mobile Agent Testers on Product Hunt" width="250" height="54"></picture></a>
<a href="https://www.linkedin.com/in/pierre-raffalli/"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/linkedin-follow-dark.svg"><img src="assets/linkedin-follow-light.svg" alt="Follow Pierre Raffalli on LinkedIn" width="160" height="54"></picture></a>

**20 testers con IA en 20 teléfonos distintos, en paralelo, en los runners gratuitos de GitHub.**

**[Ejemplos](docs/examples.es.md)** · **[Comparativa](docs/compare.md)** · **[Preguntas frecuentes](#preguntas-frecuentes)** · **[Personas](personas.json)** · **[Versiones](https://github.com/pierridotite/mobile-agent-testers/releases)**

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · Español · [Português](README.pt-BR.md)

<sub>Traducción del README en inglés: puede ir con retraso, la referencia es [README.md](README.md).</sub>

Sin scripts de prueba que escribir. Cada tester es un agente de Claude Code con su propio simulador de iOS
o emulador de Android en GitHub Actions. Interpreta una persona (iPhone SE en sueco con el texto más grande,
Pixel 7 al 200 %, iPad en alemán, árabe de derecha a izquierda...), usa tu app como un usuario nuevo (o recorre la función que le indiques) y escribe
un informe de errores con capturas. Flutter, React Native, Expo, Kotlin y Swift nativos, Kotlin
Multiplatform, Capacitor y .NET MAUI.

Los runners de GitHub son gratuitos para repos públicos. Solo pagas el modelo, con tu suscripción de Claude
o tu clave de API: entre 0,15 y 0,55 $ por teléfono en [estas ejecuciones](docs/runs/).

<p align="center"><a href="assets/localsend-20.mp4"><img src="assets/localsend-20.gif" alt="Grabaciones de pantalla reales de 20 testers con IA usando LocalSend a la vez: 10 emuladores de Android y 10 simuladores de iOS en 14 idiomas, desde un Pixel pequeño hasta un iPad de 13 pulgadas. Cuando un tester termina, su teléfono muestra cuántos problemas encontró. Abre el vídeo." width="100%"></a><br>
<sub>Grabaciones de pantalla reales de la ejecución en LocalSend, sin los tiempos muertos. <a href="assets/localsend-20.mp4">Vídeo completo (MP4)</a> · <a href="docs/runs/localsend-20.md">La ejecución, dispositivo por dispositivo</a></sub></p>

[![Tests](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml/badge.svg)](https://github.com/pierridotite/mobile-agent-testers/actions/workflows/tests.yml)
[![Stars](https://img.shields.io/github/stars/pierridotite/mobile-agent-testers?style=flat)](https://github.com/pierridotite/mobile-agent-testers/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![iOS + Android](https://img.shields.io/badge/platforms-iOS%20%2B%20Android-blue)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-orange)
[![Last commit](https://img.shields.io/github/last-commit/pierridotite/mobile-agent-testers)](https://github.com/pierridotite/mobile-agent-testers/commits/main)

## Qué puede hacer

Un uso por ejecución, elegido con los parámetros de [Prueba tu propia app](#prueba-tu-propia-app).

- **Explorar como usuarios nuevos** (por defecto). Cada persona intenta alcanzar su objetivo y cuenta lo que se lo impide, con capturas numeradas.
- **Recorrer una función de principio a fin.** Tu propio brief manda a cada agente por una mecánica completa: una reserva en varios pasos, un editor con deshacer, una sincronización entre dos pantallas. Los agentes tocan, mantienen pulsado, deslizan y escriben, salen de la app y vuelven, la reinician para comprobar qué se guardó o abren un enlace profundo para empezar directamente en la función, y un brief puede subir el presupuesto de unas 30 acciones. [El de AnkiDroid](briefs/ankidroid.md) encontró el campo del reverso de una tarjeta nueva tapado por el teclado.
- **Reproducir un informe de error** en cada teléfono: das un issue o los pasos, y cada agente responde sí, no o no está claro, con capturas ([briefs/reproduce.md](briefs/reproduce.md)).
- **Obtener un informe de mejoras.** Cada persona usa la app una vez y luego dice dónde dudó, qué esperaba y qué cambiaría primero, por área e impacto ([briefs/improve.md](briefs/improve.md)).
- **Comparar dos versiones.** Las mismas personas en dos ramas o builds, y luego una tabla: objetivos alcanzados, acciones, puntuaciones, errores vistos en una sola versión ([docs/compare-versions.md](docs/compare-versions.md)). Una comprobación antes de un test A/B real, no un sustituto.
- **Usar un modelo más barato**: Claude Haiku, o cualquier API compatible con Anthropic (OpenRouter, DeepSeek, Kimi, GLM, MiniMax, Qwen). Los hallazgos dependen de lo bien que el modelo lea las capturas y razone ([docs/cheaper-models.md](docs/cheaper-models.md)).

## Ejemplos aplicados

Ejecuciones reales en apps de código abierto, sin nada plantado.

| App | Teléfonos | Lo que encontraron los agentes | Tiempo, uso del modelo |
|---|---|---|---|
| [LocalSend](https://github.com/localsend/localsend) (Flutter, 100 000 estrellas) | 20: 10 Android, 10 iOS, 14 idiomas | 46 errores distintos, 1 bloqueante: en un iPhone SE en sueco con el texto más grande, no se puede enviar ningún mensaje de texto | 69 min, 4,62 $ |
| [AnkiDroid](https://github.com/ankidroid/Anki-Android) (Kotlin, 12 000 estrellas, APK publicado) | 10 Android | 43 problemas distintos, entre ellos los botones de respuesta cortados por la mitad con la fuente al 200 % y «Get started» en inglés en tres idiomas | menos de 10 min, 4,69 $ |
| [Ejemplo de animaciones de Flutter](https://github.com/flutter/packages/tree/main/packages/animations/example) | 1 Android, 1 iOS | La misma errata, encontrada por los dos agentes cada uno por su cuenta, y una app que ignora el modo oscuro | 19 min, 0,47 $ |

En LocalSend, 34 de los 46 errores no tenían nada que ver con el tamaño del texto ni con la accesibilidad: flujos rotos, fallos silenciosos, traducciones que faltan, diseños de tableta. Capturas, cada hallazgo y los comandos para volver a ejecutarlos: [docs/examples.es.md](docs/examples.es.md).

## Inicio rápido

```bash
gh repo create my-testers --public --template pierridotite/mobile-agent-testers --clone
cd my-testers && ./setup.sh           # par de claves + secrets + token de Claude (Windows: .\setup.ps1)
gh workflow run agent-testers.yml     # demo: 2 testers Android + 2 iOS, ~20 min
bash scripts/collect.sh <run id>      # descifra los informes y agrupa duplicados: runs/<id>/SUMMARY.md
```

La app de demo tiene [11 errores puestos a propósito](demo-app/BUGS.md). En [una ejecución](docs/runs/), los 4 testers de la demo encontraron 9 (de 2 a 7 minutos por agente, unos 21 minutos en total con las compilaciones), además de problemas reales que nadie había puesto (un botón bajo la barra de navegación de Android, datos que no se guardan al reiniciar). Uso del modelo: 0,87 $ para los 4.

O deja que Claude lo configure para tu app:

```
/plugin marketplace add pierridotite/mobile-agent-testers
/plugin install mobile-agent-testers@mobile-agent-testers
```

## ¿Por qué no Maestro, Appium o agent-device?

Ejecutan las pruebas que tú escribes. Estos agentes buscan lo que nadie pensó en probar.

| | mobile-agent-testers | Maestro, Appium, Detox, e2e |
|---|---|---|
| Tú escribes | Nada: eliges personas de la lista | Flujos o código de prueba |
| Detecta | Flujos rotos, errores silenciosos, textos sin traducir, diseño con texto grande, modo oscuro, textos confusos | Lo que comprueba cada prueba |
| Mismo resultado en cada ejecución | No: cada ejecución explora, así que revisa las capturas | Sí |

[agent-device](https://github.com/callstackincubator/agent-device) da a un agente de programación el control de un simulador. Esto ejecuta una sesión completa: compila la app, da a cada persona su propio dispositivo y recoge informes cifrados. Usa agentes antes de una versión y flujos con script para las regresiones.

Comparativa completa, con Firebase Test Lab Robo, mobile-mcp, phonedriver y beta testers humanos: [docs/compare.md](docs/compare.md) (en inglés).

## Prueba tu propia app

```bash
gh workflow run agent-testers.yml -f source_repo=you/app -f app_id=com.you.app \
  -f android_personas=anna,malik -f ios_personas=clara,jonas
```

| Entrada | |
|---|---|
| `source_repo`, `ref` | Repositorio y rama de la app (vacío = este repositorio). Repositorio privado: añade un secret `SOURCE_REPO_TOKEN` de solo lectura |
| `app_dir`, `app_id` | Carpeta de la app, paquete de Android / bundle id de iOS (si la otra plataforma usa otro id, se lee de su app compilada) |
| `android_personas`, `ios_personas` | Ids de [personas.json](personas.json), un teléfono cada una, `all`, o `none` para saltar una plataforma. 20 listas: 14 idiomas, derecha a izquierda, tabletas, texto desde pequeño hasta el mayor tamaño de accesibilidad |
| `brief` | Instrucciones para los agentes: [AGENT_BRIEF.md](AGENT_BRIEF.md) para explorar, [briefs/improve.md](briefs/improve.md) para un informe de mejoras, o el tuyo para una función |
| `bug_report` | Un error que reproducir en lugar de explorar: un issue (`owner/repo#123` o su URL) o los pasos en texto. Cada agente lo sigue en su propio dispositivo ([briefs/reproduce.md](briefs/reproduce.md)) |
| `model`, `llm_base_url` | `sonnet` por defecto, `haiku` para gastar menos, o cualquier API compatible con Anthropic con su clave en un secret `LLM_API_KEY` ([docs/cheaper-models.md](docs/cheaper-models.md)) |
| `framework` | `auto` (por defecto) o fuerza uno de los frameworks de abajo |
| `android_build` + `apk_path`, `ios_build` + `ios_app_path` | Tu propio comando de compilación, o la descarga de una app ya compilada (rutas relativas a `app_dir`) |
| `block_hosts` | Hosts de analítica bloqueados durante las pruebas |
| `record_video` | Grabación de pantalla de cada teléfono, cifrada con los informes |

**Compatibles de serie** (detección automática):

| Framework | Android | Simulador de iOS |
|---|---|---|
| Flutter | `flutter build apk --debug` | `flutter build ios --simulator` |
| React Native / Expo | Gradle release | Xcode, arm64 |
| Kotlin / Java, Swift / Objective-C nativos | Gradle debug | Xcode, arm64 |
| Kotlin Multiplatform | Gradle debug | Proyecto Xcode de la app de iOS |
| Capacitor / Ionic | Gradle debug tras `cap sync` | Xcode tras `cap sync` |
| .NET MAUI (beta) | `dotnet publish` | `dotnet build` para `iossimulator-arm64` |
| Cualquier otro | `android_build` + `apk_path` | `ios_build` + `ios_app_path` |

Los agentes leen la pantalla a partir de capturas y del árbol de accesibilidad, así que funciona con cualquier
toolkit de interfaz. Los widgets con etiqueta (`Semantics` de Flutter, `contentDescription`,
`accessibilityLabel`) les dan toques más precisos.

## Cómo funciona

<p align="center"><img src="assets/how-it-works.svg" alt="Cómo funciona: un workflow compila la app, luego un emulador o simulador con un agente por persona, informes cifrados, resumen en tu máquina" width="100%"></p>

- **Las personas** definen el dispositivo: modelo, sistema, tamaño de letra, modo oscuro, idioma, ubicación.
- **Tres herramientas por agente**: ver la pantalla (con coordenadas para tocar), gestos, escribir.
- **Revisión de accesibilidad** en cada pantalla: controles sin nombre y zonas táctiles por debajo de 48 dp (Android) o 44 pt (iOS), que el agente confirma en la captura.
- **Resultados cifrados**: los logs de un repositorio público son públicos, así que todo se cifra con tu clave.
- **Analítica bloqueada** dentro de los teléfonos, para que las pruebas nunca toquen tus estadísticas reales.
- **Un resumen** en tu máquina: Claude agrupa los informes que describen el mismo error, así ves cuántas personas encontraron cada uno y qué personas encontraron cada tipo de problema.
- **Pruebas** en cada push, sin conexión y sin teléfono: revisión de accesibilidad, matriz de personas, resumen, resultados cifrados ([tests/](tests/)).

## Límites

- Los runners de GitHub son gratis para repositorios públicos: unos 20 trabajos a la vez, 5 en macOS.
- En planes con un límite de uso de 5 horas, 20 agentes pueden agotarlo en ~15 min: ejecuta tandas de 6 a 10.
- Los runners alojados están pensados para el proyecto del propio repositorio. Para una app de código cerrado, ejecuta el workflow en tu repositorio privado o en tu propio Mac.

## Preguntas frecuentes

### ¿20 agentes no encuentran 20 veces el mismo error?

No. En LocalSend, los 103 informes eran 46 errores distintos, y 29 de ellos los encontró un solo agente, incluido el único bloqueante ([ver la ejecución](docs/runs/localsend-20.md)). Los errores de derecha a izquierda solo vinieron de las dos personas en árabe, y los de tableta de las cuatro tabletas. Los duplicados eran estados de toda la app con los que todos se cruzan, como la lista de dispositivos vacía.

### ¿Cuánto cuesta?

Los runners de GitHub son gratis para repositorios públicos, macOS incluido. El uso del modelo fue de 0,15 a 0,55 $ por agente en [estas ejecuciones](docs/runs/), unos 5 $ para 20 teléfonos. Con una suscripción a Claude, las ejecuciones cuentan en el uso de tu plan en lugar de facturarse. Para gastar menos, usa `model=haiku` o el modelo de otro proveedor: [docs/cheaper-models.md](docs/cheaper-models.md).

### ¿Cuánto tarda una ejecución?

Cada agente explora de 1 a 18 minutos. Los 10 agentes Android de AnkiDroid tardaron menos de 10 minutos desde el inicio hasta el último informe. Los 20 dispositivos de LocalSend tardaron 69 minutos, compilaciones incluidas, porque el plan gratuito ejecuta 5 trabajos de macOS a la vez.

### ¿Necesito un Mac?

No. Todo se ejecuta en los runners de GitHub: Linux para Android, macOS para iOS. Necesitas la CLI `gh` y una suscripción a Claude o una clave de API, y `./setup.sh` (`.\setup.ps1` en Windows) hace el resto.

### ¿Dos ejecuciones dan el mismo resultado?

No. Cada agente explora, así que dos ejecuciones nunca siguen el mismo camino: espera los mismos tipos de errores, no la misma lista. Mantén las pruebas con script (Maestro, Appium) para las regresiones, mira [la comparativa](docs/compare.md).

### ¿Mis informes son públicos?

No. Los logs de un repositorio público son públicos, así que los informes, las capturas y los vídeos se cifran con tu clave antes de salir del runner, y solo tú puedes descifrarlos. Los hosts de analítica se bloquean dentro de los teléfonos. Usa cuentas de prueba, nunca reales. Más en [PRIVACY.md](PRIVACY.md).

### ¿Puedo probar una app de código cerrado?

Sí. Ejecuta el workflow desde un repositorio privado, con un `SOURCE_REPO_TOKEN` de solo lectura para el repositorio de tu app, o haz que `android_build` e `ios_build` descarguen un APK o un .app ya compilados. Los repositorios privados consumen tus minutos de Actions, y los minutos de macOS cuentan diez veces.

### ¿Puedo crear mis propias personas?

Sí. Una persona son unas pocas líneas en [personas.json](personas.json): dispositivo, versión del sistema, idioma, tamaño de texto, modo oscuro, ubicación, quién es y qué intenta hacer.

### ¿En qué se equivoca?

A veces interpreta mal una pantalla: 3 de los 20 agentes de LocalSend señalaron el teclado en inglés del simulador como parte de la app. Unos minutos por agente cubren los caminos principales, no cada rincón de una app grande. Cada hallazgo viene con capturas numeradas, así que revísalas antes de reportar nada.

## Versión alojada para equipos (en estudio)

El flujo de este repo sigue siendo gratis, de código abierto y completo. Estoy estudiando una versión alojada para equipos con apps privadas: runners de macOS incluidos (en un repo privado, GitHub cuenta cada minuto de macOS diez veces) y un panel web para compartir los informes con todo el equipo, product managers incluidos.

¿Le serviría a tu equipo? [Responde tres preguntas](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=teams.yml) o [escríbeme por LinkedIn](https://www.linkedin.com/in/pierre-raffalli/). ¿Ya lo probaste con tu app? [Cuéntame qué encontró y qué te frenó](https://github.com/pierridotite/mobile-agent-testers/issues/new?template=usage-feedback.yml).

## Historial de estrellas

[![Star History Chart](https://api.star-history.com/svg?repos=pierridotite/mobile-agent-testers&type=Date)](https://star-history.com/#pierridotite/mobile-agent-testers&Date)

## Créditos

[Claude Code](https://docs.claude.com/en/docs/claude-code) ·
[AXe](https://github.com/cameroncooke/axe) ·
[android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner)

Hecho por [@pierridotite](https://github.com/pierridotite) ([LinkedIn](https://www.linkedin.com/in/pierre-raffalli/)) · licencia MIT
