# Diseño

Mundo: **taller de grabado ukiyo-e de noche**. Tinta sumi, papel washi, el índigo de Prusia de *La gran ola de
Kanagawa*, sellos hanko en bermellón y composición **bento**. Moderno y sobrio: sin neón, sin brillos, sin
glassmorphism, sin degradados decorativos.

El mundo aporta solo cuatro cosas (modo Operate): tipografía, paleta, densidad y un gesto propio. Los controles son
controles web estándar.

## Paleta (`apps/web/src/index.css`)

| Token        | Valor     | Uso                                                        |
| ------------ | --------- | ---------------------------------------------------------- |
| `sumi-900`   | `#1b1916` | fondo negro tinta bajo el seigaiha índigo                  |
| `sumi-850/800` | `#252220` / `#2e2a27` | paneles laca urushi (brillo arriba, sombra en capas) |
| `washi`      | `#f3ecdf` | texto principal, botón de reproducir, pestaña activa       |
| `washi-muted/subtle` | `#d3c8b5` / `#b0a491` | texto secundario / metadatos            |
| `ai-*`       | `#4d73a3`… | índigo: líneas del seigaiha, ola, interruptores activos, clip activo |
| `shu-500`    | `#d0452d` | bermellón: botón principal (sello con filete), play, sellos, marcas A/B |
| `kin-300`    | `#e4c88f` | oro viejo: cabezal de reproducción, foco                   |

Colores de clip = tintes tradicionales: enji, murasaki, fuji, sakura, kincha, rokushō.

## Tipografía

- **Shippori Mincho B1** (700–800): titulares y kanji decorativos (稽古帳, 鏡, 速, 反復).
- **Zen Kaku Gothic New**: interfaz.
- **JetBrains Mono** con cifras tabulares: tiempos y velocidades (son medidas).

## Superficies y textura

- Estructura: barra lateral (escritorio) o barra superior (móvil); cada página es **una sola lámina** dividida por reglas
  doradas, no tarjetas sueltas. Estudio = editor: escenario · ola · controles en columnas · tramo | columna de clips.
  En móvil la lámina mantiene un margen (10 px) y esquinas, el vídeo queda fijo arriba y los vídeos van en filas compactas.
- `paper` / `paper-raised`: laca urushi — brillo suave arriba, filete dorado (maki-e) 4 px dentro del borde y sombras en
  capas para que cada panel flote sobre el fondo. `well`: hueco tallado para inputs, pistas y grupos de opciones.
- Botones rellenos llevan un filete interior como el borde tallado de un hanko; títulos de sección = mincho + regla + kanji
  en bermellón (`SectionTitle`).
- `seigaiha` (青海波): única textura, cubre toda la app de forma uniforme (sin degradado ni movimiento).
- `Seal`: sello hanko con borde de tinta irregular (filtro SVG `#ink-rough`).

## Gesto propio

La **línea de tiempo es una ola**: la cresta se rellena de índigo y su espuma se vuelve blanca a medida que suena la
canción; el tramo A–B es una banda bermellón con sellos A/B arrastrables. Al activar el espejo se estampa un sello
鏡 sobre el vídeo.

## Movimiento (`apps/web/src/lib/motion.ts`)

- `jelly` (muelle con rebote tipo mochi): interruptores, pestañas, pulsaciones, sellos.
- `soft`: diálogos y tiles. `snappy`: cambios de posición.
- `inkReveal`: un único momento autoral, los titulares se descubren como un trazo de pincel.
- El espejo voltea el vídeo con un muelle en `scaleX`.
- `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion`.

## Accesibilidad

Foco visible oro viejo, diálogos con trampa de foco y `Esc`, objetivos ≥ 44 px, `role="switch"`, `radiogroup` y
`slider` donde toca, contraste ≥ 4.5:1 en texto.
