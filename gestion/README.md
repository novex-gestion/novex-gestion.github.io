# NOVEX Gestión

CRM interno de NOVEX. Vive en `https://novex-gestion.github.io/gestion/` (link discreto
"gestión" en el pie de la landing). SPA vanilla sin build + Firebase (Auth + Firestore).

## Módulos

1. **Inicio** — alertas del día (consultas web, cuotas vencidas/por vencer, leads fríos
   5+ días, tareas) + P&L del mes (cobrado − gastos), gráfico 6 meses, margen por cliente.
2. **Pipeline** — leads por etapa (contacto → auditoría → propuesta → ganado/perdido),
   kanban con botones ‹ › y drag & drop en desktop. Ganado ofrece convertir en cliente.
   Bandeja de consultas del formulario de la landing (colección `consultas`, creación
   pública validada por reglas) → un click las convierte en lead.
3. **Clientes** — padrón con ficha 360°: datos, seguimiento (interacciones), pagos y
   plantillas de WhatsApp (seguimiento / cobro / bienvenida).
4. **Cobros** — cuotas mensuales por cliente (ID `clienteId_YYYY-MM`, regenerar no
   duplica), tablero recurrente/cobrado/pendiente/vencido, recordatorio por WhatsApp.
5. **Gastos** — puntuales y fijos recurrentes (ID `fijoId_YYYY-MM`), USD/ARS con tipo
   de cambio, categoría, cliente opcional (margen) y quién lo pagó (saldo entre socios).
6. **Tareas** — pendientes por socio y por cliente, prioridad y vencimiento.

Extra: búsqueda global (Ctrl+K o ⌕ del tope) sobre leads/clientes/tareas/gastos.

## Seguridad

- El repo es público: la `firebaseConfig` de `js/config.js` es pública **por diseño**;
  la seguridad real son Firebase Auth + las Security Rules (`firestore.rules`, la
  versión vigente se pega en la consola) que restringen lectura/escritura a los UIDs
  de los dos socios.
- Registro de usuarios deshabilitado en la consola (solo existen las 2 cuentas).
- `noindex` + sin robots.txt (un Disallow anunciaría la ruta).

## Convenciones

- Todo documento lleva trazabilidad `creadoPor/creadoEl/actualizadoPor/actualizadoEl`
  (helper `stamp()` de `js/firebase.js`).
- Datos en vivo: una sola suscripción por colección (`js/datos.js`), las vistas
  se re-pintan al cambiar la caché.
- Estética = tokens del sistema "Novex Editorial" de la landing (sin radios ni
  sombras, Poppins/IBM Plex Mono/Inter). `gestion/` queda FUERA de
  `design-system/sitio/` y del zip: es herramienta interna.
- Deploy: igual que la landing — commit + push (cuenta `novex-gestion`) y forzar
  build de Pages si se cuelga. Assets con `?v=N` por la caché del CDN.
