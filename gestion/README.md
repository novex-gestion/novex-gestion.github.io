# NOVEX Gestión

CRM interno de NOVEX. Vive en `https://somosnovex.com/gestion/` (link discreto
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
4. **Cobros** — dos modos. *Mes*: cuotas mensuales por cliente (ID `clienteId_YYYY-MM`,
   regenerar no duplica), con cobros **parciales** y registro de dónde entró la plata
   (caja NOVEX o el bolsillo de un socio). *Cuenta corriente*: saldo acumulado por
   cliente = cuotas + cargos sueltos − cobrado. Los cargos (setup, trabajo extra,
   pauta) y los créditos (bonificaciones) se cargan con "+ Cargo".
5. **Gastos** — puntuales y fijos recurrentes (ID `fijoId_YYYY-MM`), categoría, cliente
   opcional (margen) y quién lo pagó. Lo cargado en ARS se convierte con el **blue
   promedio del día del gasto**, que se trae solo (ver abajo).
6. **Caja** — la plata de la sociedad. Los gastos pagados por la cuenta NOVEX y los
   cobros que entraron a la caja aparecen **solos**: no se cargan dos veces. A mano
   sólo se registran aportes, retiros, reintegros y ajustes.
7. **Socios** — el neteo. Cada socio tiene una cuenta con la sociedad: sube cuando pone
   (gastos de su bolsillo, aportes) y baja cuando saca (retiros, cobros que se quedó).
   La vista dice **quién le tiene que transferir cuánto a quién** para que el esfuerzo
   quede parejo según la participación, y registra esa transferencia de un click.
8. **Tareas** — pendientes por socio y por cliente, prioridad y vencimiento.

Extra: búsqueda global (Ctrl+K o ⌕ del tope) sobre leads/clientes/tareas/gastos.

## La plata: una sola fuente

`js/finanzas.js` es el motor: **todas** las reglas de la plata viven ahí y las vistas
sólo leen. Así caja, socios y cuenta corriente no pueden contradecirse. La tabla de
asientos está documentada en el encabezado del archivo.

Dos decisiones que conviene no olvidar:

- **El neteo lo paga quien puso de menos**, y eso *sube* su cuenta (puso más plata).
  Al revés, emparejar agrandaría la diferencia y el módulo pediría transferencias sin
  fin. Hay un test que lo cubre.
- **Lo vencido de un cliente nunca supera su saldo**: si se le bonificó algo, no se le
  puede reclamar.
- **Los nombres de los socios no se congelan en los textos.** El concepto de un neteo se
  arma al mostrarlo (`Neteo: Nico → Juan`), no al guardarlo: si alguien cambia de nombre,
  los movimientos viejos no quedan mintiendo. Si se escribe un concepto a mano, manda ese.
- `formularioMovimiento()` distingue **alta prellenada** de **edición** por `movimiento.id`,
  no por si vino un objeto: Socios lo abre con los datos del neteo cargados pero sin id.

Participación de los socios: `SOCIOS[uid].parte` en `js/config.js` (hoy 50/50). Cambiar
ese número recalcula todo el neteo; si las partes no suman 1 se normalizan.

Test: `node js/finanzas.test.mjs` (no necesita instalar nada ni tocar Firebase).

## El dólar

`js/dolar.js` trae el **blue promedio** ((compra + venta) / 2) y lo deja disponible para
todo el sistema. Dos fuentes, las dos con CORS abierto:

- **hoy** → `dolarapi.com` (se mueve durante el día)
- **días anteriores** → `api.argentinadatos.com` (serie ya cerrada)

Reglas que conviene no romper:

- Se usa **la cotización del día de la operación**, no la de hoy: convertir un gasto de
  hace tres meses con el dólar de hoy da un número que no existió nunca.
- El tipo de cambio **se completa solo pero es editable**. Si alguien lo escribe a mano,
  manda lo que escribió (pagar a otro tipo —tarjeta, cripto, un arreglo— es normal); la
  nota igual muestra cuál era el blue de ese día para poder comparar.
- Los gastos ya cargados **no se recalculan**: su `tc` quedó congelado, como debe ser.
- Las cotizaciones pasadas se guardan en Firestore (`cotizaciones/YYYY-MM-DD`): queda
  registro de con qué número se convirtió cada cosa y el sistema anda aunque la API se
  caiga. La de hoy no se cachea en la base, porque el mercado se sigue moviendo.
- Si no se puede traer la cotización, **no se inventa un número**: se pide a mano.

El blue de hoy se muestra en el tope de la app.

## Seguridad

- El repo es público: la `firebaseConfig` de `js/config.js` es pública **por diseño**;
  la seguridad real son Firebase Auth + las Security Rules (`firestore.rules`, la
  versión vigente se pega en la consola) que restringen lectura/escritura a los UIDs
  de los dos socios. Las colecciones nuevas (`movimientos`, `cargos`) quedan cubiertas
  por la regla catch-all de socios: no hubo que tocar las reglas. Lo mismo `cotizaciones`.
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
