# Ejemplos aplicados

[English](examples.md) · [简体中文](examples.zh-CN.md) · [日本語](examples.ja.md) · Español · [Português](examples.pt-BR.md)

Ejecuciones reales en apps de código abierto, sin nada plantado. Cada cifra sale de [las ejecuciones](runs/), donde están todos los informes, dispositivo por dispositivo.

## No solo accesibilidad

El texto grande da las capturas más llamativas, pero es una parte pequeña de lo que reportan los agentes. Cada persona tiene un objetivo («terminar una tarea sin inglés», «rellenar cada campo de texto con caracteres turcos, emojis y textos muy largos», «salir de la app a mitad y volver») e intenta lograrlo como un usuario nuevo, así que los agentes reportan todo lo que se interpone:

- **Flujos rotos y fallos silenciosos**: una lista de dispositivos que carga sin fin y nunca dice que no encontró ninguno (12 de 20 teléfonos), un envío fallido que solo dice «Error», un diálogo que espera para siempre cuando una dirección no responde, un diálogo de texto que borra lo escrito tras un solo toque fuera.
- **Onboarding y permisos**: AnkiDroid bloquea la configuración hasta que concedes el acceso a todos los archivos en una pantalla del sistema, sin ninguna explicación (8 de sus 10 agentes).
- **Traducciones**: «Get started» en inglés en teléfonos en portugués, español y japonés, la pestaña # llamada «Jogo da velha» (tres en raya) en portugués, tamaños escritos «B 14» en árabe, fechas en formato ISO en lugar del formato del teléfono, una política de privacidad solo en inglés.
- **Textos**: una errata en el ejemplo oficial de Flutter, un mensaje de texto contado como «Files: 1», «#16 #15» en la pantalla principal sin explicación.
- **Dispositivos**: tablets que muestran el diseño de teléfono en una columna estrecha, el teclado encima de Cancelar y Confirmar, la barra de navegación de Android encima de los últimos elementos de una lista, una app que ignora el modo oscuro.
- **Datos**: nada guardado al volver a abrir la app (en la app de demo).

En LocalSend, 34 de los 46 errores no tenían nada que ver con el tamaño del texto ni con la accesibilidad. Además, cada informe termina con la opinión de la persona y una nota sobre 10 (¿se quedaría con la app?), así que una ejecución muestra dónde se pierden los usuarios nuevos, no solo qué está roto.

## LocalSend: 20 agentes, 20 dispositivos, 14 idiomas

<p align="center"><img src="../assets/real-findings-localsend-20.png" alt="Cuatro pantallas de LocalSend con las franjas de desbordamiento de Flutter, cada problema enmarcado en rojo: un Pixel 7 con el texto al 200 % donde los seis botones de envío se desbordan, un iPhone SE en sueco con el texto más grande donde el diálogo de mensaje se desborda 149 píxeles y oculta el campo de texto y Confirmar, un iPad Air en alemán donde el botón Añadir se sale 114 píxeles de su tarjeta, y un iPhone SE en francés con el tamaño de texto por defecto donde una fila se desborda 28 píxeles" width="100%"></p>

[LocalSend](https://github.com/localsend/localsend) es una app de Flutter con 100 000 estrellas. Lo que encontraron los agentes:

- iPhone SE en sueco con el texto más grande de iOS: el diálogo de mensaje se desborda 149 px, el campo de texto y Confirmar quedan fuera de la pantalla y no se puede enviar texto.
- Pixel 7 con la fuente de Android al 200 %: los seis botones de envío se desbordan y cortan sus etiquetas por la mitad. Lo mismo en un iPhone 16 Plus en italiano con el primer tamaño de accesibilidad.
- iPad Air en alemán con texto grande: «Hinzufügen» se sale 114 px de su tarjeta, y los valores de Ajustes se parten a mitad de palabra.
- iPhone SE en francés con el tamaño de texto por defecto: «Recevoir via un lien» se desborda 28 px y oculta una casilla.
- Pixel Tablet en español: el teclado tapa Cancelar y Confirmar en el diálogo de dirección.
- Un envío manual fallido solo dice «Error», «Erreur», «Fehler», «エラー», «Hata» o «Erro», sin motivo. En iOS, una dirección que no responde deja el diálogo esperando sin mostrar progreso (tres agentes).

103 informes en total (1 bloqueante, 15 graves). Agrupados a mano son 46 errores distintos, y la mayoría los vio un solo teléfono:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/bugs-per-phone-dark.svg">
  <img src="../assets/bugs-per-phone-light.svg" alt="29 de los 46 errores de LocalSend los vio un solo teléfono, incluido el único bloqueante. 6 errores los vieron 2 teléfonos, 6 los vieron 3, y uno cada uno 4, 5, 6, 10 y 12 teléfonos. Ningún error lo vieron más de 12 de los 20." width="100%">
</picture>

69 minutos desde el inicio hasta el último informe (el plan gratuito ejecuta 5 trabajos de macOS a la vez), 4,62 $ de uso del modelo para los 20. Cada informe, dispositivo por dispositivo: [docs/runs/localsend-20.md](runs/localsend-20.md). Ejecútalo tú mismo:

```bash
gh workflow run agent-testers.yml -f source_repo=localsend/localsend -f app_dir=app \
  -f app_id=org.localsend.localsend_app -f android_personas=all -f ios_personas=all -f record_video=true
```

## AnkiDroid: 10 agentes, directamente con el APK publicado

<p align="center"><img src="../assets/real-findings-ankidroid.png" alt="Cuatro pantallas de AnkiDroid, cada problema enmarcado en rojo: un Pixel 7 con el texto al 200 % donde los botones Again, Hard, Good y Easy se cortan por la mitad (ampliado), la página de Estadísticas del mismo teléfono donde las líneas se salen por la derecha, y la pantalla de bienvenida en portugués y en japonés donde el botón Get started sigue en inglés" width="100%"></p>

[AnkiDroid](https://github.com/ankidroid/Anki-Android) es una app de Kotlin con 12 000 estrellas. 10 agentes en 10 emuladores de Android, con el APK de su versión en GitHub, sin compilar nada:

- Pixel 7 con la fuente de Android al 200 %: los botones Again / Hard / Good / Easy se cortan por la mitad, y el texto de Estadísticas se sale por la derecha. Un segundo agente vio los botones todavía cortados en su alfa 2.26, en las dos filas cuando «Show large answer buttons» está activado.
- La pantalla de bienvenida dice «Get started» en inglés en dispositivos en portugués, español y japonés, mientras el resto de la pantalla está traducido (tres agentes, cada uno por su cuenta).

83 informes, que se agrupan en 43 problemas distintos (dos vienen del WebView del sistema, demasiado antiguo, de las imágenes de emulador de Android 10 y 11, no de la app). Menos de 10 minutos desde el inicio hasta el último informe, 4,69 $ de uso del modelo para los 10. Cada informe: [docs/runs/ankidroid-10.md](runs/ankidroid-10.md). Ejecútalo tú mismo:

```bash
gh workflow run agent-testers.yml -f app_dir=. -f app_id=com.ichi2.anki -f brief=briefs/ankidroid.md \
  -f android_build="curl -fsSL -o anki.apk https://github.com/ankidroid/Anki-Android/releases/download/v2.25.3/AnkiDroid-2.25.3-full-universal.apk" \
  -f apk_path=anki.apk -f android_personas=all -f ios_personas=none -f block_hosts="ankiweb.net www.google-analytics.com"
```

## El ejemplo oficial de animaciones de Flutter

<p align="center"><img src="../assets/real-finding-flutter.png" alt="Dos teléfonos en la misma pantalla de la app de ejemplo de animaciones de Flutter, un Pixel 7 y un iPhone SE en francés, con el título Streamling your courses rodeado: los dos agentes informaron de esta errata por su cuenta" width="100%"></p>

En la [app de ejemplo de flutter/packages](https://github.com/flutter/packages/tree/main/packages/animations/example), un agente en un Pixel 7 y otro en un iPhone SE en francés informaron cada uno de la misma errata, «Streamling your courses» ([línea 110](https://github.com/flutter/packages/blob/main/packages/animations/example/lib/shared_axis_transition.dart#L110)), y el de Android notó que la app ignora el modo oscuro. 19 minutos, 0,47 $ de uso del modelo.

¿Lo has probado en tu app? [Comparte lo que encontró](https://github.com/pierridotite/mobile-agent-testers/issues/new?title=Finding:%20) y entrará en [las ejecuciones](runs/). Si mantienes una de estas apps y crees que un hallazgo es erróneo, abre un issue: se corrige y se vuelve a ejecutar.
