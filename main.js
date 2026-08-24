// NOVEX — interacción de la landing editorial
// Sin librerías: IntersectionObserver + CSS. Respeta prefers-reduced-motion.

const WHATSAPP = '5491178201430';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLIFOS = '!@#$%&*<>?/[]{}XZ0123456789';

// --- Scramble de texto: fija los caracteres de izquierda a derecha ---
function scramble(el, duracion = 850) {
  const texto = el.dataset.textoFinal || el.textContent;
  el.dataset.textoFinal = texto;
  const inicio = performance.now();

  function cuadro(ahora) {
    const progreso = Math.min((ahora - inicio) / duracion, 1);
    const fijos = Math.floor(texto.length * progreso);
    let salida = '';
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (i < fijos || /[\s.,—·]/.test(c)) salida += c;
      else salida += GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
    }
    el.textContent = salida;
    if (progreso < 1) requestAnimationFrame(cuadro);
    else el.textContent = texto;
  }
  requestAnimationFrame(cuadro);
}

// hero: scramble al cargar
if (!reduceMotion) {
  document.querySelectorAll('[data-scramble]').forEach((el) => {
    const delay = parseInt(el.dataset.scrambleDelay || '0', 10);
    setTimeout(() => scramble(el), 150 + delay);
  });

  // labels de botones: scramble en hover
  document.querySelectorAll('[data-scramble-hover]').forEach((btn) => {
    const label = btn.querySelector('.btn__label');
    if (!label) return;
    btn.addEventListener('mouseenter', () => scramble(label, 450));
  });
}

// --- Reveals al scroll ---
const revelador = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revelador.unobserve(e.target);
      }
    }
  },
  { threshold: 0.15 }
);
document.querySelectorAll('[data-reveal]').forEach((el) => revelador.observe(el));

// --- Highlight del método: barrido naranja al entrar ---
const resaltador = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        e.target.classList.add('activo');
        resaltador.unobserve(e.target);
      }
    }
  },
  { threshold: 0.6 }
);
document.querySelectorAll('.resalte').forEach((el) => resaltador.observe(el));

// --- Side-nav: sección activa ---
const items = [...document.querySelectorAll('.lateral__item')];
if (items.length) {
  const espia = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const id = '#' + e.target.id;
        items.forEach((a) => a.classList.toggle('activa', a.getAttribute('href') === id));
      }
    },
    { threshold: 0.4 }
  );
  items.forEach((a) => {
    const seccion = document.querySelector(a.getAttribute('href'));
    if (seccion) espia.observe(seccion);
  });
}

// --- Servicios: flechas del slide (mobile) ---
const pista = document.getElementById('pista-servicios');
document.querySelectorAll('.servicios__flecha').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!pista) return;
    const tarjeta = pista.querySelector('.servicio');
    const paso = tarjeta ? tarjeta.getBoundingClientRect().width + 14 : 300;
    pista.scrollBy({ left: paso * Number(btn.dataset.slide), behavior: 'smooth' });
  });
});

// --- Botón flotante: se esconde al llegar al formulario ---
const flotante = document.getElementById('btn-flotante');
const seccionContacto = document.getElementById('contacto');
if (flotante && seccionContacto) {
  new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) flotante.classList.toggle('oculto', e.isIntersecting);
    },
    { threshold: 0.12 }
  ).observe(seccionContacto);
}

// --- Turnos: próximos lunes y viernes para la meet ---
const selectorDia = document.getElementById('turno-dia');
if (selectorDia) {
  const opciones = [];
  const d = new Date();
  d.setDate(d.getDate() + 1); // desde mañana
  while (opciones.length < 6) {
    if (d.getDay() === 1 || d.getDay() === 5) {
      const nombreDia = d
        .toLocaleDateString('es-AR', { weekday: 'long' })
        .replace(/^\w/, (c) => c.toUpperCase());
      opciones.push(`${nombreDia} ${d.getDate()}/${d.getMonth() + 1}`);
    }
    d.setDate(d.getDate() + 1);
  }
  for (const texto of opciones) {
    const op = document.createElement('option');
    op.textContent = texto;
    selectorDia.appendChild(op);
  }
}

// --- Formulario → WhatsApp con turno elegido ---
const form = document.getElementById('form-auditoria');

if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const nombre = form.nombre.value.trim();
    const negocio = form.negocio.value.trim();
    const telefono = form.telefono.value.trim();
    const email = form.email.value.trim();
    const rubro = form.rubro.value;
    const dia = form.dia.value;
    const hora = form.hora.value;
    const error = form.querySelector('.form__error');

    if (!nombre || !negocio || !telefono || !email || !dia || !hora) {
      error.hidden = false;
      return;
    }
    error.hidden = true;

    const turno = `${dia} a las ${hora}`;
    const mensaje =
      `Hola! Soy ${nombre}, de ${negocio}` +
      (rubro ? ` (${rubro.toLowerCase()})` : '') +
      `. Quiero agendar la auditoría gratis el ${turno}. ` +
      `Mi WhatsApp: ${telefono} · Mi mail: ${email}.`;

    // Registrar la consulta en la gestión (best-effort, no bloquea el WhatsApp)
    fetch('https://firestore.googleapis.com/v1/projects/novex-gestion/databases/(default)/documents/consultas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          nombre: { stringValue: nombre.slice(0, 120) },
          negocio: { stringValue: negocio.slice(0, 120) },
          rubro: { stringValue: (rubro || '').slice(0, 60) },
          telefono: { stringValue: telefono.slice(0, 40) },
          email: { stringValue: email.slice(0, 120) },
          turno: { stringValue: turno.slice(0, 80) },
          origen: { stringValue: 'web' },
          estado: { stringValue: 'nueva' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      }),
    }).catch(() => {});

    window.open(
      `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`,
      '_blank',
      'noopener,noreferrer'
    );
  });
}
