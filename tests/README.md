# Tests de regresión — Partes de Locomoción

Batería automatizada que prueba la app en un navegador real (Playwright/Chromium): rellena formularios, cambia entre matrículas, edita, borra y genera PDFs como lo haría un usuario, y comprueba que los datos guardados son exactamente los esperados.

**Regla de oro: ejecutar SIEMPRE antes de cada deploy.** Si algún test falla, no subir.

## Requisitos (una sola vez)

Node.js y Playwright. En WSL/Linux:

```bash
mkdir -p ~/scratch/pw-prueba && cd ~/scratch/pw-prueba
npm i playwright
npx playwright install chromium
# si faltan librerías del sistema: npx playwright install-deps chromium (o via apt como root)
```

## Ejecutar

Desde la raíz del repo:

```bash
bash tests/run_tests.sh
```

El script sirve el repo en `http://localhost:8899` (si no hay ya un servidor), lanza todos los `tests/test_*.js` y termina con `RESULTADO GLOBAL`. Si Playwright está instalado en otra ruta: `PW_DIR=/ruta bash tests/run_tests.sh`.

## Qué cubre cada archivo

| Archivo | Cubre | Origen |
|---|---|---|
| `test_adversarial.js` | Coma decimal en euros/litros, aviso de importe > 400 €, fecha de repostaje fuera del mes, conductores repetidos con y sin acentos, tope de 14 repostajes | Testing adversario (v103) |
| `test_ambiguo.js` | Autofill conductor→matrícula con conductor de varios vehículos (5 escenarios) | Bug real (jul 2026) |
| `test_bugs_2_3_4_5.js` | Guards de confirmación en `resetForm` de los 3 módulos | Bugs reales |
| `test_comb_sin_mes.js` | Parte combustible sin mes tras cerrar el aviso del PDF o pulsar "Nuevo": Guardar avisa y no dice "Parte guardado", cambiar de matrícula no pierde el repostaje, elegir mes lo guarda en ese mes y no en el del parte anterior; sin matrícula, cambiar de mes avisa; controles del flujo normal y de Generar PDF | Bug real (auditoría 2026-11-25) |
| `test_comb_regression.js` | Contaminación cruzada de repostajes entre vehículos (A→B→A) | Bug real reportado en beta |
| `test_regresion_e2e.js` | Flujo completo de los 3 módulos: rellenar → guardar → PDF | Regresión general |
| `test_nuevos_bugs.js` | Merge por timestamp (réplica) + XSS en nombre de conductor | Bugs reales |
| `test_mergeData.js` | Merge de vehículos/históricos al reconectar JSON (réplica) | Bug real |
| `test_stripOldPhotos.js` | Purga de fotos >3 meses de localStorage con el `storage.js` real (API de archivos simulada) | Feature v97/v102 |
| `test_mensual_multi.js` | Parte combustible: 3 vehículos/4 conductores, aislamiento total, km por vehículo, meses, edición, borrado, PDFs | Exploratorio |
| `test_diario_multi.js` | Parte diario: varios vehículos/conductores, autofills, validaciones, PDF | Exploratorio |
| `test_edicion_multi.js` | Edición en los 3 módulos, incl. reindexado de fotos al borrar un repostaje intermedio | Exploratorio |
| `test_or_quota.js` | Almacenamiento lleno al guardar una orden: solo la clave de órdenes, lleno del todo (falla antes la BD de vehículos), `code 22`, error que no es de cuota, edición, reintento tras liberar espacio, archivo vinculado | Bug real (auditoría 2026-09-01) |
| `test_readFile_corrupto.js` | Archivo vinculado dañado en `setup()`, `init()` y `reconnect()`: aviso, archivo NO sobreescrito, localStorage intacto; archivo vacío; JSON válido que no es un objeto (`null`, `[]`, `5`, `"texto"`); controles con archivo válido | Bug real (auditoría 2026-09-01) |
| `test_xss_historico.js` | Parte combustible con HTML en importes, fotos y mes (JSON manipulado): no se ejecuta ni en el historial ni al cargarlo en el formulario | Bug real (auditoría 2026-09-01) |
| `test_ls_lleno.js` | `localStorage` lleno de verdad (cuota real de Chromium) con fotos de combustible recientes: con archivo conectado no avisa, la copia local va sin fotos y la app las sigue viendo; otra clave hace sitio quitando esas fotos; sin permiso el aviso pide Reconectar; sin archivo, pide vincularlo; `reconnect()` recupera fotos quitadas sin resucitar las borradas | Bug real (oct 2026, JSON de 6 MB) |
| `test_sin_sincronizar.js` | Archivo vinculado sin permiso: guardar o borrar deja la marca `partes_fs_sin_sincronizar` y `init()` con permiso combina en vez de pisar; sin marca no resucita lo borrado en otro equipo; archivo dañado o fallo de escritura conservan la marca; `reconnect()`/`setup()` la borran; marca con `localStorage` lleno; avisos "Pulsa Reconectar" en órdenes y parte diario; parte diario con vehículo nuevo y almacenamiento lleno avisa en vez de no hacer nada | Bug real (oct 2026) |
| `test_comb_lleno.js` | Parte combustible con `localStorage` lleno (cuota real): Guardar con vehículo nuevo o conocido avisa, no dice "Parte guardado" y conserva el borrador; aviso "Reconectar" con archivo pendiente; Generar PDF genera el PDF aunque no se guarde; cambiar de matrícula, de mes o "+ Nuevo" no vacía el formulario si no se ha podido guardar; control con espacio libre | Bug real (oct 2026) |
| `test_fechas_purga.js` | Purga de 6 meses de combustible y órdenes y de fotos en `localStorage` los días 29-31 (el corte no salta un mes); fecha por defecto del parte diario en hora de España a las 00:30 (verano e invierno), tras "Nuevo" y tras guardar | Bug real (nov 2026) |
| `test_pdf_tamano.js` | PDFs comprimidos (`FlateDecode`) en los 3 módulos; PDF mensual del parte diario con 10 días firmados: una página por día y < 1 MB | Bug real (oct 2026, PDFs de varios MB) |

`tests/_comun.js` no es un test: tiene utilidades compartidas y `run_tests.sh` no lo ejecuta.

## Escribir un test nuevo

Abrir las páginas siempre con `nuevaPagina(browser)` (o `nuevaPagina(browser, opciones)`) de `tests/_comun.js`, nunca con `browser.newPage()`:

- Fija el "hoy" del navegador en `HOY_TESTS` (2026-07-15). Los datos sembrados con fechas de julio de 2026 no caducan por las purgas de 3 meses, sea cual sea la fecha real.
- Para probar otra fecha u hora: `nuevaPagina(browser, { timezoneId: 'Europe/Madrid' }, '2026-10-31T10:00:00Z')`. Usar `Z` en la hora para que no dependa de la zona horaria de Node.
- Espera a que el Service Worker controle la página. Si no, la recarga que hace la app en la primera instalación del SW puede caer a mitad de test y borrar lo rellenado.

Para probar el archivo JSON vinculado, `page.addInitScript(stubFS)` (también de `_comun.js`) simula la API de archivos: el contenido del archivo está en `window.__fileText`, el permiso en `window.__perm` y los `alert()` quedan en `window.__alerts`.

## Avisos de mantenimiento

- `test_mergeData.js` y la primera parte de `test_nuevos_bugs.js` contienen una **réplica** de `mergeData()` de `storage.js` (es función privada). Si se modifica `mergeData()` en `storage.js`, actualizar la réplica o los tests darán falsa confianza. `test_stripOldPhotos.js` sí prueba el `storage.js` real.
- Playwright **auto-cancela** los `confirm()`/`alert()` si el test no registra `page.on('dialog', ...)` — puede producir falsos fallos (documentado en CLAUDE.md).
- Lo que esta batería NO cubre: dispositivos móviles reales, la cámara, el diálogo real de permisos del archivo JSON y la actualización del Service Worker en clientes.
