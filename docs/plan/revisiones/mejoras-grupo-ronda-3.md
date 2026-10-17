# Revisión · Mejoras 33 a 37 (crear ronda, pantalla de la ronda, proponer con búsqueda, fuera de la biblioteca, estructura de deseos y votación) · ronda 3

## Alcance

Revisión de solo lectura (ronda final) de los arreglos a `mejoras-grupo-ronda-2.md`, sobre los cambios sin confirmar de
`feat/plan-completo`. He revisado `WishesPage.tsx` (barra «Elegir para votar»), `RpdPlayPage.tsx`, el nuevo
`useHistorySettled.ts`, `roundRules.ts` con su test, `RpdPage.tsx` (`state: OPENED_FROM_RPD`), `AddVideoDialog.tsx` y
`addVideoRules.ts` con su test. Como contexto he leído `useBackToClose.ts`, `Dialog.tsx`, `overlayHost.ts`,
`ToastProvider.tsx`, `Button.tsx`, `AppShell.tsx` (`--fab-clearance`, `Page`), `QuickNav.tsx`, `index.css`
(`paper`, `paper-raised`), `roundDraft.ts` (el borrador se guarda en `sessionStorage`), `BagPage.tsx`, `TrackPage.tsx`,
`main.tsx` (la actualización de la PWA no recarga con un `[role="dialog"]` abierto) y `vite.config.ts` (PWA
`standalone`).

Sin servidor ni navegador: las medidas salen de las clases y el historial lo he seguido paso a paso sobre el código.
He pasado vitest con `roundRules`, `addVideoRules`, `youTubePickerRules` y `dialogFocus`: 4 archivos, 50 tests, en verde.

## Hallazgos de la ronda 2 → estado

| Nota | Hallazgo de la ronda 2 | Estado |
| --- | --- | --- |
| 6 | La barra «Elegir para votar» no cabía en el móvil | **Corregido.** Las cuentas, con los bordes de 1 px de `paper` y `paper-raised`. **A 390 px:** 390 − 20 (`Page px-2.5`) − 2 (borde de `paper`) − 32 (`section px-4`) − 72 (`--fab-clearance`) = 264 px de barra. Por dentro quedan 246 px (− 2 de borde − 16 de `p-2`). «Cancelar» mide 44 px (`max-sm:w-11 px-0`, el texto `sr-only` va en `absolute` y no suma hueco) y el hueco 8 px, así que «Crear votación» (`flex-1 min-w-0 px-3`) tiene 194 px. Le hacen falta unos 174 (24 de relleno, 16 del icono, 8 de hueco y unos 126 de texto), así que cabe en una línea. **A 360 px:** la barra mide 234 px, por dentro 216, y al botón le quedan 164 px. El texto pasa a dos líneas («Crear / votación»), porque el `span` lleva `whitespace-normal min-w-0`. Ocupa unos 34,5 px dentro de los 44 del botón, sin desbordar. **Lado derecho:** `--fab-clearance` vale `72px + env(safe-area-inset-right)` y se suma al margen de la página. La barra acaba a unos 98 px del borde de la pantalla y el botón flotante ocupa de 16 a 72 px, así que quedan unos 26 px de aire, también en horizontal con la muesca. **Nombre accesible:** el `span` «Cancelar» es `max-sm:sr-only`, así que el botón se llama «Cancelar» en todos los anchos, y su zona de toque mide 44×44. Detalle sin importancia: el comentario dice 250 y 220 px porque no cuenta los bordes (son 246 y 216). |
| 3 | «Volver a mezclar» salía de la pantalla completa | **Corregido.** `useFullscreen` se llama en `RpdPlayPage`, antes de los `return` tempranos (el orden de los hooks no cambia) y fuera de la `key` de `RoundRunner`. Llega por props a `RoundControls`. Solo se sale de la pantalla completa al desmontar la página, y solo si la pidió la ronda (`ours`). |
| 3 | En «Añadir vídeo» podía quedar el título del archivo al volver a YouTube | **Corregido**, con test. Cada pestaña guarda su propia sugerencia (`suggested.youtube` y `suggested.file`). Lo que escribe la persona (`typed`) vale para las dos pestañas, y eso es lo mismo que hacía `titleTouched` antes, así que no hay regresión. «Quitar» y quitar el archivo vacían solo la sugerencia de su pestaña. Al cerrar el diálogo se vuelve a `EMPTY_META`. |
| 2 | En pantalla completa, los diálogos y avisos quedaban fuera de `body` | **Corregido.** `overlayHost()` usa el elemento a pantalla completa solo si no contiene `body`. En la ronda, que pone a pantalla completa `<html>`, los diálogos y avisos se quedan en `body`. |
| 2 | Entradas de más en el historial («Salir» desde la confirmación, «Seguir» y «Guardar como pista») | **Corregido en el uso normal** (ver N1 para después de recargar). Cada entrada nueva espera a `useHistorySettled`. Los efectos pasivos desmontan antes de montar, así que el `back()` del diálogo ya está pedido cuando el hook mira `history.state`: espera al `popstate` y solo entonces sigue. Lo he seguido paso a paso. **«Seguir»:** el diálogo hace `back()`, llega el pop y se vuelve a poner la guardia, sin entrada vieja. **«Salir» desde la confirmación:** con `leaving`, `guardWanted` es falso, así que la guardia no vuelve a abrirse. El diálogo hace `back()`, llega el pop y luego `navigate(-1)`, que deja `[/rpd]` (con `/rpd/jugar` hacia delante). **Atrás → confirmación → Atrás:** la confirmación se cierra y vuelve la guardia. **«Guardar como pista» en mitad de la ronda:** la guardia se quita, se abre el diálogo y al cerrarlo vuelve la guardia. En ningún caso se sale sin preguntar, y Atrás nunca cae en una confirmación muerta. El `back()` que da el propio hook sobre entradas viejas no pasa por `ownPops`, pero en ese momento no hay ninguna otra capa abierta que pudiera cerrarse por error. |
| 2 | Espacio mantenido y Esc | **Corregido**, con test. `roundKeyAction` devuelve `null` con `repeat`, y un Espacio mantenido hace `preventDefault`, así que no desplaza la pantalla ni repite el botón. Esc llama a `exit()` (pausa y pregunta) solo durante `lead`/`play` y fuera de la pantalla completa. Si hay un diálogo encima, el atajo no hace nada: el `return` temprano cubre `confirmExit` y `saving`, y además el foco está dentro de otro `role="dialog"`. |
| 1 | Comentario huérfano en `RandomPlayScreen` | **Corregido.** |

Comprobado aparte: abrir `/rpd/jugar` desde un enlace directo, desde una bolsa o desde una pista no lleva `state`, así
que `leaveRoundBy` responde `replace` y «Salir» pone `/rpd` en el lugar de la ronda. **Nunca se da un paso atrás fuera
de la app.** Las capas copian `history.state`, así que `usr` y `OPENED_FROM_RPD` se mantienen al poner y quitar
entradas, y también al volver a mezclar, porque `useRef(location.state)` se vuelve a leer al montar el runner.

**Menú flotante y otras capas.** En `/rpd/jugar`, `quickNavHidden` oculta `QuickNav`, la app de debajo queda inerte y
ninguna otra capa con `useBackToClose` puede abrirse sobre la ronda. La actualización de la PWA no se aplica
mientras la ronda está abierta, porque la ronda es un `[role="dialog"]`.

## Hallazgos nuevos

- **[6] `apps/web/src/features/rpd/useHistorySettled.ts:31-38` + `roundRules.ts:154-158` + `RpdPlayPage.tsx:433-438`:
  después de recargar en mitad de la ronda, «Salir» deja de funcionar.**
  - **Cómo pasa.** Al recargar con la guardia puesta, se queda arriba la entrada de la guardia: una copia con
    `backToClose`, la misma URL y `usr = OPENED_FROM_RPD`. Esa entrada ya no es de nadie. El borrador sigue en
    `sessionStorage`, así que la ronda vuelve a «¿Preparados?». Recargar en mitad de la ronda es justo lo que se hace
    si un vídeo se atasca: F5 en el portátil junto a la tele, o deslizar hacia abajo en Chrome o Safari del móvil, porque
    no hay `overscroll-behavior`.
  - **Qué falla.** Con «Salir» en «¿Preparados?» o en «Ronda terminada», el hook ve una entrada de capa y ningún
    `popstate`, así que espera. A los 400 ms se rinde y `leave` hace `navigate(-1)`. Ese paso cae en la entrada de
    `/rpd/jugar` de debajo, con la misma URL y la misma `key`, así que la página no cambia. Pero `left.current` y
    `leaving` quedan a `true` para siempre. A partir de ahí:
    - «Salir» y la «Salir» de la barra (`exit` hace `if (leaving) return`) no hacen nada.
    - Esc, Espacio, → y R tampoco (el `return` temprano por `leaving`).
    - La guardia de Atrás no se vuelve a poner.
  - **Cuándo pasa.** Basta con jugar la ronda entera después de recargar. La guardia se quita al terminar y su `back()`
    vuelve a caer en la entrada vieja, que nadie limpia. Solo se limpia si antes se abre y se cierra la confirmación,
    porque entonces llega un pop. Con la entrada vieja en medio, además, la guardia y «¿Salir de la ronda?» tardan
    400 ms en salir.
  - **Gravedad.** Solo se sale con el Atrás del sistema, y sin pregunta. La app instalada (`standalone`) no tiene botón
    Atrás, aunque ahí recargar es difícil.
  - **Arreglo.** Distinguir un `back()` nuestro que está en camino de una entrada vieja:
    - Que `useBackToClose` exporte `ownBackPending()` (`ownPops > 0`).
    - Que `historySettleStep` dé el paso atrás también sin `popstate` cuando no hay nada nuestro en camino:
      `historySettleStep(onLayer, popped || !ownBackPending(), backs)`.
    - Por si acaso, en `leave`: si al terminar de esperar `history.state` sigue siendo de una capa, o si después del
      pop seguimos en `/rpd/jugar`, usar `navigate('/rpd', { replace: true })`. Así nunca se queda muerto.
    - Añadir un test del caso «entrada vieja sin back en camino → back».
- **[2] `apps/web/src/features/rpd/RpdPlayPage.tsx:447-456`: dos toques en «Salir» antes de que salga el diálogo.**
  - **Problema.** `exit` no mira `confirmExit`. Con un segundo toque, o con Esc y luego un toque, en el rato que tarda
    el diálogo en salir (unos milisegundos, o 400 ms con N1), `pausedForExit` se vuelve a calcular con la ronda ya
    pausada y queda en `false`. Entonces «Seguir en la ronda» no la reanuda.
  - **Arreglo.** `if (leaving || confirmExit) return;`
- **[2] `apps/web/src/features/bags/BagPage.tsx:247` y `apps/web/src/features/rpd/TrackPage.tsx:146`: «Salir» no vuelve
  a la bolsa ni a la pista.**
  - **Problema.** Estas dos pantallas abren la ronda sin `state`, así que «Salir» pone `/rpd` en el lugar de la ronda y
    no vuelve a la bolsa o a la pista de la que se venía. Antes pasaba lo mismo (`navigate('/rpd')`), así que no es una
    regresión.
  - **Arreglo (opcional).** Pasar un `state` genérico, por ejemplo `{ openedFrom: 'app' }`, y que `leaveRoundBy`
    responda `back` cuando la ronda se abrió desde dentro de la app.
- **[1] `apps/web/src/features/rpd/useHistorySettled.ts:5`: si el `popstate` tarda más de 400 ms (un móvil muy lento).**
  - **Problema.** La entrada o la navegación nuevas se ponen encima de un `back()` que aún está en camino. Es la
    carrera de antes, ahora muy improbable: se arregla sola cuando llega el siguiente pop, o con N1.
  - **Arreglo.** Ninguno por ahora. Basta con tenerlo apuntado.

## Veredicto

Los hallazgos de la ronda 2 están corregidos sin regresiones. La barra «Elegir para votar» cabe a 360 y a 390 px:
«Crear votación» pasa a dos líneas a 360 sin desbordar y deja unos 26 px de aire con el botón flotante. «Cancelar» solo
con el icono se sigue llamando «Cancelar». En el uso normal, el historial ya no deja entradas de más, nunca sale sin
preguntar y nunca da un paso atrás fuera de la app. Lo he comprobado al abrir desde `/rpd`, desde una bolsa, desde una
pista y desde un enlace directo.

**Sí, hay un hallazgo de nota 6**, que se corrige sí o sí. Después de recargar en mitad de la ronda queda una entrada
de capa vieja y nadie la limpia. Entonces «Salir» (en «¿Preparados?» o en «Ronda terminada») da un paso atrás que cae
en la misma URL. La ronda se queda en «saliendo»: «Salir», Esc, los atajos y la guardia de Atrás quedan muertos, y solo
se sale con el Atrás del sistema. El arreglo cabe en `useHistorySettled` y `useBackToClose`: dar el paso atrás sobre la
entrada vieja cuando no hay ningún `back()` nuestro en camino, y en `leave` cambiar a `replace` si la ronda no llega a
cambiar de URL. Hay que añadirle un test. Los de nota 2 y 1 pueden ir a pendientes, aunque el de los dos toques en
«Salir» es una línea.
