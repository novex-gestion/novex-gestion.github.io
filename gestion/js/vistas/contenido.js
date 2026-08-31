// 07 · BLOG — el tablero editorial: ideas y tareas de contenido como tickets.
// Flujo: Ideas → Brief → Redacción → Revisión → Publicado (+ Descartada).
// Claude redacta desde los briefs; el equipo aprueba en Revisión.
import {
  collection, doc, addDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { ESTADOS_CONTENIDO, RUBROS_CONTENIDO, nombreSocio } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { montarAdjuntos, selloAdjuntos } from '../adjuntos.js';
import {
  esc, fmtFecha, fmtFechaCorta, haceDias, aFecha, aInputFecha, fechaDeInput,
  modal, confirmar, toast, selectHtml, normalizar,
} from '../ui.js';

const ENCARGADOS = [
  { id: 'claude', nombre: 'Claude (redacta)' },
  { id: 'equipo', nombre: 'Equipo' },
];

function nombreRubro(id) {
  const r = RUBROS_CONTENIDO.find((r) => r.id === id);
  return r ? r.nombre : id || '—';
}

function nombreEncargado(id) {
  const e = ENCARGADOS.find((e) => e.id === id);
  return e ? e.nombre.split(' ')[0] : nombreSocio(id);
}

export function montarContenido(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">B<em>log</em></h1>
        <p class="vista__sub mono" id="cont-resumen"></p>
      </div>
      <button type="button" class="boton boton--lleno boton--chico" id="btn-nueva-idea">+ Idea</button>
    </div>
    <div class="kanban" id="cont-kanban"></div>`;

  raiz.querySelector('#btn-nueva-idea').addEventListener('click', () => formularioTicket(null));

  function pintar() {
    const kanban = raiz.querySelector('#cont-kanban');
    if (!kanban) return;
    const todos = cache.contenido || [];
    const activos = todos.filter((t) => !['publicado', 'descartada'].includes(t.estado));
    const publicados = todos.filter((t) => t.estado === 'publicado').length;
    raiz.querySelector('#cont-resumen').textContent =
      `${activos.length} en el tablero · ${publicados} publicado${publicados === 1 ? '' : 's'} · 1 por semana`;

    kanban.innerHTML = ESTADOS_CONTENIDO.map((etapa, i) => {
      const tickets = todos
        .filter((t) => (t.estado || 'idea') === etapa.id)
        .sort((a, b) => (aFecha(b.estadoCambiadoEl)?.getTime() || 0) - (aFecha(a.estadoCambiadoEl)?.getTime() || 0));
      return `
        <section class="columna" data-etapa="${etapa.id}">
          <header class="columna__cab">
            <span class="columna__nombre"><span class="num">0${i + 1}</span>${esc(etapa.nombre)}</span>
            <span class="columna__datos">${tickets.length}</span>
          </header>
          <div class="columna__cuerpo">
            ${tickets.map((t) => tarjeta(t)).join('') ||
              (cache.listo.contenido ? '<p class="vacio">—</p>' : '<p class="vacio">cargando…</p>')}
          </div>
        </section>`;
    }).join('');

    kanban.querySelectorAll('.lead').forEach((el) => {
      const t = (cache.contenido || []).find((x) => x.id === el.dataset.id);
      if (!t) return;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.lead__flecha')) return;
        detalleTicket(t.id);
      });
      el.querySelectorAll('.lead__flecha').forEach((btn) =>
        btn.addEventListener('click', () => mover(t, Number(btn.dataset.delta)))
      );
    });
  }

  function tarjeta(t) {
    const idx = ESTADOS_CONTENIDO.findIndex((e) => e.id === (t.estado || 'idea'));
    const vencida = t.fechaObjetivo && aFecha(t.fechaObjetivo) < new Date() && !['publicado', 'descartada'].includes(t.estado);
    return `
      <article class="lead" data-id="${esc(t.id)}">
        <p class="lead__negocio">${esc(t.titulo)}</p>
        ${t.pregunta ? `<p class="lead__detalle">${esc(t.pregunta)}</p>` : ''}
        <p class="lead__detalle">${esc([
          nombreRubro(t.rubro),
          nombreEncargado(t.encargado),
          t.fechaObjetivo ? 'para el ' + fmtFechaCorta(t.fechaObjetivo) : null,
          haceDias(t.estadoCambiadoEl) + ' acá',
        ].filter(Boolean).join(' · '))}</p>
        <div class="lead__pie">
          <div class="lead__sellos">
            ${vencida ? '<span class="sello sello--rojo">Atrasada</span>' : ''}
            ${t.linkPublicado ? '<span class="sello sello--verde">Online</span>' : ''}
            ${selloAdjuntos(t.adjuntos)}
          </div>
          <div class="lead__mover">
            <button type="button" class="lead__flecha" data-delta="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Etapa anterior">‹</button>
            <button type="button" class="lead__flecha" data-delta="1" ${idx >= ESTADOS_CONTENIDO.length - 2 ? 'disabled' : ''} aria-label="Etapa siguiente">›</button>
          </div>
        </div>
      </article>`;
  }

  async function mover(t, delta) {
    const idx = ESTADOS_CONTENIDO.findIndex((e) => e.id === (t.estado || 'idea'));
    const destino = ESTADOS_CONTENIDO[idx + delta];
    if (!destino || destino.id === 'descartada') return;
    if (destino.id === 'publicado' && !t.linkPublicado) return pedirLink(t);
    try {
      await updateDoc(doc(db, 'contenido', t.id), {
        estado: destino.id, estadoCambiadoEl: serverTimestamp(), ...stamp(),
      });
    } catch (err) { console.error(err); toast('No se pudo mover', true); }
  }

  // Publicado sin link no existe: el link ES el criterio de terminado.
  function pedirLink(t) {
    const m = modal(`Publicado: ${t.titulo}`, `
      <form id="form-link">
        <label class="campo">
          <span class="campo__nombre mono">Link del artículo publicado *</span>
          <input type="url" name="link" required placeholder="https://somosnovex.com/blog/...">
        </label>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton--lleno">Marcar publicado</button>
        </div>
      </form>`);
    m.el.querySelector('#form-link').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await updateDoc(doc(db, 'contenido', t.id), {
          estado: 'publicado',
          linkPublicado: e.target.link.value.trim(),
          estadoCambiadoEl: serverTimestamp(),
          ...stamp(),
        });
        m.cerrar();
        toast('Publicado 🎉');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
  }

  // ============ DETALLE ============
  function detalleTicket(id) {
    const t = (cache.contenido || []).find((x) => x.id === id);
    if (!t) return;
    const notas = (t.notas || []).slice().reverse();
    const m = modal(t.titulo, `
      <div class="modal__cuerpo">
        <div class="datos">
          ${dato('Estado', ESTADOS_CONTENIDO.find((e) => e.id === t.estado)?.nombre)}
          ${dato('Rubro', nombreRubro(t.rubro))}
          ${dato('Redacta', nombreEncargado(t.encargado))}
          ${dato('Fecha objetivo', t.fechaObjetivo ? fmtFecha(t.fechaObjetivo) : '')}
          ${dato('Cargada por', nombreSocio(t.creadoPor))}
        </div>
        ${t.pregunta ? `<p class="modal__nota">// Pregunta objetivo: ${esc(t.pregunta)}</p>` : ''}
        ${t.brief ? `<div><p class="campo__nombre mono" style="margin-bottom:6px">Brief</p><p style="white-space:pre-wrap; font-size:14px">${esc(t.brief)}</p></div>` : ''}
        ${t.linkPublicado ? `<a class="boton boton--chico" href="${esc(t.linkPublicado)}" target="_blank" rel="noopener" style="text-decoration:none; align-self:flex-start">Ver artículo →</a>` : ''}

        <div>
          <p class="campo__nombre mono" style="margin-bottom:8px">Notas</p>
          ${notas.map((n) => `
            <div class="interaccion">
              <p class="interaccion__meta">${esc(fmtFecha(n.fecha))} · ${esc(nombreSocio(n.por) || n.por || '')}</p>
              <p class="interaccion__texto">${esc(n.texto)}</p>
            </div>`).join('') || '<p class="modal__nota">// Sin notas.</p>'}
        </div>
        <form id="form-nota" style="display:flex; gap:8px">
          <input type="text" name="texto" placeholder="Agregar nota…" required
            style="flex:1; background:var(--negro); border:1px solid var(--borde); color:var(--crema); padding:9px 12px; font-family:var(--body); font-size:14px">
          <button type="submit" class="boton boton--chico">Sumar</button>
        </form>

        <div id="idea-adjuntos"></div>

        <div class="modal__acciones">
          <button type="button" class="boton boton--peligro" data-borrar>Borrar</button>
          <button type="button" class="boton" data-descartar>Descartar</button>
          <button type="button" class="boton" data-editar>Editar</button>
        </div>
      </div>`);

    // Referencias, capturas, el brief en PDF: todo colgado del ticket.
    const adjFicha = montarAdjuntos(m.el.querySelector('#idea-adjuntos'), 'contenido', id);

    m.el.querySelector('#form-nota').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await updateDoc(doc(db, 'contenido', id), {
          notas: arrayUnion({ texto: e.target.texto.value.trim(), fecha: new Date(), por: auth.currentUser.uid }),
          ...stamp(),
        });
        m.cerrar();
        detalleTicket(id);
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
    m.el.querySelector('[data-editar]').addEventListener('click', () => { m.cerrar(); formularioTicket(t); });
    m.el.querySelector('[data-descartar]').addEventListener('click', async () => {
      m.cerrar();
      try {
        await updateDoc(doc(db, 'contenido', id), {
          estado: 'descartada', estadoCambiadoEl: serverTimestamp(), ...stamp(),
        });
        toast('Idea descartada');
      } catch (err) { console.error(err); toast('No se pudo', true); }
    });
    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      m.cerrar();
      if (!(await confirmar(`Se borra el ticket "${t.titulo}" definitivamente.`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'contenido', id));
        toast('Borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  function dato(nombre, valor) {
    if (!valor) return '';
    return `<div><p class="dato__nombre">${esc(nombre)}</p><p class="dato__valor">${esc(valor)}</p></div>`;
  }

  // ============ ALTA / EDICIÓN ============
  function formularioTicket(ticket) {
    const esAlta = !ticket;
    const t = ticket || {};
    const m = modal(esAlta ? 'Nueva idea' : `Editar: ${t.titulo}`, `
      <form id="form-ticket">
        <label class="campo">
          <span class="campo__nombre mono">Título tentativo *</span>
          <input type="text" name="titulo" required placeholder="Cuánto sale una página web para una peluquería" value="${esc(t.titulo || '')}">
          <span class="modal__nota" id="tk-parecidos" hidden></span>
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Pregunta / búsqueda que responde</span>
          <input type="text" name="pregunta" placeholder="cuánto cuesta una página web para mi negocio" value="${esc(t.pregunta || '')}">
        </label>
        <div class="campos-2">
          <label class="campo">
            <span class="campo__nombre mono">Rubro</span>
            <select name="rubro">${selectHtml(RUBROS_CONTENIDO, t.rubro || 'general')}</select>
          </label>
          <label class="campo">
            <span class="campo__nombre mono">Redacta</span>
            <select name="encargado">${selectHtml(ENCARGADOS, t.encargado || 'claude')}</select>
          </label>
        </div>
        <label class="campo">
          <span class="campo__nombre mono">Fecha objetivo</span>
          <input type="date" name="fecha" value="${aInputFecha(t.fechaObjetivo)}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Brief (qué tiene que responder, estructura, datos)</span>
          <textarea name="brief" rows="4" placeholder="- A quién le habla&#10;- Qué se lleva el que lo lee&#10;- Secciones&#10;- CTA">${esc(t.brief || '')}</textarea>
        </label>
        <div id="ticket-adjuntos"></div>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton--lleno">${esAlta ? 'Crear ticket' : 'Guardar'}</button>
        </div>
      </form>`);

    const adj = montarAdjuntos(m.el.querySelector('#ticket-adjuntos'), 'contenido', esAlta ? null : t.id);

    // Anti-redundancia: avisa si ya hay un ticket que suena parecido.
    const inputTitulo = m.el.querySelector('[name=titulo]');
    const aviso = m.el.querySelector('#tk-parecidos');
    inputTitulo.addEventListener('input', () => {
      const q = normalizar(inputTitulo.value);
      if (q.length < 6) { aviso.hidden = true; return; }
      const palabras = q.split(/\s+/).filter((p) => p.length > 3);
      const parecidos = (cache.contenido || []).filter((x) => {
        if (x.id === t.id) return false;
        const nx = normalizar(x.titulo || '') + ' ' + normalizar(x.pregunta || '');
        const coincide = palabras.filter((p) => nx.includes(p)).length;
        return palabras.length && coincide >= Math.max(2, Math.ceil(palabras.length * 0.6));
      });
      if (parecidos.length) {
        aviso.textContent = `// Ojo: ya hay algo parecido — ${parecidos.map((p) => `"${p.titulo}" (${ESTADOS_CONTENIDO.find((e) => e.id === p.estado)?.nombre || p.estado})`).join(' · ')}`;
        aviso.hidden = false;
      } else {
        aviso.hidden = true;
      }
    });

    m.el.querySelector('#form-ticket').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const datos = {
        titulo: f.titulo.value.trim(),
        pregunta: f.pregunta.value.trim(),
        rubro: f.rubro.value,
        encargado: f.encargado.value,
        fechaObjetivo: fechaDeInput(f.fecha.value),
        brief: f.brief.value.trim(),
      };
      try {
        if (esAlta) {
          const ref = await addDoc(collection(db, 'contenido'), {
            ...datos,
            estado: 'idea',
            estadoCambiadoEl: serverTimestamp(),
            linkPublicado: '',
            notas: [],
            adjuntos: 0,
            ...stamp(true),
          });
          const n = await adj.guardarPendientes(ref.id);
          toast(n ? `Idea en el tablero con ${n} adjunto${n > 1 ? 's' : ''}` : 'Idea en el tablero');
        } else {
          await updateDoc(doc(db, 'contenido', t.id), { ...datos, ...stamp() });
          toast('Ticket actualizado');
        }
        adj.desconectar();
        m.cerrar();
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
  }

  pintar();
  return alCambiar((col) => { if (col === 'contenido') pintar(); });
}
