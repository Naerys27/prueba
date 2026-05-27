# HANDOVER.md — Estado del proyecto (2026-05-27)

## Estado actual

### Qué funciona correctamente
- **Parte de Servicio Diario** — registro diario, guardado, historial, PDF diario, PDF del mes, PDF por matrícula. Modal post-PDF con botón "Abrir PDF ↗".
- **Parte Mensual de Combustible** — repostajes, fotos de tickets, firma, historial, generación PDF con fotos. Modal post-PDF con botón "Abrir PDF ↗".
- **Orden de Reparación** — formulario completo (incluye campo "Responsable del Servicio autorizante" añadido recientemente), PDF institucional, historial con auto-guardado al generar PDF. Modal post-PDF con botón "Abrir PDF ↗".
- **Almacenamiento** — localStorage siempre activo; archivo JSON externo opcional via File System Access API.
- **PWA** — instalable, offline, Service Worker v57, banner de actualización automática.
- **Borradores** — guardado automático en todos los módulos, expiración a las 2 horas.
- **Modo oscuro** — funcional en todos los módulos.
- **index.html** — menú principal, gestión de archivo JSON, export/import global de datos.

### Qué no está implementado (descartado o pendiente)
- **Sincronización automática cloud** — descartada por restricciones Azure/AGE.
- **PDF editable (AcroForm)** para parte combustible — evaluado, descartado por complejidad.
- **Soporte Safari/iOS** para File System Access API — limitación del navegador, no resoluble.

---

## Bugs corregidos en esta sesión

| Bug | Estado |
|-----|--------|
| `doc.rect(...,'SD')` inválido en jsPDF (orden reparación) | Corregido → `'S'` |
| Fecha badge tapaba "Locomoción" en PDF orden reparación | Corregido → fecha como texto plano |
| PDF generado en blanco al pulsar PDF sin datos en orden reparación | Corregido → validación al inicio de `makePDF()` y `sharePDF()` |
| `meta charset` después de scripts en index.html | Corregido → movido al inicio de `<head>` |
| Navegador no compatible sin feedback en index.html | Corregido → añadido aviso `st-nosup` |
| Último texto sección 5 de la guía decía "partes mensuales" en vez de "órdenes de reparación" | Corregido en Word |

## Bugs conocidos pendientes
- Ninguno conocido actualmente.

---

## Lo que estábamos haciendo justo antes de cerrar

1. Se completaron todos los cambios de UX del modal post-PDF (botón "Abrir PDF ↗" en los 3 módulos, layout igual al de parte combustible).
2. Se añadió purga automática de 6 meses a las órdenes de reparación.
3. Se corrigieron los dos bugs menores del index.html.
4. Se actualizó y corrigió la guía Word (`Guia_App_Partes_Locomocion.docx`).
5. Se discutió la futura migración a infraestructura corporativa (Forja/SharePoint).
6. La app está publicada en https://naerys27.github.io/prueba/ y en fase de beta testing con varios conductores.

Todos los cambios están subidos a GitHub (último commit: `b9bb7fa` del 25-may-2026). Service Worker en `partes-loco-v58`.

---

## Próximos pasos (por orden de prioridad)

1. **Recoger feedback de los beta testers** — los conductores están probando la app. Cualquier bug o mejora reportada tiene prioridad.

3. **Decidir estrategia de producción** — opciones evaluadas:
   - **Forja corporativa** (recomendada si tienen Pages habilitado): copiar repo y cambiar URL
   - **Servidor web corporativo**: copiar archivos estáticos, verificar HTTPS
   - **SharePoint**: viable pero requiere reescribir `storage.js` para usar Microsoft Graph API

4. **Si se va a SharePoint**: reescribir `storage.js` para usar Graph API + SharePoint Lists como backend de datos. Es la opción que resuelve la dependencia del JSON local y el acceso multi-dispositivo de forma nativa.

5. **Mejoras menores pendientes** (no urgentes):
   - Añadir botón "Abrir PDF ↗" también en parte combustible (actualmente solo tiene "Cerrar" en el modal `_showPDFOpenModal`, aunque ya tiene `blobUrl` preparado)

---

## Lo que NO se debe tocar o romper

- **`storage.js`** — cualquier cambio aquí afecta a los 4 módulos simultáneamente. Probar bien antes de subir.
- **`sw.js` versión** — si se modifica cualquier archivo y se sube a GitHub, HAY QUE incrementar la versión del CACHE. Si no se hace, los usuarios no recibirán la actualización.
- **Estilos rect en jsPDF** — solo usar `'S'`, `'F'`, `'FD'`, `'DF'`. Nunca `'SD'` (rompe la generación del PDF).
- **Los IDs de los campos de formulario** — están referenciados en múltiples sitios (saveDraft, saveOrden, fields array, etc.). Cambiar un ID sin actualizar todos los sitios romperá el guardado/restauración.
- **`_ALL_KEYS` en index.html** — debe contener exactamente las mismas claves que `DATA_KEYS` en storage.js para que el export/import global funcione.
