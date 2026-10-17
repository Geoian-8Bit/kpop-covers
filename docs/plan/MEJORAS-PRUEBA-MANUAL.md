# One Shoot · Mejoras de la prueba manual

Notas del responsable del producto mientras prueba la app a mano en producción (https://kpop-covers.vercel.app),
sobre todo en el móvil. Cada punto es un cambio pedido para que lo haga otro agente.

## Para el agente que haga estos cambios

- Lee antes `CLAUDE.md`, `docs/plan/ESTADO-IMPLEMENTACION.md` (qué hay y cómo probarlo) y este documento.
- El 90–95 % del uso es en móvil: revisa y prueba primero a tamaño de móvil, con toques reales.
- Todas las pruebas en el navegador, en silencio (el demo ya se silencia con `apps/web/src/lib/devSilence.ts`).
- Interfaz en español de España; colores solo con los tokens de `index.css`; animaciones con los presets de
  `src/lib/motion.ts`.
- Cambios de base de datos: migración nueva, nunca editar una publicada; copia de seguridad antes de aplicarla.
- Al terminar cada punto, márcalo como hecho aquí (con el commit) y apúntalo en `docs/plan/PROGRESO.md`.
- Si un punto no está claro, pregunta antes de inventar.

Estados: **Pendiente** · **En curso** · **Hecho** (commit) · **Descartado** (motivo).

## Mejoras pedidas

| # | Zona | Qué cambiar | Prioridad | Estado |
| --- | --- | --- | --- | --- |
| 1 | Navegación en móvil | Sacar las secciones del menú «⋯» y llevarlas a un menú de acciones rápidas abajo a la derecha, con un diseño creativo y animado (4 prototipos para elegir). Detalle abajo | Alta | Pendiente |
| 2 | Menú «⋯» · versión | El menú «⋯» queda solo para la política (Privacidad y condiciones de YouTube) y el número de versión, que sube en cada despliegue, con un botón «Buscar actualización» que descarga y aplica la nueva. Detalle abajo | Alta | Pendiente |

### 1 · Menú de acciones rápidas abajo a la derecha (móvil)

**Qué hay hoy.** En móvil, la barra de arriba tiene el botón «Menú» (`AppShell.tsx`, `role="menu"`) con todo dentro:
las 5 secciones (`MAIN_NAV`: Biblioteca, Bolsas, Próxima cover, Random Play Dance, Eventos), «Instalar app»,
«¿Quién eres?», Ajustes y Privacidad y condiciones. En escritorio está el carril lateral, **que se queda como está**.

**Qué quiere el responsable.**
- En móvil, las secciones salen del menú de arriba y pasan a un botón flotante abajo a la derecha, donde el pulgar
  llega y donde suelen estar las acciones rápidas en el móvil.
- No una barra inferior simple ni un desplegable: algo bonito, con animación y un panel distinto e innovador, con la
  estética de la app (washi, laca, kamon, sellos bermellón y oro).
- Le gusta mucho la idea del **Abanico** de los ajustes del grabador (`features/record/settings/RecorderSettingsFan.tsx`):
  aquí sería un abanico que se abre desde la esquina inferior derecha y la cubre con su ángulo (un cuarto de círculo),
  con una varilla por opción.
- Quiere **4 prototipos para elegir**: el abanico y otros 3 creativos. Propuestas (el agente puede afinarlas o cambiar
  alguna si encuentra algo mejor, pero tienen que encajar con la estética):
  1. **Sensu (abanico de esquina).** Botón redondo con un kamon en la esquina. Al tocarlo, un abanico de washi y laca se
     despliega en un cuarto de círculo hacia arriba y a la izquierda, con física de muelle; cada varilla es una
     sección con su icono y su kanji. La sección actual tiene la varilla en bermellón.
  2. **Hanafuda (mano de cartas).** Del botón salen cartas de hanafuda que se abren en abanico como una mano de naipes,
     cada una con la ilustración y el kanji de su sección. La carta que toca el pulgar se eleva; al soltar, vuela al
     centro y lleva a la sección.
  3. **Rueda de kamon (dial).** Un sello circular grande asoma desde la esquina (solo se ve un cuarto). Las secciones
     están en su borde, como en un dial: se gira con el pulgar arrastrando y la que queda en la muesca dorada se
     resalta; tocar cualquiera también lleva. Ligera vibración en cada paso si el móvil lo permite.
  4. **Origami (papel que se despliega).** Un cuadrado de washi doblado en la esquina se despliega en pliegues
     (animación de papel) hasta formar un panel con las secciones en sus caras; al cerrar, se vuelve a doblar.
- Cómo comparar: construir los 4 como prototipos temporales (por ejemplo, un selector en una ruta oculta o en una
  vista previa de Vercel) para que el responsable los pruebe en su móvil. **Cuando elija uno, se borran los otros
  tres** y su selector (como se hizo con el laboratorio de diseño).

**Qué va en el menú de abajo.** Las 5 secciones seguro. «¿Quién eres?», Ajustes e «Instalar app» están **por
confirmar** con el responsable (propuesta: Ajustes y «¿Quién eres?» abajo, «Instalar app» arriba en «⋯»).

**Requisitos que no pueden faltar.**
- Pensado para el pulgar derecho: el botón dentro de la zona segura (`env(safe-area-inset-*)`), con objetivos de 44 px.
- No tapar controles: se oculta o se aparta en el estudio (`/v/…`) si choca con el reproductor, y no sale en la
  ronda de Random Play Dance a pantalla completa ni con el grabador abierto. Revisar cada página a 390×844.
- Se cierra con «Atrás» de Android, con Esc, al tocar fuera y al elegir una opción. Foco atrapado dentro mientras está
  abierto y devuelto al botón al cerrar; nombres accesibles; el botón dice en qué sección estás.
- Con «reducir movimiento», sin muelles ni giros: aparece con un fundido.
- Fluido a 60 fps en un móvil medio (solo `transform` y `opacity`).

### 2 · Número de versión y «Buscar actualización»

**Qué quiere el responsable.** El menú «⋯» de arriba queda solo para:
- la política (Privacidad y condiciones, con los términos de YouTube: `/privacidad`);
- el **número de versión**, que sube en cada despliegue, para saber si la app instalada es la última;
- un botón para **buscar si hay versión nueva** y, si la hay, descargarla y aplicarla al momento.

**Cómo funciona hoy la actualización** (`apps/web/src/main.tsx`): el service worker baja la versión nueva en segundo
plano y la aplica sola en un momento seguro (fuera del estudio y sin diálogos abiertos); la app instalada lo comprueba
cada hora. No hay número de versión visible ni botón.

**Qué hacer.**
- Un número que suba solo en cada despliegue, sin acordarse de cambiarlo a mano. Por ejemplo, el número de commits de
  `main` en el momento de construir (`git rev-list --count HEAD`), inyectado con `define` de Vite, más la fecha. Se
  muestra como «Versión 142 · 17-10-2026». Comprobar que en Vercel el clon tiene historial suficiente; si no, usar
  otro contador fiable.
- El botón «Buscar actualización» llama a `registration.update()` y da respuesta clara:
  - «Buscando…» mientras busca;
  - «Ya tienes la última versión (142)» si no hay nada;
  - «Hay una versión nueva (143). Actualizando…» y la aplica (recarga) si la hay.
  Si se pulsa dentro del estudio o con algo a medio guardar, avisa antes de recargar.
- Que funcione igual en la app instalada (Android) y en el navegador.

## Probado y correcto

Lo que el responsable ya probó y le parece bien, para no tocarlo sin motivo.

| Zona | Comentario |
| --- | --- |
