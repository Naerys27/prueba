# Handover — Partes de Locomoción CHT
**Fecha:** 2026-11-26 | **SW publicado:** `partes-loco-v108` | **v109 en rama `entregas`** (sin desplegar)

---

## Estado general

PWA funcional desplegada en https://naerys27.github.io/prueba/
3 módulos: Parte Servicio Diario · Parte Combustible · Orden de Reparación
Sin backend — almacenamiento en localStorage + File System Access API (archivo JSON opcional).

---

## Cambios recientes

### Auditoría de código (desde 2026-11-25)

Entregas pequeñas para poder deshacerlas por separado. Punto de vuelta: etiqueta local `antes-auditoria` (= v107, commit `3e20a9a`).

- **v108 (2026-11-26, desplegado):** dos fallos de combustible encontrados en la auditoría, los dos ya presentes en v107. Detalle en `errores.md`.
  - Sin mes (tras cerrar el aviso del PDF o pulsar "Nuevo"), los repostajes se perdían sin aviso o se guardaban en otro mes. Ahora Guardar y los cambios de matrícula o mes avisan y no limpian el formulario. Test: `tests/test_comb_sin_mes.js`.
  - Borrar el único repostaje de un parte guardado y pulsar Guardar no borraba nada. Ahora Guardar pregunta si se borra el parte. Test: `tests/test_comb_parte_vacio.js`.
- **v109 (sin desplegar):** borrado código muerto del PDF, sin efecto visible (orden de reparación: `fitOneLine`, `addFitText`, `wrapTextHard`, `addBlockText`, `drawCentered`, `drawLabel`, `drawSignArrow`, `A4W/A4H`; parte diario: `PDF`, `TX`, `drawBlueRect`, `drawInlineField`).

### v107 — fechas de la purga y del parte diario (2026-11-24, desplegado)

- Combustible, órdenes y fotos de `localStorage` purgaban un mes entero antes de tiempo los días 31 (y algunos 29 y 30): `setDate(1)` antes de restar meses.
- El parte diario ponía la fecha de ayer entre las 00:00 y las 01:00/02:00: `fechaHoyLocal()` en vez de `toISOString()`.
- Detalle en `errores.md`. Test nuevo: `tests/test_fechas_purga.js` (48 comprobaciones).

### v106 — logo del PDF reducido (2026-10-23, desplegado)

- El logo de la cabecera PDF (`LOGO` en combustible y diario, `LOGO_IMG` en orden) pasa de 5803×1070 px / 552 KB (2048×378 / 322 KB en orden) a una sola imagen de 3000×553 px, JPEG calidad 95, 229 KB, la misma en los 3 módulos. Cada PDF baja de ~557 KB a ~234 KB y cada HTML ~130-430 KB. Se probaron 1600 px/q90 (se notaba la pérdida) y 2400 px/q95; el usuario eligió 3000 px.

### v103 — desplegado (coma decimal, avisos, dedup)

Ronda de robustez tras testing adversario (todos con test de regresión en `tests/test_adversarial.js`, 30 asserts):

- **Coma decimal (bug real):** los campos de euros/litros eran `type="number"` y el navegador descartaba la coma en silencio — teclear "50,55" guardaba **5055** (importe ×100). Ahora son `type="text" inputmode="decimal"` con `normDec()` que convierte coma→punto al teclear y rechaza caracteres no numéricos. Aplicado en combustible (form nuevo repostaje, tabla, editor inline) y parte diario (p1-3/l1-3). Los km siguen `type="number"` (enteros).
- **Aviso importe sospechoso:** `MAX_EUR_AVISO = 400` — importes de repostaje >400€ piden `confirm()` antes de aceptarse (addRepostaje, saveRepostajeInline, saveParteDiario).
- **Aviso fecha fuera de mes:** repostaje con fecha de otro mes distinto a `v_mes` pide confirmación (antes se aceptaba en silencio).
- **Dedup conductores por acentos (combustible):** "JOSÉ PÉREZ" y "JOSE PEREZ" ya no conviven en la lista — dedup con `normStr`, gana la última grafía escrita (mismo criterio que `saveConductorName` del diario). Toast "Conductor repetido" al detectarlo.
- **Tope de 14 repostajes:** al intentar el 15º ahora sale `showErr` persistente con mensaje claro (antes toast fugaz).

### v102 — DESPLEGADO 2026-07-03 (8 bugs + stripOldPhotos + suite de tests)

- **Contaminación cruzada de repostajes/km entre vehículos** (`onMatriculaChange`, caso real `MMM-04024` junio 2026): desplegado. El JSON de la usuaria se corrigió manualmente contrastando ticket a ticket (solo `MMM05520/2026-06` tenía entries duplicadas; `km_ini/km_fin` de 4 matrículas quedaron en blanco por irreconstruibles — deben reintroducirlos los conductores).
- **Órdenes de reparación rotas en producción**: `normMat`/`fmtMat` estaban dentro de un IIFE pero se llamaban desde funciones globales — guardar/cargar/borrar/listar órdenes lanzaba `ReferenceError` desde v99. Movidas al scope global.
- **Autofill conductor ambiguo** (diario): conductor con varios vehículos elige el usado más recientemente (`pickLastUsedVehiclePD`); nunca pisa una matrícula ya escrita.
- **Guards `resetForm` de los 3 módulos**: comprobaban solo 1-2 campos; ahora `formHasData*()` revisa todos los campos, fotos y firma.
- **`mergeData()` en storage.js**: merge por `updatedAt`/`createdAt` (antes localStorage pisaba versiones más recientes del archivo); vehículos campo a campo.
- **XSS**: nombres de conductor sin escapar via `innerHTML` en combustible — `escapeHtml()` añadida.
- **`stripOldPhotos()`**: documentada en v97 pero nunca existió en el código; implementada de verdad (purga fotos >3 meses solo de localStorage, el JSON conserva todo; el merge recupera fotos del archivo si el registro purgado gana por timestamp).
- **Suite de tests permanente**: `tests/` con 10 archivos (~130 asserts) + `tests/run_tests.sh` + README. **Obligatorio pasarla antes de cada deploy.**

### UX / UI — Grupos 1-4 (completados)
- **Grupo 1:** Toast 2800ms, padding-bottom seguro (iOS), contraste botón danger, firma 150px, botones flex, font-size `.ch`
- **Grupo 2:** Colapso secciones en móvil, touch targets 44px, checkboxes accesibles
- **Grupo 3:** Atributo `for` en todos los labels, label "Matrícula" en parte diario
- **Grupo 4:** Tabla responsiva en parte combustible, confirmación "Nuevo" en los 3 módulos, `showErr()` en orden_reparacion, manejo `QuotaExceededError`

### Chips matrícula → control segmentado (v90) — PENDIENTE BETA
`parte_combustible.html`: chips como tab bar iOS integrado en card. Revertible — ver `memory/project_chips_tabs_revert.md`.

### Bug fixes persistencia (v91-v92)
- `saveCurrentVehicle()` añadido al inicio de `saveHistorico()` en parte_combustible → tarjeta ya no se pierde al guardar sin PDF.
- `saveVehicleOR()` añadido al inicio de `saveOrden()` en orden_reparacion → marca/modelo ya no se pierden.

### Historial parte diario rediseñado (v93)
`parte_servicio_diario.html`: visor de partes guardados como `<details class="action-panel">` colapsable. Summary: "Mis partes del mes (N partes · M matrículas)".

### Último registro en menú principal (v94)
`index.html`: `updateModuleStats()` muestra debajo de cada tarjeta del menú el último registro guardado en ese módulo.

### Asteriscos campos obligatorios (v95)
CSS `.req { color: #e53e3e; }` en los 3 módulos. Campos marcados:
- Parte diario: Conductor/a*, Fecha*, Matrícula*
- Combustible: Mes / Año*, Matrícula*
- Orden reparación: Fecha*, Matrícula* (OR en validación)

### Conductor por repostaje (v101)

`parte_combustible.html`: cuando hay más de un conductor en el parte, cada repostaje puede asociarse al conductor que lo realizó.

- **UI:** select `#nf_gc` / `#nf_dc` siempre visible bajo los campos del formulario. Con 1 conductor → auto-seleccionado. Con N → dropdown.
- **Almacenamiento:** campo `conductor` en cada entrada del JSON (`partes_combustible_hist_v1`). Compatible hacia atrás (entradas antiguas sin conductor = cadena vacía).
- **Tarjetas:** muestra `👤 Nombre` bajo los datos si hay conductor asignado.
- **Edición inline:** select conductor aparece solo si hay >1 conductores (con 1 no hay elección posible, el valor se preserva).
- **PDF `multiCond` flag** (`_condList.length > 1`):
  - Gasolina multiCond: 7 columnas, Conductor (w:48) en ci=5. TOTAL: `ML+81` L, `ML+107` €.
  - Gas-oil multiCond: 9 columnas, Conductor (w:44) en ci=7. TOTAL: `ML+55/71/89/107`.
  - Sin multiCond: layout original sin cambios.
  - Truncación de nombre con `getTextWidth()` + `…`.
- **PDF sección conductores:** auto-shrink 10→7pt + `splitTextToSize` para wrapping si no cabe.
- NR: 13 → 14 (máximo de repostajes por parte).
- Backup del original: `parte_combustible_v100_backup.html`.

**Bugs a evitar:** ver `memory/project_parte_combustible_estado.md` sección "Feature: Conductor por repostaje".

### Conductor en mayúsculas (v100)
`parte_servicio_diario` y `parte_combustible`: campo conductor muestra mayúsculas mientras se escribe (CSS) y convierte el valor al perder el foco. Se guarda siempre en mayúsculas. El PDF ya mostraba el valor del campo, por lo que también sale en mayúsculas.

### Formato matrícula con guión (v99)
Los 3 módulos: `normMat` normaliza la matrícula (sin separadores, mayúsculas) para almacenamiento; `fmtMat` la muestra con guión (MMA-05505). Migración automática de claves antiguas (con espacio o sin separador) al cargar la BD. El campo formatea al perder el foco. Retrocompatible con datos guardados.

### Fix autocompletado matrícula/conductor (v98)
`parte_servicio_diario.html`: corregido bucle destructivo entre `onMatriculaChangePD` y `onConductorChangePD`.
- `onMatriculaChangePD`: ya no borra el conductor si ya tiene contenido (solo lo limpia si la matrícula se vacía); solo autocompleta conductor desde BD si el campo está vacío.
- `onConductorChangePD`: ya no sobreescribe la matrícula si ya tiene contenido (solo autocompleta si está vacío).
- Causa: conductores que usaban una matrícula nueva (MMA05981) pero tenían otra matrícula guardada en BD — el autocompletado cruzado les borraba los datos al intentar corregir.

### Validación Conductor/a (v96)
`parte_servicio_diario.html`: añadida validación real en `validateParteData()` — el parte no se puede guardar ni generar PDF sin indicar el nombre del conductor/a.

### Purga fotos antiguas de localStorage (v97)
`storage.js`: función privada `stripOldPhotos()` — cuando hay archivo JSON vinculado, las fotos de entradas con más de 3 meses se eliminan de localStorage (pero se conservan en el JSON durante 6 meses). Evita que localStorage se llene con Base64 acumulado. Si aun así no cabe (fotos recientes de más de ~5 MB), `lsSet()` guarda la copia local del histórico sin ninguna foto (desde 2026-10-08, ver `errores.md`).
- `mergeData()` actualizado para recuperar fotos del archivo cuando localStorage no las tiene (evita que el merge borre fotos del JSON progresivamente).
- `saveHistorico()` en `parte_combustible.html` añade `try/catch` con `showErr` para `QuotaExceededError`.

### Guardar sin permiso del archivo (2026-10-08)
`storage.js`: marca `partes_fs_sin_sincronizar` en `localStorage`. Se pone al guardar o borrar con archivo vinculado sin permiso. Si `init()` arranca con permiso y la marca existe, combina archivo y `localStorage` como `reconnect()` y la borra tras escribir el archivo. Evita perder lo guardado sin permiso cuando el navegador devuelve el permiso sin pulsar Reconectar (ver `errores.md`).

---

## Archivos de prueba en prueba/ (NO desplegar, gitignoreados)
- `parte_combustible_conductor_test.html` — prototipo de la feature conductor (ya integrada en el real)
- `parte_combustible_v100_backup.html` — backup pre-v101

---

## Pendientes

- **Auditoría de código:** entregas v109 (código muerto), v110 (errores y XSS) y v111 (duplicados de combustible), una a una y probadas por los usuarios antes de la siguiente.
- **Entregar a la usuaria el JSON corregido** (`partes_copia_2026-07-03.json`, local, gitignoreado) y que confirme que le llega la v102.
- **km de junio en blanco**: avisar a los responsables de `MMM06038/MMM05520/MMM04024/MMM05422` para que reintroduzcan `km_ini/km_fin` de junio a mano (irreconstruibles).
- **Validación en móvil real**: la suite cubre lógica en Chromium desktop; falta un ciclo completo en Android (PWA instalada, cámara, vinculación real del JSON).
- **DECISIÓN APLAZADA (2026-07-06) — arrastre de conductores a mes nuevo:** hoy la lista de conductores de combustible NO se precarga al abrir un mes nuevo del mismo vehículo (hay que reescribirla). Se decidió dejarlo así por ahora. Si se cambia de opinión: precargar desde el mes más reciente de la misma matrícula al crear el registro (opción recomendada en su día; ver conversación 2026-07-06).
- **Chips:** validar con beta testers. Si rechazo → `memory/project_chips_tabs_revert.md`.
- **Concepto en OR:** sin asterisco ni validación — pendiente decisión (de momento se deja sin tocar).
- **Backend separado:** `~/partes-server` WSL puerto 3001 → `memory/project_partes_backend.md`.
- **DESCARTADO (2026-09-01) — dividir `mergeData()` (storage.js) por superar las 50 líneas:** solo la supera en ~4 líneas; no compensa el riesgo de tocar una función con muchos casos límite ya parcheados (timestamps legacy, recuperación de fotos, dedupe de conductores) a cambio de tan poco. Revisar si en el futuro crece más.

---

## Funciones clave

Ver la tabla "Funciones clave" en `CLAUDE.md`.

---

## Colores del proyecto

| Color | Uso |
|-------|-----|
| `#e5eef4` | Fondo chips bar (claro), botones `.btnc` |
| `#0e1c2e` | Fondo chips bar (oscuro), card headers dark |
| `#5a7184` | Texto secundario |
| `#0f6f9c` | Azul principal (brand) |
| `#0d1520` | Inputs modo oscuro |
| `#e53e3e` | Asterisco campos obligatorios |
