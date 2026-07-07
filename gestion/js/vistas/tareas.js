// 04 · TAREAS — pendientes por cliente y por socio.
import {
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { SOCIOS, nombreSocio } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtFechaCorta, aFecha, aInputFecha, fechaDeInput, modal, confirmar, toast, selectHtml,
} from '../ui.js';

export function montarTareas(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Ta<em>reas</em></h1>
        <p class="vista__sub mono" id="tar-resumen"></p>
      </div>
      <button type="button" class="boton boton--lleno boton--chico" id="btn-nueva-tarea">+ Tarea</button>
    </div>
    <div class="filtros" id="tar-filtros"></div>
    <div class="filas" id="tar-lista"></div>`;

  raiz.querySelector('#btn-nueva-tarea').addEventListener('click', () => formularioTarea());

  let filtroSocio = 'todas';
  let verHechas = false;

  function pintar() {
    const lista = raiz.querySelector('#tar-lista');
    if (!lista) return;

    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const pendientes = cache.tareas.filter((t) => t.estado === 'pendiente');
    const ahora = new Date();
    const vencidas = pendientes.filter((t) => aFecha(t.fechaLimite) && aFecha(t.fechaLimite) < ahora).length;
    raiz.querySelector('#tar-resumen').textContent =
      `${pendientes.length} pendientes${vencidas ? ` · ${vencidas} vencidas` : ''}`;

    const filtros = [
      { id: 'todas', nombre: 'Todas' },
      { id: 'mias', nombre: 'Mías' },
      ...Object.keys(SOCIOS).filter((u) => u !== uid).map((u) => ({ id: u, nombre: `De ${nombreSocio(u)}` })),
      { id: '_hechas', nombre: verHechas ? '✓ Con hechas' : 'Ver hechas' },
    ];
    raiz.querySelector('#tar-filtros').innerHTML = filtros.map((f) =>
      `<button type="button" class="filtro ${f.id === filtroSocio || (f.id === '_hechas' && verHechas) ? 'activo' : ''}" data-f="${esc(f.id)}">${esc(f.nombre)}</button>`
    ).join('');
    raiz.querySelectorAll('#tar-filtros .filtro').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.f === '_hechas') verHechas = !verHechas;
        else filtroSocio = b.dataset.f;
        pintar();
      })
    );

    const visibles = cache.tareas
      .filter((t) => (verHechas ? true : t.estado === 'pendiente'))
      .filter((t) => {
        if (filtroSocio === 'todas') return true;
        const objetivo = filtroSocio === 'mias' ? uid : filtroSocio;
        return t.asignadoA === objetivo || t.asignadoA === 'ambos';
      })
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === 'pendiente' ? -1 : 1;
        const fa = aFecha(a.fechaLimite), fb = aFecha(b.fechaLimite);
        if (fa && fb) return fa - fb;
        if (fa) return -1;
        if (fb) return 1;
        return (aFecha(b.creadoEl)?.getTime() || 0) - (aFecha(a.creadoEl)?.getTime() || 0);
      });

    lista.innerHTML = visibles.map((t) => {
      const limite = aFecha(t.fechaLimite);
      const vencida = t.estado === 'pendiente' && limite && limite < ahora;
      const detalle = [
        t.clienteNegocio,
        nombreSocio(t.asignadoA),
        limite ? fmtFechaCorta(t.fechaLimite) : null,
      ].filter(Boolean).join(' · ');
      return `
        <article class="fila tarea ${t.estado === 'hecha' ? 'tarea--hecha' : ''}" data-id="${esc(t.id)}">
          <button type="button" class="tarea__tilde" aria-label="${t.estado === 'hecha' ? 'Volver a pendiente' : 'Marcar hecha'}">✓</button>
          <div class="tarea__cuerpo">
            <p class="fila__nombre">${esc(t.titulo)}</p>
            <p class="fila__detalle">${esc(detalle)}</p>
          </div>
          <div class="fila__lado">
            ${t.prioridad === 'alta' && t.estado === 'pendiente' ? '<span class="sello sello--naranja">Alta</span>' : ''}
            ${vencida ? '<span class="sello sello--rojo">Vencida</span>' : ''}
          </div>
        </article>`;
    }).join('') ||
      (cache.listo.tareas
        ? '<p class="vacio">// Nada pendiente por acá. 🧉</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.tarea').forEach((el) => {
      const t = cache.tareas.find((x) => x.id === el.dataset.id);
      if (!t) return;
      el.querySelector('.tarea__tilde').addEventListener('click', () => alternarTarea(t));
      el.querySelector('.tarea__cuerpo').addEventListener('click', () => detalleTarea(t));
    });
  }

  async function alternarTarea(t) {
    try {
      if (t.estado === 'pendiente') {
        await updateDoc(doc(db, 'tareas', t.id), {
          estado: 'hecha',
          completadaEl: serverTimestamp(),
          completadaPor: auth.currentUser.uid,
          ...stamp(),
        });
      } else {
        await updateDoc(doc(db, 'tareas', t.id), {
          estado: 'pendiente', completadaEl: null, completadaPor: null, ...stamp(),
        });
      }
    } catch (err) { console.error(err); toast('No se pudo actualizar', true); }
  }

  function detalleTarea(t) {
    const m = modal(t.titulo, `
      <div class="modal__cuerpo">
        ${t.descripcion ? `<p style="white-space:pre-wrap">${esc(t.descripcion)}</p>` : ''}
        <p class="modal__nota">// ${esc(nombreSocio(t.asignadoA))}${t.clienteNegocio ? ' · ' + esc(t.clienteNegocio) : ''}${aFecha(t.fechaLimite) ? ' · límite ' + esc(fmtFechaCorta(t.fechaLimite)) : ''}
        ${t.estado === 'hecha' ? `<br>// Completada por ${esc(nombreSocio(t.completadaPor))}` : ''}</p>
        ${t.clienteId ? `<a class="boton boton--chico" href="#/clientes/${esc(t.clienteId)}" data-cerrar style="text-decoration:none; align-self:flex-start">Ver cliente →</a>` : ''}
        <div class="modal__acciones">
          <button type="button" class="boton boton--peligro" data-borrar>Borrar</button>
          <button type="button" class="boton" data-editar>Editar</button>
        </div>
      </div>`);

    m.el.querySelector('[data-editar]').addEventListener('click', () => { m.cerrar(); formularioTarea(t); });
    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      m.cerrar();
      if (!(await confirmar(`Se borra la tarea "${t.titulo}".`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'tareas', t.id));
        toast('Tarea borrada');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  function formularioTarea(t = null) {
    const esAlta = !t;
    const x = t || {};
    const uid = auth.currentUser ? auth.currentUser.uid : null;
    const socios = [
      ...Object.keys(SOCIOS).map((u) => ({ id: u, nombre: nombreSocio(u) })),
      { id: 'ambos', nombre: 'Ambos' },
    ];
    const clientes = cache.clientes
      .slice()
      .sort((a, b) => (a.negocio || '').localeCompare(b.negocio || ''))
      .map((c) => ({ id: c.id, nombre: c.negocio }));

    const m = modal(esAlta ? 'Nueva tarea' : 'Editar tarea', `
      <form id="form-tarea">
        <label class="campo">
          <span class="campo__nombre mono">Tarea *</span>
          <input type="text" name="titulo" required value="${esc(x.titulo || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Detalle</span>
          <textarea name="descripcion">${esc(x.descripcion || '')}</textarea>
        </label>
        <div class="campos-2">
          <label class="campo">
            <span class="campo__nombre mono">Asignada a</span>
            <select name="asignado">${selectHtml(socios, x.asignadoA || uid)}</select>
          </label>
          <label class="campo">
            <span class="campo__nombre mono">Cliente</span>
            <select name="cliente">${selectHtml(clientes, x.clienteId, '— general —')}</select>
          </label>
        </div>
        <div class="campos-2">
          <label class="campo">
            <span class="campo__nombre mono">Fecha límite</span>
            <input type="date" name="limite" value="${aInputFecha(x.fechaLimite)}">
          </label>
          <label class="campo">
            <span class="campo__nombre mono">Prioridad</span>
            <select name="prioridad">${selectHtml(
              [{ id: 'normal', nombre: 'Normal' }, { id: 'alta', nombre: 'Alta' }],
              x.prioridad || 'normal'
            )}</select>
          </label>
        </div>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="submit" class="boton boton--lleno">${esAlta ? 'Crear tarea' : 'Guardar'}</button>
        </div>
      </form>`);

    m.el.querySelector('#form-tarea').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const cliente = cache.clientes.find((c) => c.id === f.cliente.value);
      const datos = {
        titulo: f.titulo.value.trim(),
        descripcion: f.descripcion.value.trim(),
        asignadoA: f.asignado.value,
        clienteId: cliente ? cliente.id : null,
        clienteNegocio: cliente ? cliente.negocio : null,
        fechaLimite: fechaDeInput(f.limite.value),
        prioridad: f.prioridad.value,
      };
      try {
        if (esAlta) {
          await addDoc(collection(db, 'tareas'), {
            ...datos, estado: 'pendiente', completadaEl: null, completadaPor: null, ...stamp(true),
          });
          toast('Tarea creada');
        } else {
          await updateDoc(doc(db, 'tareas', t.id), { ...datos, ...stamp() });
          toast('Tarea actualizada');
        }
        m.cerrar();
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
  }

  pintar();
  return alCambiar((col) => { if (col === 'tareas' || col === 'clientes') pintar(); });
}
