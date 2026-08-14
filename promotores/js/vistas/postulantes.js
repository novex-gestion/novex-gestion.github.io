// 01 · POSTULANTES — la bandeja de Juno.
// Acá caen los candidatos a activador del canal Clover: Juno los contacta por
// WhatsApp, los clasifica y escala; el equipo decide y registra el desenlace.
import {
  doc, updateDoc, deleteDoc, serverTimestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { ESTADOS_POSTULANTE, nombrePersona, nombreAutor } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtFechaCorta, haceDias, aFecha, modal, confirmar, toast, selectHtml,
} from '../../../gestion/js/ui.js';

// Los que piden atención humana primero.
const CALIENTES = ['interesado', 'agendado'];

// El paso siguiente del embudo, para avanzar con un solo botón.
const PROXIMO = {
  nuevo: 'contactado',
  contactado: 'interesado',
  interesado: 'agendado',
  agendado: 'manuales',
  manuales: 'activo',
  no_responde: 'contactado',
  descartado: 'contactado',
  // 'activo' no tiene siguiente: ya está en la calle.
};

// 5491164127127 -> 11 6412-7127
function telLindo(t) {
  const d = String(t || '').replace(/\D/g, '').replace(/^549?/, '');
  if (d.length !== 10) return t || '—';
  const area = d.length === 10 && d.startsWith('11') ? 2 : 3;
  const resto = d.slice(area);
  return `${d.slice(0, area)} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

export function montarPostulantes(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Postu<em>lantes</em></h1>
        <p class="vista__sub mono" id="pos-resumen"></p>
      </div>
    </div>
    <div class="kpis" id="pos-kpis"></div>
    <div class="filtros" id="pos-filtros"></div>
    <div class="filas" id="pos-lista"></div>`;

  let filtro = 'pendientes';

  function pintar() {
    const lista = raiz.querySelector('#pos-lista');
    if (!lista) return;

    const todos = cache.postulantes || [];
    const cuenta = (e) => todos.filter((p) => (p.estado || 'nuevo') === e).length;
    const calientes = todos.filter((p) => CALIENTES.includes(p.estado)).length;

    raiz.querySelector('#pos-resumen').textContent =
      `${todos.length} postulantes` + (calientes ? ` · ${calientes} esperando respuesta tuya` : '');

    // El embudo de un vistazo.
    raiz.querySelector('#pos-kpis').innerHTML = ESTADOS_POSTULANTE
      .filter((e) => e.enResumen)
      .map((e) => `
        <div class="kpi">
          <p class="kpi__nombre">${esc(e.nombre)}</p>
          <p class="kpi__valor">${cuenta(e.id)}</p>
        </div>`).join('');

    const filtros = [
      { id: 'pendientes', nombre: 'Para atender' },
      { id: 'todos', nombre: 'Todos' },
      ...ESTADOS_POSTULANTE.map((e) => ({ id: e.id, nombre: e.nombre })),
    ];
    raiz.querySelector('#pos-filtros').innerHTML = filtros.map((f) =>
      `<button type="button" class="filtro ${f.id === filtro ? 'activo' : ''}" data-f="${esc(f.id)}">${esc(f.nombre)}</button>`
    ).join('');
    raiz.querySelectorAll('#pos-filtros .filtro').forEach((b) =>
      b.addEventListener('click', () => { filtro = b.dataset.f; pintar(); })
    );

    const visibles = todos
      .filter((p) => {
        const e = p.estado || 'nuevo';
        if (filtro === 'todos') return true;
        if (filtro === 'pendientes') return CALIENTES.includes(e);
        return e === filtro;
      })
      .sort((a, b) => {
        // Primero los que esperan respuesta, después por actividad reciente.
        const ca = CALIENTES.includes(a.estado) ? 0 : 1;
        const cb = CALIENTES.includes(b.estado) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        const fa = aFecha(a.ultimaActividad) || aFecha(a.creadoEl);
        const fb = aFecha(b.ultimaActividad) || aFecha(b.creadoEl);
        return (fb?.getTime() || 0) - (fa?.getTime() || 0);
      });

    lista.innerHTML = visibles.map((p) => {
      const estado = p.estado || 'nuevo';
      const apagado = ['descartado', 'no_responde'].includes(estado);
      // Quién tocó la ficha por última vez: Juno, Juan o Mati.
      const autor = nombreAutor(p.actualizadoPor);
      const detalle = [
        p.localidad,
        p.ultimaActividad ? haceDias(p.ultimaActividad) : null,
        p.puntaje ? `${p.puntaje} pts` : null,
        autor ? `por ${autor}` : null,
      ].filter(Boolean).join(' · ');
      const wa = String(p.telefono || '').replace(/\D/g, '');
      const sigue = PROXIMO[estado];
      return `
        <article class="fila fila--pos ${apagado ? 'fila--apagada' : ''}" data-id="${esc(p.id)}">
          <div class="pos__cab">
            <p class="fila__nombre">${esc(p.nombre || 'Sin nombre')}</p>
            <span class="estado-envoltura">
              <select class="estado-rapido" data-e="${esc(estado)}" aria-label="Estado de ${esc(p.nombre || '')}">
                ${selectHtml(ESTADOS_POSTULANTE, estado)}
              </select>
            </span>
          </div>

          <p class="fila__detalle">${esc(detalle || '—')}</p>
          ${p.llamadaCuando ? `<p class="pos__llamada">📞 Llamada: ${esc(p.llamadaCuando)}</p>` : ''}
          ${p.materialEnviado ? `<p class="pos__material">✓ Material enviado · ${esc(fmtFechaCorta(p.materialEnviado))}</p>`
            : (estado === 'manuales' ? '<p class="pos__material pos__material--espera">⏳ Juno le manda el material en unos minutos</p>' : '')}
          ${p.perfil ? `<p class="pos__perfil">${esc(p.perfil)}</p>` : ''}
          ${p.junoResumen ? `<p class="pos__juno">${esc(p.junoResumen)}</p>` : ''}
          ${ultimaNota(p)}
          <p class="pos__contacto">${esc(telLindo(p.telefono))}${p.email ? ' · ' + esc(p.email) : ''}</p>

          <div class="pos__acciones">
            ${botonJuno(p)}
            ${wa ? `<a class="boton boton--chico" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" data-no-abrir>WhatsApp</a>` : ''}
            ${sigue ? `<button type="button" class="boton boton--chico boton--lleno" data-avanzar>→ ${esc(nombreEstado(sigue))}</button>` : ''}
            ${estado !== 'descartado' ? '<button type="button" class="boton boton--chico" data-descartar>Descartar</button>' : ''}
            <button type="button" class="boton boton--chico" data-ficha>Ficha</button>
          </div>
        </article>`;
    }).join('') ||
      (cache.listo.postulantes
        ? '<p class="vacio">// Nada por acá todavía.</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila').forEach((el) => {
      const p = (cache.postulantes || []).find((x) => x.id === el.dataset.id);
      if (!p) return;
      const sel = el.querySelector('.estado-rapido');
      sel.addEventListener('change', (ev) => cambiarEstado(p, ev.target));

      el.querySelector('[data-ficha]').addEventListener('click', () => detallePostulante(p));
      el.querySelector('[data-juno]')?.addEventListener('click', (ev) => pedirContacto(p, ev.target));
      el.querySelector('[data-avanzar]')?.addEventListener('click', () =>
        moverA(p, PROXIMO[p.estado || 'nuevo'], sel));
      el.querySelector('[data-descartar]')?.addEventListener('click', () =>
        moverA(p, 'descartado', sel));
    });
  }

  // Cambio de estado en la lista misma: es lo que la vuelve un pipeline
  // sin necesidad de arrastrar tarjetas.
  function cambiarEstado(p, select) {
    return moverA(p, select.value, select);
  }

  async function moverA(p, nuevo, select) {
    const previo = p.estado || 'nuevo';
    if (!nuevo || nuevo === previo) return;
    if (select) select.dataset.guardando = '1';
    try {
      await updateDoc(doc(db, 'postulantes', p.id), {
        estado: nuevo,
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      if (select) { select.value = nuevo; select.dataset.e = nuevo; }
      toast(`${(p.nombre || 'Postulante').split(' ')[0]} → ${nombreEstado(nuevo)}`);
    } catch (err) {
      console.error(err);
      if (select) select.value = previo;   // que la pantalla no mienta
      toast('No se pudo cambiar el estado', true);
    } finally {
      if (select) delete select.dataset.guardando;
    }
  }

  // La última nota que escribió alguien del equipo, ahí en la fila: si hay que
  // abrir la ficha para leerla, en la práctica no se lee.
  function ultimaNota(p) {
    const notas = Array.isArray(p.historial) ? p.historial : [];
    if (!notas.length) return '';
    const n = notas[notas.length - 1];
    const previas = notas.length > 1 ? ` · +${notas.length - 1} nota${notas.length > 2 ? 's' : ''} más` : '';
    const firma = [n.quien, n.fecha ? fmtFechaCorta(n.fecha) : ''].filter(Boolean).join(', ');
    return `<p class="pos__nota">${esc(n.texto)}
      <span class="pos__nota-meta">— ${esc(firma)}${esc(previas)}</span></p>`;
  }

  // ---- Pedirle a Juno que lo contacte ----
  // El pedido entra a una COLA: Juno lo levanta en su próximo turno, respetando
  // el cupo diario y el horario. No dispara el mensaje al instante a propósito,
  // para que nadie pueda mandar 40 de golpe y quemar el número.
  function botonJuno(p) {
    if (p.contactadoEl) return '';                    // Juno ya le escribió
    if (p.contactoPedido) {
      const quien = p.contactoPedidoPor ? ` (pidió ${p.contactoPedidoPor})` : '';
      return `<span class="pos__encola">⏳ En cola${esc(quien)}</span>`;
    }
    return '<button type="button" class="boton boton--chico" data-juno>Contactar</button>';
  }

  async function pedirContacto(p, boton) {
    boton.disabled = true;
    boton.textContent = 'Encolando…';
    try {
      await updateDoc(doc(db, 'postulantes', p.id), {
        contactoPedido: serverTimestamp(),
        contactoPedidoPor: nombrePersona(auth.currentUser.uid),
        ultimaActividad: serverTimestamp(),
        ...stamp(),
      });
      toast(`${(p.nombre || '').split(' ')[0]} va a la cola de Juno`);
    } catch (err) {
      console.error(err);
      boton.disabled = false;
      boton.textContent = 'Contactar';
      toast('No se pudo encolar', true);
    }
  }

  function nombreEstado(id) {
    const e = ESTADOS_POSTULANTE.find((x) => x.id === id);
    return e ? e.nombre : id;
  }

  // ============ DETALLE ============
  function detallePostulante(p) {
    const wa = String(p.telefono || '').replace(/\D/g, '');
    const historial = Array.isArray(p.historial) ? [...p.historial].reverse() : [];

    const m = modal(p.nombre || 'Postulante', `
      <div class="modal__cuerpo">
        <div class="datos">
          <div><p class="dato__nombre">Teléfono</p><p class="dato__valor">${
            wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${esc(p.telefono)}</a>` : '—'
          }</p></div>
          <div><p class="dato__nombre">Localidad</p><p class="dato__valor">${esc(p.localidad || '—')}</p></div>
          <div><p class="dato__nombre">Email</p><p class="dato__valor">${esc(p.email || '—')}</p></div>
          <div><p class="dato__nombre">Origen</p><p class="dato__valor">${esc(p.origen || '—')}</p></div>
          <div><p class="dato__nombre">Primer contacto</p><p class="dato__valor">${
            p.contactadoEl ? fmtFechaCorta(p.contactadoEl) : '—'}</p></div>
          <div><p class="dato__nombre">Última actividad</p><p class="dato__valor">${
            p.ultimaActividad ? fmtFechaCorta(p.ultimaActividad) : '—'}</p></div>
        </div>

        ${p.perfil ? `<p class="ficha">${esc(p.perfil)}</p>` : ''}
        ${p.junoResumen ? `<p class="ficha"><b>Juno:</b> ${esc(p.junoResumen)}</p>` : ''}
        ${p.motivo ? `<p class="ficha"><b>Motivo:</b> ${esc(p.motivo)}</p>` : ''}

        <div class="campo">
          <label class="campo__nombre" for="pos-estado">Estado</label>
          <select id="pos-estado">${selectHtml(ESTADOS_POSTULANTE, p.estado || 'nuevo')}</select>
        </div>

        <div class="campo">
          <label class="campo__nombre" for="pos-nota">Agregar una nota</label>
          <textarea id="pos-nota" rows="2" placeholder="Qué pasó en la llamada…"></textarea>
        </div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--peligro boton--chico" data-borrar>Borrar</button>
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-guardar>Guardar</button>
        </div>

        ${historial.length ? `
          <h3 class="campo__nombre" style="margin-top:1.2rem">Historial</h3>
          ${historial.map((h) => `
            <div class="interaccion">
              <p class="interaccion__meta">${esc(fmtFechaCorta(h.fecha))} · ${esc(h.quien || 'Juno')}</p>
              <p class="interaccion__texto">${esc(h.texto)}</p>
            </div>`).join('')}` : ''}
      </div>`);

    m.el.querySelector('[data-guardar]').addEventListener('click', async () => {
      const estado = m.el.querySelector('#pos-estado').value;
      const nota = m.el.querySelector('#pos-nota').value.trim();
      try {
        const cambios = { estado, ultimaActividad: serverTimestamp(), ...stamp() };
        if (nota) {
          cambios.historial = arrayUnion({
            fecha: new Date().toISOString(),
            texto: nota,
            quien: nombrePersona(auth.currentUser.uid),
          });
        }
        await updateDoc(doc(db, 'postulantes', p.id), cambios);
        m.cerrar();
        toast('Guardado');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });

    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      if (!(await confirmar(`¿Borrar a ${p.nombre}? No se puede deshacer.`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'postulantes', p.id));
        m.cerrar();
        toast('Borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  pintar();
  return alCambiar((col) => { if (col === 'postulantes') pintar(); });
}
