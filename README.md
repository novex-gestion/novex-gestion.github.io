# NOVEX — sitio web de la agencia

Landing de una página en HTML + CSS + JS vanilla, sin build ni dependencias.

Sistema visual **"Novex Editorial"** (handoff de Claude Design, specs completas en
`../marca/handoff-novex-editorial.md`): negro `#0b0b0c` con grilla y grano, acento naranja
`#D76526`, crema `#f5f4f1`, Poppins 700/800 uppercase gigante (line-height 0.9) +
IBM Plex Mono para etiquetas, sin radios ni sombras, side-nav fija con puntos.
Mezclado con la maquinaria de conversión de la versión anterior: paquetes con precios
"desde" (modelo del plan de negocio), proceso de cobro en 3 pasos, FAQ y formulario
que precarga WhatsApp. La versión clara anterior quedó en `../_archivo/web-editorial-clara-jul2026/`.

## Correr

Abrir `index.html` en el navegador, listo. Para servirlo local: `npx serve .`

## Antes de publicar

- **WhatsApp:** reemplazar el placeholder en la constante `WHATSAPP` de `main.js`
  y en el link del colofón.
- **Mail e Instagram del colofón:** `hola@novex.ar` y `@novex` son placeholders.
- **Dominio:** agregar `<link rel="canonical">` y URL al JSON-LD.
- **OG image:** generar 1200×630 con el iso sobre negro.
- **Precios:** son los pisos de los rangos del plan, "a validar" — al cerrarlos,
  actualizar los `paquete__precio` en `index.html` y la FAQ de costo.

## Estructura

```
web/
├── index.html      # secciones: inicio · servicios · paquetes · casos · metodo · faq · contacto
├── estilos.css     # tokens del handoff + componentes (grep "============")
├── main.js         # scramble, reveals, highlight, scroll-spy, cursor, form→WhatsApp
└── assets/         # novex-iso-dark.png (isotipo tema oscuro) + favicon.svg
```

## Decisiones

- **Mezcla deliberada** (pedida por Iván): el look experimental viene del handoff de Claude
  Design; el contenido comercial (recorrido de paquetes, precios "desde", extras, proceso,
  FAQ, form) viene de la versión anterior y del plan de negocio. El propio handoff pedía
  sumar paquetes y formulario.
- **Motion sin librerías**: el handoff sugería GSAP/Framer; está recreado con
  IntersectionObserver + CSS + un scramble propio en JS. Todo respeta `prefers-reduced-motion`
  (sin scramble, sin grano animado, sin cursor custom) y el cursor solo aparece con
  puntero fino (no táctil).
- **Side-nav** se oculta bajo 900px (el contenido pasa a ancho completo).
- La diagonal ascendente de la marca sigue siendo la viñeta de las listas.
