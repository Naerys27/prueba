# Handover — Partes de Locomoción CHT
**Fecha:** 2026-06-23 | **SW actual:** `partes-loco-v100`

---

## Estado general

PWA funcional desplegada en https://naerys27.github.io/prueba/
3 módulos: Parte Servicio Diario · Parte Combustible · Orden de Reparación
Sin backend — almacenamiento en localStorage + File System Access API (archivo JSON opcional).

---

## Cambios recientes

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
`storage.js`: función privada `stripOldPhotos()` — cuando hay archivo JSON vinculado, las fotos de entradas con más de 3 meses se eliminan de localStorage (pero se conservan en el JSON durante 6 meses). Evita que localStorage se llene con Base64 acumulado.
- `mergeData()` actualizado para recuperar fotos del archivo cuando localStorage no las tiene (evita que el merge borre fotos del JSON progresivamente).
- `saveHistorico()` en `parte_combustible.html` añade `try/catch` con `showErr` para `QuotaExceededError`.

---

## Archivos de prueba en prueba/ (NO desplegar)
- `parte_servicio_diario_historial_test.html`
- `parte_combustible_tabs.html` / `_tabs_a.html` / `_tabs_b.html`

---

## Pendientes

- **Chips:** validar con beta testers. Si rechazo → `memory/project_chips_tabs_revert.md`.
- **Concepto en OR:** sin asterisco ni validación — pendiente decisión (de momento se deja sin tocar).
- **Backend separado:** `~/partes-server` WSL puerto 3001 → `memory/project_partes_backend.md`.

---

## Funciones clave

| Función | Archivo | Qué hace |
|---------|---------|---------|
| `saveCurrentVehicle()` | parte_combustible | Guarda marca/modelo/tarjeta/coste en BD vehículos |
| `saveVehicleOR()` | orden_reparacion | Guarda marca/modelo en BD vehículos |
| `saveCurrentVehiclePD()` | parte_servicio_diario | Guarda marca/modelo en BD vehículos |
| `updateModuleStats()` | index.html | Último registro en tarjetas del menú |
| `renderSavedDays()` | parte_servicio_diario | Lista de partes del mes seleccionado |
| `saveHistorico()` | parte_combustible | Guarda parte mensual + BD vehículos |
| `saveOrden()` | orden_reparacion | Guarda orden + BD vehículos |
| `validateParteData()` | parte_servicio_diario | Valida fecha + conductor/a + matrícula + contadores + horas |

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
