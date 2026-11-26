# Errores — Partes de Locomoción (prueba)

Registro consolidado de errores/incidencias reales con causa raíz y solución.
Formato por entrada: **Síntoma / Causa / Solución**. Las entradas históricas se
referencian por la versión del Service Worker en la que se corrigieron.

---

## 2026-11-26 — Una versión nueva puede instalarse con los archivos de la anterior

- **Síntoma:** encontrado al probar la actualización de v108 a 2026.11.2 con un servidor local, sin que lo haya reportado ningún usuario. Pasa con cualquier versión, también en v108. Si la versión nueva se instala poco después de la anterior, sale el aviso "Nueva versión disponible", se pulsa Actualizar y la caché pasa a llamarse como la nueva, pero las páginas siguen siendo las viejas. Se queda así hasta la siguiente subida.
- **Causa:** el `install` de `sw.js` hace `caches.open(CACHE).then(c => c.addAll(FILES))`, y `addAll` pasa por la caché HTTP del navegador. Si el navegador aún tiene por buenas las copias que descargó al instalar la versión anterior, las mete en la caché nueva sin pedirlas al servidor. GitHub Pages manda `cache-control: max-age=600`: el riesgo existe cuando entre una instalación y la siguiente pasan menos de 10 minutos, por ejemplo si se suben dos versiones seguidas. Comprobado: con la caché HTTP vacía la misma actualización sale bien (páginas nuevas, versión en el menú, caché vieja borrada, datos intactos).
- **Solución:** el `install` pide los archivos saltándose la caché HTTP: `c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))` (en 2026.11.2). Comprobado simulando la actualización de v108 a 2026.11.2 sin vaciar la caché HTTP: antes del cambio la caché nueva tenía el `index.html` viejo; después, el nuevo, con la versión en el menú y los datos intactos. La batería no cubre la actualización del SW; esa prueba se hizo aparte con un script.

## 2026-11-26 — Combustible: borrar el único repostaje y pulsar Guardar no borra nada

- **Síntoma:** encontrado al investigar el fallo siguiente. En un parte guardado con un solo repostaje, se borra ese repostaje y se pulsa Guardar: sale "Parte guardado", pero al recargar el repostaje vuelve. Pasa ya en v107.
- **Causa:** `saveHistorico()` termina en `if (!entries.length) return;` sin tocar el histórico, así que lo guardado antes sigue ahí.
- **Solución:** decidido con el usuario: Guardar borra el parte, avisando antes.
  - El botón Guardar llama a la nueva `guardarParte()`. Si el parte de esa matrícula y mes ya estaba guardado y no queda ningún repostaje, pregunta "El parte de <mes> · <matrícula> se ha quedado sin repostajes. ¿Borrar el parte?". Si se acepta, lo borra, dice "Parte borrado" y lo quita de la barra de matrículas; si se cancela, no toca nada. En los demás casos guarda como antes.
  - El borrado sale de `deleteHistorico()` a `borrarParte()`, que usan las dos. Generar PDF no pasa por `guardarParte()` y no borra.
  - `tests/test_comb_parte_vacio.js`: 18 comprobaciones; con el código anterior fallan 8.

## 2026-11-25 — Combustible: repostajes de un vehículo sin mes se pierden sin aviso o van a otro mes

- **Síntoma:** encontrado en una sesión de uso simulada durante la auditoría, sin que lo haya reportado ningún usuario. Pasa igual en v107 (publicada) y en v108. Al cerrar el aviso "PDF generado" o pulsar "Nuevo" el formulario se vacía, mes incluido. Si luego se escribe otra matrícula y se añade un repostaje sin volver a poner el mes:
  - Guardar dice "Parte guardado" y borra el borrador, pero no guarda nada.
  - Cambiar de matrícula pierde el repostaje sin avisar.
  - Elegir un mes distinto guarda el repostaje en el mes del parte anterior (en el nuevo no aparece).
  - Lo mismo sin matrícula: cambiar de mes pierde el repostaje.

  Los datos ya guardados no se pierden. Generar PDF sí avisaba ("Indica el mes y año").
- **Causa:** dos fallos juntos.
  - `saveHistorico()` hacía `if (!mat || !mes) return;`, que devuelve `undefined`, no `false`. El botón Guardar, `onMatriculaChange()`, `onMesChange()`, `loadParteChip()` y `newParteForMes()` solo se detienen con `false`, así que daban el parte por guardado y limpiaban el formulario.
  - Cerrar el aviso del PDF y "Nuevo" vaciaban el formulario pero dejaban `_activeMat`, `_activeMes` y `_activeParteKey` del parte anterior. `onMesChange()` restaura `_activeMes` antes de guardar, así que guardaba en el mes viejo.
- **Solución:**
  - `saveHistorico()`: si falta mes o matrícula y hay repostajes, avisa ("No se ha guardado el parte" con lo que falta, mismos textos que `validateCombustible()`) y devuelve `false`. Sin repostajes sigue sin avisar.
  - Nueva `olvidarParteActivo()`, llamada desde "Nuevo" (`resetForm()` sin argumento) y al cerrar el aviso del PDF. No va en `resetForm(true)` porque sus otros llamantes fijan el parte activo antes o después.
  - Test: `tests/test_comb_sin_mes.js`. Contra el código anterior fallan 18 de 36 comprobaciones. La sesión de uso completa da los mismos datos y PDFs que v107.

## 2026-11-24 — Combustible y órdenes purgaban un mes entero antes de tiempo los días 31 (y algunos 29 y 30)

- **Síntoma:** encontrado revisando la purga, sin que lo haya reportado ningún usuario. El 31-10-2026 combustible y órdenes borraban todo abril al guardar, cuando abril debía conservarse hasta noviembre. Lo mismo el 29, 30 y 31 de agosto (febrero) y el 31 de diciembre (junio), entre otros. La purga se escribe también en el JSON vinculado, así que ese mes desaparecía también del archivo.
- **Causa:** el corte se calculaba con `setMonth(getMonth() - 6)` sobre la fecha de hoy. Si el mes de destino no tiene ese día (31 de abril, 31 de febrero...), JavaScript salta al mes siguiente y el corte avanza un mes. `photoCutoffStr()` de `storage.js` tenía el mismo fallo con 3 meses, aunque solo afectaba a las fotos de la copia de `localStorage`. El parte diario no lo tenía porque pasa al día 1 antes de restar.
- **Solución:** `setDate(1)` antes de restar meses en `saveHistorico()` (`parte_combustible.html`), `saveOrden()` (`orden_reparacion.html`) y `photoCutoffStr()` (`storage.js`). Test nuevo: `tests/test_fechas_purga.js` (bloques A, B y C).

## 2026-11-24 — Parte diario: de 00:00 a 01:00 (02:00 en verano) la fecha por defecto era la de ayer

- **Síntoma:** al abrir el parte diario, al guardar o al pulsar "Nuevo" pasada la medianoche, el campo Fecha mostraba el día anterior. Un parte de madrugada se guardaba con la fecha de ayer si no se revisaba.
- **Causa:** la fecha se obtenía con `new Date().toISOString().slice(0, 10)`, que es la fecha en UTC. En España (UTC+1 / UTC+2) la fecha UTC sigue siendo la de ayer durante la primera o las dos primeras horas del día.
- **Solución:** función `fechaHoyLocal()` con la fecha local, usada al abrir, en `resetForm()`, en `clearParteFormAfterSave()` y en `makeNewParteId()`. Test: `tests/test_fechas_purga.js` (bloques D y E, con zona `Europe/Madrid`). Contra el código anterior el test falla 15 de 48 comprobaciones.

## 2026-10-08 — Combustible: con el almacenamiento lleno, Guardar fallaba sin aviso o decía "Parte guardado" sin guardar

- **Síntoma:** con `localStorage` lleno y sin archivo conectado:
  - Con un vehículo nuevo, Guardar no avisaba de nada, el error solo salía en la consola y el parte no se guardaba. Generar PDF tampoco generaba el PDF.
  - Con un vehículo ya conocido, salía el aviso "Almacenamiento lleno", pero también el toast "Parte guardado", y se borraba el borrador aunque no se había guardado nada.
  - Al cambiar de matrícula o de mes, o al pulsar "+ Nuevo", el guardado automático fallaba igual y el formulario se vaciaba, perdiendo lo rellenado.
- **Causa:** `saveHistorico()` llama a `saveCurrentVehicle()` sin `try`, y con un vehículo nuevo esa escritura de la BD de vehículos es la primera que no cabe. Además, `saveHistorico()` no devolvía si había guardado o no. Los botones y las funciones de navegación seguían como si todo hubiera ido bien. `makePDF()` también llamaba a `saveCurrentVehicle()` sin protección.
- **Solución:** en `parte_combustible.html`, `avisarSiLleno()` muestra el aviso de cuota (pide Reconectar si el archivo está pendiente) y relanza cualquier otro error. `saveHistorico()` protege `saveCurrentVehicle()` con ella y devuelve `false` si no ha podido guardar. Guardar solo muestra "Parte guardado" y borra el borrador si se ha guardado. Generar PDF genera el PDF igualmente, pero conserva el borrador. `onMatriculaChange`, `onMesChange`, `loadParteChip` y `newParteForMes` no cambian de parte si no se ha podido guardar el actual: el formulario se queda con el vehículo y el mes anteriores. Se quita de `makePDF()` la llamada repetida a `saveCurrentVehicle()`, porque `saveHistorico()` ya la hace. Test nuevo: `tests/test_comb_lleno.js` (contra el código anterior fallan 10 de 16 comprobaciones).

## 2026-10-08 — Parte diario: con el almacenamiento lleno y un vehículo nuevo, Guardar no hacía nada

- **Síntoma:** con `localStorage` lleno, al guardar un parte diario de un vehículo nuevo (o con marca, modelo o conductor cambiados) no salía ningún aviso y el parte no se guardaba. El error solo aparecía en la consola.
- **Causa:** `saveParteDiario()` llama a `saveCurrentVehiclePD()` antes de guardar el parte, y esa escritura de la BD de vehículos y conductores no estaba dentro de ningún `try`. El `QuotaExceededError` salía de la función antes de llegar a `setSavedParts()`, que es la que sí avisaba.
- **Solución:** el aviso de `setSavedParts()` pasa a `avisarErrorGuardado()`, y `saveParteDiario()` envuelve `saveCurrentVehiclePD()` con ella (mismo patrón que órdenes con `saveVehicleOR()`). El formulario no se vacía. Cubierto en `tests/test_sin_sincronizar.js` (bloque G, por la interfaz).

## 2026-10-08 — Lo guardado sin permiso se perdía si el navegador devolvía el permiso sin pulsar Reconectar

- **Síntoma:** con el archivo vinculado pero sin permiso (aviso "Reconectar"), el usuario guardaba un parte y la app lo mostraba. Si al volver a abrirla el navegador ya daba permiso al archivo, el parte desaparecía. Replicado por la interfaz (combustible, JSON de 5.969 KB) y con órdenes de reparación.
- **Causa:** sin permiso, lo guardado va solo a `localStorage`. Al arrancar con permiso, `init()` leía únicamente el archivo y sobrescribía `localStorage` con él, sin combinar. Solo `reconnect()` y `setup()` combinaban archivo y `localStorage`.
- **Solución:** en `storage.js`, al guardar o borrar con archivo vinculado sin permiso se pone la marca `partes_fs_sin_sincronizar` en `localStorage` (antes del dato; si no cabe, se reintenta después). Si `init()` arranca con permiso y la marca existe, combina como `reconnect()`, escribe el archivo y borra la marca. Si la escritura falla o el archivo está dañado, la marca se queda para el siguiente arranque. `reconnect()` y `setup()` también la borran. Sin marca, `init()` sigue usando solo el archivo, así que lo borrado en otro equipo no resucita. Limitación que ya tenía Reconectar: al combinar, un registro borrado en otro equipo y editado aquí sin permiso vuelve, y si el mismo registro se editó en los dos sitios gana el más reciente. Además, órdenes de reparación y parte diario piden "Pulsa Reconectar" cuando el almacenamiento está lleno y hay archivo vinculado sin permiso. Test nuevo: `tests/test_sin_sincronizar.js` (contra el código anterior fallan 14 de las 28 comprobaciones de este caso).

## 2026-10-08 — "Almacenamiento lleno" con el archivo JSON ya vinculado (caso real, JSON de 5.969 KB)

- **Síntoma:** un usuario con el JSON vinculado y conectado veía "Almacenamiento lleno. Vincula un archivo JSON para guardar con fotos." al guardar un repostaje en combustible, junto con el toast "Parte guardado". El JSON ocupaba 5.969 KB.
- **Causa:** con el archivo conectado, la app también guarda una copia en `localStorage`, que en Chromium admite unos 5,24 M de caracteres por origen. `stripOldPhotos()` solo quitaba de esa copia las fotos de más de 3 meses. Si las fotos de los últimos 4 meses pasan de unos 5 MB, la copia no cabe. Replicado por la interfaz con la fecha real y un JSON de 5.969 KB: con las fotos repartidas igual entre mayo y octubre no falla (4,15 M); con casi todas de julio a octubre sale el aviso. Los datos sí llegaban al archivo, porque se escribe antes que `localStorage`. Al arrancar, `init()` fallaba igual en silencio y la copia local se quedaba sin el histórico. El texto del aviso además pedía vincular un archivo que ya estaba vinculado.
- **Solución:** en `storage.js`, `lsSet()`: con el archivo conectado, si `localStorage` da error de cuota, la copia local del histórico de combustible se guarda sin ninguna foto (la app las lee del archivo) y se reintenta. Sirve para cualquier clave, así que tampoco falla el parte diario cuando las fotos de combustible llenan el espacio. `mergeData()` recupera del archivo las fotos de un registro de cualquier mes si la copia local que gana no tiene ninguna. Si tiene alguna, respeta los borrados. En `parte_combustible.html`, con el archivo vinculado sin permiso, el aviso dice "Pulsa Reconectar para guardar en el archivo vinculado". Test nuevo: `tests/test_ls_lleno.js` (cuota real de Chromium, sin simular). Contra el código anterior falla 8 de 18 comprobaciones.

## 2026-10-01 — PDFs de parte diario de varios MB sin llevar fotos

- **Síntoma:** el PDF mensual del parte diario pesaba varios MB aunque solo tiene texto y la firma (10 días firmados: 3,1 MB con el lienzo de firma de móvil, 7 MB con el de escritorio).
- **Causa:** los `new JPDF({...})` de los 3 módulos se creaban sin `compress: true`. Sin esa opción jsPDF descomprime el PNG de la firma y lo incrusta como píxeles en bruto (RGB + canal alfa): ~246 KB por día firmado con un lienzo de 362×170. El logo JPEG (565 KB) no influía en el crecimiento: jsPDF lo incrusta una sola vez por documento.
- **Solución:** `compress: true` en los 6 constructores (3 en parte diario, 2 en órdenes, 1 en combustible). 10 días firmados: 7 MB → 654 KB. Verificado rasterizando con `pdftoppm` el PDF comprimido y el original: las 10 páginas salen idénticas píxel a píxel. Con datos reales de un usuario, el mismo PDF mensual pasó de 15 MB a menos de 1 MB.

## 2026-10-01 — Tests del parte diario caducan con la fecha real

- **Síntoma:** `run_tests.sh` falla en 5 archivos (`test_adversarial`, `test_diario_multi`, `test_edicion_multi`, `test_regresion_e2e`, `test_stripOldPhotos`) sin cambios relacionados en la app ("4 partes guardados: hay 0").
- **Causa:** los tests siembran partes con fechas fijas de julio de 2026 y el parte diario purga al guardar lo que supera `MESES_A_CONSERVAR = 3`. A partir de octubre de 2026 esos partes se descartan nada más guardarse.
- **Solución:** los tests abren las páginas con `nuevaPagina(browser)` de `tests/_comun.js`, que fija el reloj del navegador en 2026-07-15 (`page.clock.install`; el tiempo sigue avanzando desde ahí). Así los datos sembrados siempre están dentro de la ventana de retención, se ejecuten el día que se ejecuten.

## 2026-10-01 — Test Bug2 (guard de `resetForm` del parte diario) falla de forma intermitente

- **Síntoma:** "Bug2: datos NO se pierden tras cancelar confirm" fallaba unas 2 de cada 3 ejecuciones: el conductor rellenado desaparecía aunque el `confirm()` se cancelaba.
- **Causa:** en un contexto de navegador nuevo el Service Worker se instala en la primera carga, hace `clients.claim()` y la app recarga la página en `controllerchange` (pensado para aplicar actualizaciones). Esa recarga llegaba después de que el test hubiera rellenado el campo. No es un fallo del guard. En la app real pasa lo mismo una sola vez, en la primera visita a la PWA: si el usuario ya ha empezado a escribir, la página se recarga.
- **Solución:** `nuevaPagina` carga `index.html` y espera a que haya un documento que nació ya controlado por el SW (el recargado) antes de devolver la página. Bug2 pasa 20 de 20 veces. La recarga en la primera visita de la app queda sin tocar.

## Auditoría 2026-09-01 — XSS almacenado vía foto de repostaje en el historial

- **Síntoma/riesgo:** al pintar el historial mensual de combustible, `h.photos[idx].data` se insertaba sin escapar dentro de un atributo `src` construido con `innerHTML` (`onMatriculaChange`/render de historial en `parte_combustible.html`). Un valor `data` con una comilla `"` podía escapar del atributo e inyectar HTML/JS con acceso al `localStorage` de la PWA.
- **Causa:** excepción al patrón ya establecido en v102 ("nunca `innerHTML` con datos del usuario") — este punto de inserción se quedó fuera de aquel fix porque afectaba a fotos, no a texto de conductor.
- **Solución:** la fila de historial (`r.innerHTML = '<span>'+text+'</span>'+ph`) se reconstruyó con `createElement('span')` + `textContent` para el texto, y `createElement('img')` + asignación de propiedad `.src` (no de string HTML) para la foto — mismo patrón que ya usaba `showPhotoPreview`.

## Auditoría 2026-09-01 — `QuotaExceededError` sin capturar en órdenes de reparación

- **Síntoma:** a diferencia de combustible y parte diario, guardar una orden de reparación con el `localStorage` lleno fallaba en silencio (excepción sin capturar) en vez de avisar al usuario.
- **Causa:** `setSavedOrdenes()` en `orden_reparacion.html` llamaba a `FSStorage.setItem()` sin `try/catch`, pese a que `CLAUDE.md` documentaba el manejo de `QuotaExceededError` como ya presente "en los 3 módulos".
- **Solución:** `setSavedOrdenes()` ahora captura el error, muestra `showErr('Almacenamiento lleno. Vincula un archivo JSON para poder seguir guardando.')` y devuelve `false`; `saveOrden()` aborta (sin marcar la orden como guardada ni limpiar el formulario) si el guardado falla.

## Auditoría 2026-09-01 — `readFile()` sobrescribía silenciosamente archivos JSON corruptos

- **Síntoma/riesgo:** si el archivo JSON vinculado se corrompía (edición manual, sincronización a medias de Drive/OneDrive, etc.), `readFile()` lo trataba como si estuviera vacío (`catch(e) { return {}; }`) sin avisar. En `setup()` esto podía acabar sobrescribiendo el archivo real del usuario con datos vacíos o de otro dispositivo la siguiente vez que se guardaba algo; en `init()`/`reconnect()` la app arrancaba en modo "archivo vinculado" con datos vacíos sin que el usuario supiera que su archivo estaba dañado.
- **Causa:** `readFile()` capturaba cualquier error de `JSON.parse()` y lo convertía en `{}`, indistinguible de "archivo recién creado y legítimamente vacío".
- **Solución:** `readFile()` ahora lanza un `Error` con `name = 'FileCorruptError'` en vez de devolver `{}`. Los 3 puntos que la llaman lo capturan explícitamente:
  - `setup()`: aborta con `return false` **antes** de llamar a `writeFile()`, muestra `alert()` y no toca ni el archivo ni `localStorage`.
  - `init()`: dejas `_active=false` y cae al flujo normal de `loadLS()` (modo localStorage), mostrando `alert()`.
  - `reconnect()`: igual que `init()`, con su propio `alert()` y `_active=false`.
  Test de regresión: `tests/test_readFile_corrupto.js`.

## 2026-10-01 — Arreglos de la auditoría incompletos (detectado ampliando los tests)

Los tres arreglos de la auditoría 2026-09-01 cubrían el caso que la provocó pero no rutas vecinas con el mismo problema.

- **Órdenes con el almacenamiento lleno de verdad**
  - **Síntoma:** con un vehículo nuevo y el `localStorage` lleno, pulsar "Guardar" no hacía nada y no salía ningún aviso.
  - **Causa:** `saveOrden()` llama a `saveVehicleOR()` antes de `setSavedOrdenes()`, y la BD de vehículos se escribía sin `try/catch`. El test original solo hacía fallar la clave de órdenes y no lo veía.
  - **Solución:** `saveOrden()` captura también el error de `saveVehicleOR()`; ambos puntos usan `avisarSiLleno(e)`, que muestra el aviso si es de cuota y relanza cualquier otro error.
- **Archivo vinculado con JSON válido que no es un objeto**
  - **Síntoma:** un archivo con `null` dejaba la app sin poder leer ni guardar (`Cannot read properties of null`). Al vincular un `.json` que fuese una lista, un número o un texto, se aceptaba y se sobrescribía con los datos de la app.
  - **Causa:** `readFile()` solo rechazaba errores de sintaxis; cualquier JSON válido pasaba como datos de la app.
  - **Solución:** `readFile()` lanza `FileCorruptError` también si el contenido no es un objeto, así `setup()`, `init()` y `reconnect()` avisan sin tocar el archivo.
- **XSS en combustible por otras dos rutas**
  - **Síntoma:** con un JSON manipulado, el mes de un parte se ejecutaba como HTML en la cabecera del historial, y al pulsar "Cargar en el formulario" se ejecutaban la foto y los importes.
  - **Causa:** el arreglo solo reconstruyó las filas del historial. `fmtMonth(h.mes)` en la cabecera y `renderRepostajes()` (foto en `src` e importes, que son campos de texto) seguían metiendo datos guardados con `innerHTML`.
  - **Solución:** esos valores pasan por `escapeHtml()`. Test nuevo: `tests/test_xss_historico.js`.

## v103 (2026-07-06) — Coma decimal descartada en silencio: importes ×100

- **Síntoma:** teclear "50,55" en un campo de euros o litros guardaba **5055** — el importe quedaba multiplicado por 100 sin ningún aviso.
- **Causa:** los campos eran `type="number"` y el navegador descarta la coma en silencio al parsear el valor.
- **Solución:** campos cambiados a `type="text" inputmode="decimal"` con `normDec()` que convierte coma→punto al teclear y rechaza caracteres no numéricos. Aplicado en combustible (form nuevo repostaje, tabla, editor inline) y parte diario (p1-3/l1-3). Los km siguen `type="number"` (enteros).

## v103 (2026-07-06) — Conductores duplicados por acentos

- **Síntoma:** "JOSÉ PÉREZ" y "JOSE PEREZ" convivían como dos conductores distintos en la lista de combustible.
- **Causa:** la deduplicación comparaba cadenas exactas, sin normalizar acentos.
- **Solución:** dedup con `normStr` (gana la última grafía escrita, mismo criterio que `saveConductorName` del diario) + toast "Conductor repetido" al detectarlo.

## v102 (2026-07-03) — Contaminación cruzada de repostajes entre vehículos

- **Síntoma:** al generar el PDF mensual de Parte Combustible de una matrícula aparecían repostajes de OTRO vehículo del mismo usuario mezclados en la tabla. Caso real: `MMM-04024`, junio 2026 — histórico corrupto, corregido a mano ticket a ticket; `km_ini/km_fin` de 4 matrículas quedaron irrecuperables.
- **Causa:** `onMatriculaChange()` en `parte_combustible.html` no guardaba ni limpiaba la tabla de repostajes al escribir una matrícula nueva (sin parte guardado ese mes): las filas del vehículo anterior seguían en el DOM y se mezclaban con las del nuevo.
- **Solución:** `onMatriculaChange()` guarda el vehículo saliente (`saveCurrentVehicle()` + `saveHistorico()`) y limpia la tabla antes de cargar/crear el histórico del entrante. Regresión Playwright con 2 vehículos y cambio A→B→A.

## v102 (2026-07-03) — Órdenes de reparación rotas en producción desde v99

- **Síntoma:** guardar/cargar/borrar/listar órdenes de reparación lanzaba `ReferenceError` en producción.
- **Causa:** `normMat`/`fmtMat` (introducidas en v99) estaban definidas dentro de un IIFE pero se llamaban desde funciones globales.
- **Solución:** movidas al scope global.

## v102 (2026-07-03) — `mergeData()` pisaba datos más recientes del archivo

- **Síntoma:** al reconectar el JSON vinculado, versiones más nuevas de registros en el archivo podían perderse.
- **Causa:** el merge daba prioridad incondicional a localStorage en vez de comparar frescura.
- **Solución:** merge por `updatedAt`/`createdAt` registro a registro; vehículos campo a campo.

## v102 (2026-07-03) — XSS en nombres de conductor

- **Síntoma/riesgo:** nombres de conductor se insertaban sin escapar vía `innerHTML` en combustible.
- **Causa:** interpolación directa de datos de usuario en HTML.
- **Solución:** `escapeHtml()` añadida en los puntos de inserción. Convención desde entonces: nunca `innerHTML` con datos del usuario — `textContent` o `createElement`.

## v102 (2026-07-03) — `stripOldPhotos()` documentada pero inexistente

- **Síntoma:** la purga de fotos antiguas de localStorage (documentada en v97) no ocurría; riesgo de `QuotaExceededError` por Base64 acumulado.
- **Causa:** la función se documentó en v97 pero nunca llegó a escribirse en el código.
- **Solución:** implementada de verdad en `storage.js`: purga fotos >3 meses solo de localStorage (el JSON conserva todo); `mergeData()` recupera fotos del archivo si el registro purgado gana por timestamp.

## v102 (2026-07-03) — Guards de `resetForm` incompletos

- **Síntoma:** la confirmación "Nuevo" (contra pérdida de datos) a veces no saltaba con el formulario a medias.
- **Causa:** los guards comprobaban solo 1-2 campos.
- **Solución:** `formHasData*()` en los 3 módulos revisa todos los campos, fotos y firma.

## v98 — Autocompletado destructivo matrícula↔conductor (parte diario)

- **Síntoma:** conductores que usaban una matrícula nueva pero tenían otra guardada en BD veían cómo el formulario les borraba/pisaba datos al corregir (caso real: MMA05981).
- **Causa:** bucle destructivo entre `onMatriculaChangePD` y `onConductorChangePD` — cada uno sobreescribía el campo del otro aunque tuviera contenido.
- **Solución:** cada campo solo autocompleta si el otro está **vacío**; el conductor solo se limpia si la matrícula se vacía. (Refinado en v102: conductor con varios vehículos elige el usado más recientemente, `pickLastUsedVehiclePD`, y nunca pisa una matrícula ya escrita.)

## v91-v92 — Datos de vehículo perdidos al guardar sin generar PDF

- **Síntoma:** la tarjeta/marca/modelo del vehículo se perdía si se guardaba el parte sin llegar a generar el PDF.
- **Causa:** `saveCurrentVehicle/saveVehicleOR/saveCurrentVehiclePD` solo se llamaban desde `makePDF`, no desde el guardado.
- **Solución:** llamadas al **inicio** de `saveHistorico/saveOrden/saveParteDiario`. **Patrón a vigilar:** todo campo nuevo de vehículo debe incluirse en estas funciones.

## Gotcha de testing — `test_ambiguo.js` nunca podía fallar

- **Síntoma:** la batería reportaba "12 archivos PASARON" aunque el TEST A de `test_ambiguo.js` imprimía `*** FALLO: no autocompleto correctamente con match unico ***` en pantalla.
- **Causa:** `run_tests.sh` solo cuenta como fallo un exit code distinto de 0 (`node "$t"` → `if ! ...`). `test_ambiguo.js` solo hacía `console.log(cond ? 'OK' : '*** FALLO ***')` sin nunca llamar a `process.exit(1)`, así que ningún resultado de sus 5 comprobaciones podía tumbar el proceso. Además el propio TEST A tenía el valor esperado mal escrito: para la matrícula sembrada `1111AAA` (7 caracteres), `fmtMat()` produce correctamente `111-1AAA`, pero el test comparaba contra `111-AAA` (un carácter de menos) — un fallo del test, no de la app.
- **Solución:** corregido el valor esperado del TEST A; añadido un contador `fallos` con helper `check()` que además de loguear incrementa el contador, y `process.exit(1)` al final si `fallos > 0`, igual que el resto de la batería.

## Auditoría 2026-09-01 — Test de regresión para el fix de `QuotaExceededError` en órdenes

Añadido `tests/test_or_quota.js`: simula `localStorage` lleno al llamar a `saveOrden()` y comprueba que aparece el aviso en `#errbox` y que la orden no queda persistida. Cubre el fix descrito arriba (`setSavedOrdenes()`). Ampliado el 2026-10-01 con más escenarios (ver la entrada "Arreglos de la auditoría incompletos").

## Gotcha de testing — Playwright auto-descarta `confirm()`/`alert()`

- **Síntoma:** falsos negativos en regresiones ("se pierde el segundo repostaje") que no eran bugs reales.
- **Causa:** Playwright cancela automáticamente cualquier diálogo si no se registra `page.on("dialog", ...)`. `switchFuelType()` muestra un `confirm()` que, al cancelarse, **invierte** el valor de `#tipo_combustible` — un test puede dispararlo sin querer re-seleccionando un `<select>` que ya tenía el valor correcto.
- **Solución:** registrar siempre `page.on("dialog")` en los tests de estos módulos.
