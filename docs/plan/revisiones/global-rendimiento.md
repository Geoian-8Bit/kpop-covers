# Revisión global · rendimiento (17-10)

Revisor de solo lectura: `pnpm build` con sourcemaps y lectura del código. Más las medidas en producción (Chrome DevTools).

## Medidas en producción

- Portada en frío (escritorio, sin limitar): LCP 736 ms (miniatura de YouTube, retraso de carga por la cadena JS → grupo → vídeos), CLS 0,04.
- Estudio con un clip en bucle (espejo, YouTube silenciado): 58 fps, p95 16,9 ms por fotograma, 0 tareas largas.
- Lighthouse (instantánea, móvil): accesibilidad 95, buenas prácticas 100, SEO 80.

## Tamaños (gzip)

Camino crítico de la biblioteca: entry 54,8 kB, react 83,3, supabase 58,5, motion 46,1, query 11,4, iconos 8,7, CSS 22,3 → unos 285 kB.
Estudio (perezoso, precargado en reposo): unos 120 kB. Postura (perezosa, fuera del precache): tfjs 272,7 kB, mediapipe 40,6 kB.
Precache del SW: 77 entradas, 1,66 MiB sin comprimir (566 kB gzip); no arrastra nada pesado.

## Hallazgos

| Id | Nota | Qué | Dónde |
| --- | --- | --- | --- |
| P1 | 8 | El repaso entero se vuelve a pintar 60 veces por segundo (se suscribe al tiempo para un booleano) | `ReviewScreen.tsx:227`, `ReviewControls.tsx:54` |
| P2 | 7 | Arranque en cascada (JS → grupo → vídeos) sin caché entre aperturas | `CrewProvider.tsx`, `App.tsx`, `data/videos.ts` |
| P3 | 7 | Abrir un vídeo espera una petición antes de crear el reproductor, aunque la lista ya tenga los datos | `StudioPage.tsx:238`, `data/videos.ts` |
| P4 | 6 | El grabador está siempre montado y en el chunk del estudio; al grabar, 5 + 60 repintados por segundo del componente raíz | `StudioPage.tsx`, `RecordStudio.tsx` |
| P5 | 5 | Las secciones perezosas no se precargan ni dan señal al tocar | `App.tsx`, `AppShell.tsx` |
| P6 | 5 | Pósteres en base64 dentro de la fila del vídeo y recarga de la lista al volver | `localVideos.ts`, `App.tsx` |
| P7 | 5 | El chunk de supabase incluye auth y realtime que no se usan (~40 kB gzip) | `lib/supabase.ts` |
| P8 | 5 | El aviso del próximo evento empuja la biblioteca al llegar | `NextEventBanner.tsx`, `LibraryPage.tsx` |
| P9 | 4 | Fuentes de Google bloquean el primer pintado | `index.html` |
| P10 | 4 | El reloj del repaso sigue con `requestAnimationFrame` en pausa | `ReviewMedia.tsx` |
| P11 | 4 | Miniaturas `hqdefault` en tarjetas pequeñas; caché de 40 miniaturas | `youtube.ts`, `vite.config.ts` |
| P12 | 3 | Controles del zoom repintados con cada cambio de zoom al seguir a alguien | `ZoomControls.tsx`, `FollowStageLayer.tsx` |
| P13 | 3 | motion completo en el camino crítico | `motion/react` |
| P14 | 3 | tailwind-merge en el entry | `lib/cn.ts` |
| P15 | 2 | Demos del laboratorio en el precache; Splash con filtro SVG animado | `vite.config.ts`, `App.tsx` |

Sin hallazgo: reloj del reproductor cuantizado o pintado por DOM, bucle que se duerme en pausa, actualizaciones optimistas en todas las listas, `memo` en tarjetas, temporizadores con limpieza, sondeo de votos pausado en segundo plano.
