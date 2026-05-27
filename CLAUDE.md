# CLAUDE.md — Partes de Locomoción (CHT)

## Descripción del proyecto

PWA (Progressive Web App) para gestionar la documentación del Servicio de Locomoción de la Confederación Hidrográfica del Tajo. Sin backend, sin dependencias externas, 100% frontend estático.

**URL de producción (beta):** https://naerys27.github.io/prueba/

---

## Estructura del proyecto

```
prueba/
├── index.html                  # Pantalla principal / menú
├── parte_servicio_diario.html  # Módulo partes diarios de vehículos
├── parte_combustible.html      # Módulo partes mensuales de combustible
├── orden_reparacion.html       # Módulo órdenes de reparación y suministro
├── storage.js                  # Capa de almacenamiento (localStorage + File System Access API)
├── sw.js                       # Service Worker (caché offline, versión actual: v58)
├── manifest.json               # Manifiesto PWA
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Tecnologías

- **HTML/CSS/JS puro** — sin frameworks, sin build tools, sin npm
- **jsPDF** — generación de PDFs en cliente (incrustado en cada HTML)
- **File System Access API** — vinculación de archivo JSON externo para persistencia cross-device
- **IndexedDB** — almacena el file handle entre sesiones (via storage.js)
- **Service Worker** — caché offline y detección de actualizaciones
- **PWA** — instalable en móvil y PC via manifest.json

---

## Comandos

No hay build ni compilación. El proyecto se sirve directamente como archivos estáticos.

**Desarrollo local:**
Abrir los `.html` directamente en Chrome/Edge, o servir con cualquier servidor estático:
```bash
# opción simple con Python
python -m http.server 8080
```

**Deploy:**
```bash
git add .
git commit -m "descripción"
git push origin main
```
GitHub Pages publica automáticamente desde la rama `main`.

**IMPORTANTE — tras cada deploy:** incrementar la versión del Service Worker en `sw.js`:
```javascript
const CACHE = 'partes-loco-vN';  // incrementar N
```
Si no se incrementa, los usuarios seguirán usando la versión cacheada anterior.

---

## Arquitectura de almacenamiento

`storage.js` expone el objeto global `FSStorage` que actúa como capa de abstracción:

| Estado | Comportamiento |
|--------|---------------|
| Sin archivo vinculado | Lee/escribe en `localStorage` |
| Archivo vinculado + permiso concedido | Lee/escribe en JSON externo Y en `localStorage` simultáneamente |
| Archivo vinculado + permiso pendiente | Lee de `localStorage`, muestra banner "Reconectar" |

**Claves de datos en storage:**
- `partes_vehiculos_v1` — base de datos de vehículos
- `partes_conductores_v1` — lista de conductores
- `cht_parte_servicio_diario_v1` — historial partes diarios
- `cht_orden_reparacion_v1` — historial órdenes de reparación
- `partes_combustible_hist_v1` — historial partes combustible

**Retención de datos:**
- Partes diarios: 3 meses (purga automática)
- Partes combustible: 6 meses (purga automática)
- Órdenes de reparación: 6 meses (purga automática)

---

## Generación de PDFs

Cada módulo tiene su propia función `draw*Institucional(doc)` que dibuja el PDF con jsPDF.

**Constantes de layout A4 (mm):**
- `ML = 12` — margen izquierdo
- `CW = 186` — ancho de contenido
- `PW = 210` — ancho de página
- Estilos rect válidos en jsPDF: `'S'`, `'F'`, `'FD'`, `'DF'` — **nunca `'SD'`**

**Cabecera estándar (los 3 módulos):**
- Logo CHT izquierda (129.8×22.3mm)
- "Locomocion" bold azul oscuro, alineado a la derecha
- Fecha/mes en gris claro, alineado a la derecha
- Línea separadora azul

**Banner post-generación (`_showPDFOpenModal` / `showPDFSaved`):**
Todos los módulos muestran un modal bottom-sheet con dos botones en fila: "Cerrar" (izquierda) y "Abrir PDF ↗" (derecha). El blob URL se pasa como segundo parámetro y se revoca al cerrar.

---

## Convenciones de código

- **Sin frameworks, sin ES6 modules** — todo en `var`, funciones globales, compatible con Chrome/Edge modernos
- **Parte diario** usa `const`/`let` y arrow functions (estilo más moderno que los otros dos módulos)
- **Sin comentarios** salvo que el WHY no sea obvio
- **IDs de formulario** son los nombres de campo directos: `matricula`, `fecha`, `conductor`, etc.
- `gv(id)` — helper para `document.getElementById(id).value`
- `q(selector)` — helper para `document.querySelector(selector)` (solo en parte diario)
- Borradores (`saveDraft`/`checkDraft`): clave `DRAFT_KEY` distinta por módulo, expiran a las 2 horas
- Tema claro/oscuro: `localStorage` clave `partes_theme`, atributo `data-theme="dark"` en `<html>`

---

## Decisiones de arquitectura

**Todo en un solo HTML por módulo**
jsPDF se incrusta completo en cada HTML para garantizar funcionamiento offline sin CDN externo. Hace los archivos grandes pero elimina dependencias externas.

**localStorage como fallback siempre activo**
Incluso con archivo JSON vinculado, se escribe en localStorage simultáneamente. Garantiza que los datos nunca se pierden si el archivo no está disponible.

**File System Access API en vez de sincronización cloud**
Se descartó OneDrive/Graph API por restricciones de la cuenta corporativa AGE (sin posibilidad de registrar app en Azure). El archivo JSON local es el mecanismo de portabilidad entre dispositivos.

**Sin Service Worker scope personalizado**
El SW cubre `./` para simplicidad. A tener en cuenta si se despliega en subcarpeta de servidor.

