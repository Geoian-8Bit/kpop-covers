# Revisión global · accesibilidad y usabilidad (17-10)

Revisor de solo lectura sobre todo lo añadido desde `6b9e4d3`. WCAG 2.2 AA y respuesta de la interfaz. Contrastes calculados con los tokens de `index.css`.

| Id | Nota | Qué | Dónde |
| --- | --- | --- | --- |
| A11Y-01 | 8 | El anillo de foco desaparece en los botones rellenos: el `clip-path` de la piel Kamon recorta el `outline` (2.4.7) | `index.css` (`.skin-btn`, foco), `ui/Button.tsx` |
| A11Y-02 | 7 | Los diálogos de confirmación sin botón de cerrar abren con el foco en la acción destructiva | `ui/Dialog.tsx:64` y 11 diálogos |
| A11Y-03 | 6 | Texto del botón principal (washi sobre `shu-500`) a 3,9:1; 2,8:1 en hover | `Button.tsx:21`, `index.css` |
| A11Y-04 | 6 | Reordenar con teclado: asa tabulable inútil, el foco cae a `body` en los extremos, sin anuncio de la posición | `Ballot.tsx`, `EventPage.tsx`, `TrackPage.tsx` |
| A11Y-05 | 6 | Sin título por página, sin foco al cambiar de ruta, sin «Saltar al contenido» | `index.html`, `App.tsx`, `AppShell.tsx` |
| A11Y-06 | 5 | Botón con foco que pasa a `disabled` al cargar pierde el foco | `Button.tsx` y varios |
| A11Y-07 | 5 | Menú móvil sin gestión de foco; la navegación principal en móvil está tras «Cuenta»; `WhoButton` con `menuitem` fuera de menú | `AppShell.tsx`, `MembersUI.tsx` |
| A11Y-08 | 5 | La pantalla de la ronda no se anuncia; `useInertOutside` deja inertes los toasts | `RandomPlayScreen.tsx`, `RpdPlayPage.tsx` |
| A11Y-09 | 5 | El zoom ampliado no se puede mover sin arrastrar | `ZoomControls.tsx`, `ZoomLayer.tsx` |
| A11Y-10 | 5 | Grupos de radios sin flechas (cada opción es un tabulador) | `Segmented.tsx`, `Ballot.tsx` y otros |
| A11Y-11 | 5 | Tras una acción del menú ⋯ que abre un diálogo se pierde el foco | `wishes/ActionMenu.tsx` |
| A11Y-12 | 5 | Quitar del repertorio o de la pista sin confirmar ni deshacer; confirmación de bolsa que caduca a 2,6 s | `EventPage.tsx`, `TrackPage.tsx`, `BagPage.tsx` |
| A11Y-13 | 4 | Texto pequeño con `opacity` por debajo de 4,5:1 | `EventsPage.tsx`, `EventPage.tsx`, `BagPage.tsx` |
| A11Y-14 | 4 | Los toasts de error desaparecen a los 5,2 s sin pausa; semántica viva duplicada | `ToastProvider.tsx` |
| A11Y-15 | 4 | Nombres ambiguos («Sacar a mano», «Uno más») o `aria-label` en `span` sin rol | `BagPage.tsx`, `RoundOptionsFields.tsx`, `WishesPage.tsx`, `Ballot.tsx` |
| A11Y-16 | 4 | Resultados asíncronos sin anunciar (mezclar, sortear, cerrar votación) | `RpdPage.tsx`, `BagDrawStage.tsx`, `PollPage.tsx`, `Pickers.tsx` |
| A11Y-17 | 4 | Controles tapados por «¿Preparados?» siguen tabulables; «Terminar» en reposo | `RpdPlayPage.tsx`, `RoundControls.tsx` |
| A11Y-18 | 4 | Copys incoherentes: Eliminar/Borrar/Quitar, Añadir/Meter en una bolsa, «Próxima coreo»/«Próxima cover» | varios |
| A11Y-19 | 3 | Cada `Spinner` es un `role="status"`, también dentro de los botones | `Spinner.tsx`, `Button.tsx` |
| A11Y-20 | 3 | Atajos de la ronda sin comprobar modificadores (Ctrl+R repite el clip) | `RpdPlayPage.tsx` |
| A11Y-21 | 3 | Objetivos táctiles de 32–36 px en la ronda | `RoundOptionsFields.tsx`, `RpdPlayPage.tsx` |
| A11Y-22 | 3 | «Recomendada» del laboratorio a 4,2:1; `formKey` de la bolsa; reacciones que fallan sin mensaje | `DesignLabSection.tsx`, `BagSettingsDialog.tsx`, `ReactionBar.tsx` |

Estado: movimiento reducido bien cubierto. Lo grave es transversal (foco invisible, foco por defecto en diálogos destructivos, contraste del botón principal, rutas sin título ni foco).

Lighthouse en producción (instantánea, móvil, estudio y /deseos): accesibilidad 95, buenas prácticas 100, SEO 80. Fallos: `menuitem` sin menú, nombres accesibles que no contienen el texto visible (logo, «Añadir archivo», «Bucle»), `robots.txt` servido como HTML. Esos tres ya están corregidos en local.
