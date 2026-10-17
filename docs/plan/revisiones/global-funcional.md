# Revisión global · funcional e integración (17-10)

Revisor de solo lectura. `pnpm typecheck` y `pnpm test` pasan. Nada pierde datos ni rompe la app; ningún hallazgo llega a 6. Los selectores de zustand devuelven primitivos o referencias estables (sin riesgo del error #185).

| Id | Nota | Qué | Dónde |
| --- | --- | --- | --- |
| F1 | 5 | Un clip recién creado no sale en Random Play Dance ni en los selectores de bolsas hasta 5 min después | `data/clips.ts`, `data/bags.ts` |
| F2 | 4 | «Añadir a la biblioteca» desde un deseo usa la lista de vídeos en caché (puede duplicar o fallar con un vídeo archivado) | `data/wishes.ts` |
| F3 | 4 | Borrar un clip o un vídeo deja viejas las cachés de RPD, bolsas, eventos y recorridos | `data/clips.ts`, `data/videos.ts` |
| F4 | 4 | «Guardar zoom con el clip» no sirve en un clip que sigue a alguien (el seguimiento lo pisa al reabrir) | `ZoomControls.tsx`, `SaveClipDialog.tsx` |
| F5 | 4 | Tras crear o borrar desde un diálogo, «Atrás» cae en una entrada de historial sobrante o en la ficha borrada | `PollFormDialog.tsx`, `EventsPage.tsx`, `AddVideoDialog.tsx`, páginas de detalle |
| F6 | 3 | «Jugar la ronda» no hace nada si la caché de elementos de la bolsa está vieja | `BagPage.tsx` |
| F7 | 3 | Un miembro archivado sigue contando en «Me apunto» y en «N personas han votado» | `WishesPage.tsx`, `PollPage.tsx` |
| F8 | 3 | Un móvil cuyo miembro fue archivado ya no pregunta «¿Quién eres?» | `data/members.ts` |
| F9 | 3 | Al cambiar el archivo vinculado, los recorridos de seguimiento siguen siendo del anterior | `data/videos.ts`, `follow_paths` |
| F10 | 3 | Un deseo añadido a la biblioteca desaparece si luego se archiva ese vídeo | `wishRules.ts`, `PollPage.tsx` |
| F11 | 3 | Abrir un clip que ya no existe (`?clip=`) no avisa | `StudioPage.tsx` |
| F12 | 3 | Si «Añadir a una bolsa» falla en parte, el aviso no dice cuántos entraron | `BagPage.tsx` |
| F13 | 2 | Una reacción que falla restaura toda la caché de reacciones | `data/reactions.ts` |
| F14 | 2 | «Proponer» queda bloqueado si la consulta del título de YouTube se cuelga | `WishFormDialog.tsx` |

Salud: los fallos reales vienen de las cachés de React Query entre funciones (5 min) y del historial de los diálogos. Sin bloqueantes para desplegar.
