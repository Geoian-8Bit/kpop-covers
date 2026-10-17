# Revisión global · base de datos, datos y API (17-10)

Revisor de solo lectura. `pnpm db:test` pasa (19 migraciones, 84 PASS). Sin secretos en el cliente; la clave de YouTube solo en el servidor; sin `service_role` en `src`. La última `archive_row` cubre las 17 tablas archivables. Ningún hallazgo de nota 6 o más.

| Id | Nota | Qué | Dónde | Estado |
| --- | --- | --- | --- | --- |
| H1 | 5 | El bucket `videos` no tiene tope de bytes; si se llena, bloquea las tomas | `linked_file_guard`, `takes` | PENDIENTE |
| H2 | 5 | Los topes cuentan filas, no bytes (dibujos de notas, recorridos, miniaturas): un script podría llenar la BD; `listNotes` trae los dibujos siempre | migraciones de notas y recorridos, `backend.ts:216` | PENDIENTE |
| H3 | 4 | `close_poll` en ranking puntúa con el número de candidatas vivas actual y el puesto de entonces: archivar una candidata da puntos 0 o negativos | `20261016080000` | Corregido (migración `20261017010000`) |
| H4 | 4 | Límite por IP de la búsqueda de YouTube por instancia; cuota diaria agotable | `api/youtube-search.ts` | PENDIENTE (regla de firewall o contador global, fuera del código) |
| H5 | 4 | `follow_paths` sin tope por canción ni validación de la forma de los puntos | `follow_paths`, `backend.ts` | PENDIENTE |
| H6 | 3 | Un cliente puede cerrar una votación con un PATCH directo y elegir ganadora entre las opciones | `wishes_and_polls` | PENDIENTE |
| H7 | 3 | Reordenar pistas y repertorio son N peticiones no atómicas | `backend.ts` | PENDIENTE |
| H8 | 3 | Votos y «Me apunto» de miembros archivados siguen contando | `wishes_and_polls` | Votos corregidos (`20261017010000`); «Me apunto» PENDIENTE |
| H9 | 3 | Listados por canción sin paginar (corte en 1000); `.in()` con muchas votaciones | `backend.ts` | PENDIENTE |
| H10 | 3 | CSP solo Report-Only y sin destino de informes; WASM de MediaPipe sin SRI | `vercel.json` | PENDIENTE |
| H11 | 3 | Ninguna prueba genérica de que toda tabla archivable llegue a `archive_row` | `supabase/tests` | PENDIENTE |
| H12 | 2 | `updated_at` lo elige el cliente en pistas y recorridos | `stamp_new_row` | PENDIENTE |
| H13 | 2 | Carreras menores en las subidas (dos a la vez pueden pasar un tope) | `take_object_allowed`, `video_object_allowed` | PENDIENTE |

Salud: RLS y triggers coherentes; los riesgos que quedan son abuso por volumen con la clave pública y coherencia del recuento, no lectura o escritura entre grupos.
