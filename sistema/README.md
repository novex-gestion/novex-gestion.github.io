# NOVEX · Sistema de gestión adaptable

Vive en `https://somosnovex.com/sistema/`. Es el producto que NOVEX le vende a una PyME:
**un solo motor de gestión que se adapta a cada negocio sin tocar el código**.

## La idea

Todo lo que cambia entre un cliente y otro vive en un **paquete de negocio**: un JSON con
`{ perfil, datos }`.

- **`perfil`** — cómo se llaman las cosas (obra / línea / canal), qué módulos se encienden,
  en qué moneda se mide, qué forma tiene el embudo comercial y hasta qué columnas tiene
  cada tabla.
- **`datos`** — las tablas, siempre con la misma forma: `unidades`, `cuotas`, `facturas`,
  `stock`, `pnl`, `leads`, `clientes`.

`js/sistema.js` no sabe de rubros: no tiene una sola condición por tipo de negocio. Dar de
alta un cliente nuevo es escribir su paquete, no forkear nada. El botón **perfil.json** de
la barra muestra en vivo el perfil del negocio abierto: es el argumento de venta.

## Los datos no viven acá

El sitio es **público**, así que es un cascarón: se publica el motor, nunca los datos de un
cliente. Sólo van al repo los dos **negocios de ejemplo**, que son inventados:

- **ALDEA NORTE** — constructora. Vende por contrato (anticipo + 12 cuotas), mide avance de
  obra y margen. USD. Embudo de dos tramos con pase.
- **FUEGO** — restaurante. Factura todos los días, la unidad es el canal (salón, delivery,
  eventos), controla insumos. ARS. Embudo de eventos de un tramo.

El paquete de un cliente real se carga con **"Cargar un negocio"** o arrastrando el archivo,
y vive fuera del repositorio (en `16-novex/sistema-paquetes/`, que no se versiona). El
`.gitignore` de la raíz bloquea cualquier `sistema/datos/*.json` que no sea `muestra-*`.

Para regenerar los de ejemplo: `node sistema-paquetes/generar-muestras.js`.

## Dos trampas que ya costaron caro

- **`.soltar[hidden]` necesita `display: none !important`.** La zona de arrastre ocupa toda
  la pantalla; su `display: grid` pisa al atributo `hidden` y la capa invisible se come
  todos los clics. La página parecía bien y no respondía a nada.
- **Las vistas se invocan con `fn.call(Vistas, ...)`**, no `fn(...)`. Se apoyan entre ellas
  con `this` (comparten definiciones de columnas) y llamarlas sueltas rompe cada tabla.

## Reglas que el motor respeta

- **Un módulo sin datos se apaga, no se muestra en cero.** Si el sistema origen no tiene
  costos, Resultado queda apagado y la pantalla explica qué falta para encenderlo: un cero
  inventado es peor que un dato que falta, porque alguien lo usa para decidir.
- **Lo que no se puede valorizar se dice.** El stock sin precio de referencia muestra "sin
  precio", no un cero.
- **Las señales son reglas explícitas**, no magia: concentración de ventas, meses de stock,
  saldos viejos, arrastre sin conciliar, clientes dormidos. Si falta el dato, la señal no
  aparece.
