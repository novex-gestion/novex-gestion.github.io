// 02 · CLIENTES — padrón con alta manual; la ficha vive en cliente-detalle.js.
import {
  collection, addDoc, updateDoc, doc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from '../firebase.js';
import { PAQUETES, nombrePaquete } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { esc, fmtUsd, modal, toast, selectHtml, fechaDeInput, aInputFecha } from '../ui.js';

const SELLO_ESTADO = {
  activo: 'sello--verde',
  pausado: 'sello--naranja',
  baja: 'sello--apagado',
};

export function montarClientes(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Clien<em>tes</em></h1>
        <p class="vista__sub mono" id="cli-resumen"></p>
      </div>
      <button type="button" class="boton boton--lleno boton--chico" id="btn-nuevo-cliente">+ Cliente</button>
    </div>
    <div class="filtros" id="cli-filtros"></div>
    <div class="filas" id="cli-lista"></div>`;

  raiz.querySelector('#btn-nuevo-cliente').addEventListener('click', () => formularioCliente());

  let filtro = 'activo';

  function pintar() {
    const lista = raiz.querySelector('#cli-lista');
    if (!lista) return;

    const activos = cache.clientes.filter((c) => c.estado === 'activo');
    const mrr = activos.reduce((s, c) => s + (Number(c.cuotaMensualUsd) || 0), 0);
    raiz.querySelector('#cli-resumen').textContent =
      `${activos.length} activos · ${fmtUsd(mrr)}/mes recurrente`;

    const FILTROS = [
      { id: 'activo', nombre: `Activos (${activos.length})` },
      { id: 'pausado', nombre: 'Pausados' },
      { id: 'baja', nombre: 'Bajas' },
      { id: 'todos', nombre: 'Todos' },
    ];
    raiz.querySelector('#cli-filtros').innerHTML = FILTROS.map((f) =>
      `<button type="button" class="filtro ${f.id === filtro ? 'activo' : ''}" data-f="${f.id}">${esc(f.nombre)}</button>`
    ).join('');
    raiz.querySelectorAll('#cli-filtros .filtro').forEach((b) =>
      b.addEventListener('click', () => { filtro = b.dataset.f; pintar(); })
    );

    const visibles = cache.clientes
      .filter((c) => filtro === 'todos' || c.estado === filtro)
      .sort((a, b) => (a.negocio || '').localeCompare(b.negocio || ''));

    lista.innerHTML = visibles.map((c) => `
      <article class="fila fila--link ${c.estado !== 'activo' ? 'fila--apagada' : ''}" data-id="${esc(c.id)}">
        <div class="fila__principal">
          <p class="fila__nombre">${esc(c.negocio)}</p>
          <p class="fila__detalle">${esc([c.contacto, c.rubro, c.zona].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="fila__lado">
          <span class="sello ${SELLO_ESTADO[c.estado] || ''}">${esc(nombrePaquete(c.paquete))}</span>
          <span class="fila__monto">${fmtUsd(c.cuotaMensualUsd)}<span style="color:var(--minimo)">/mes</span></span>
        </div>
      </article>`).join('') ||
      (cache.listo.clientes
        ? '<p class="vacio">// Sin clientes acá todavía.<br>Se crean desde un lead ganado o con "+ Cliente".</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila--link').forEach((el) =>
      el.addEventListener('click', () => { location.hash = '#/clientes/' + el.dataset.id; })
    );
  }

  pintar();
  return alCambiar((col) => { if (col === 'clientes') pintar(); });
}

// Alta manual (sin pasar por el pipeline). Exportado para reuso.
export function formularioCliente(cliente = null, alGuardar = null) {
  const esAlta = !cliente;
  const c = cliente || {};
  const m = modal(esAlta ? 'Nuevo cliente' : `Editar: ${c.negocio}`, `
    <form id="form-cliente">
      <label class="campo">
        <span class="campo__nombre mono">Negocio *</span>
        <input type="text" name="negocio" required value="${esc(c.negocio || '')}">
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Contacto</span>
          <input type="text" name="contacto" value="${esc(c.contacto || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Teléfono</span>
          <input type="tel" name="telefono" inputmode="tel" value="${esc(c.telefono || '')}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Email</span>
          <input type="email" name="email" value="${esc(c.email || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Instagram</span>
          <input type="text" name="instagram" placeholder="@..." value="${esc(c.instagram || '')}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Rubro</span>
          <input type="text" name="rubro" value="${esc(c.rubro || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Zona</span>
          <input type="text" name="zona" value="${esc(c.zona || '')}">
        </label>
      </div>
      <label class="campo">
        <span class="campo__nombre mono">Dirección</span>
        <input type="text" name="direccion" value="${esc(c.direccion || '')}">
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Paquete *</span>
          <select name="paquete" required>${selectHtml(PAQUETES, c.paquete)}</select>
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Estado</span>
          <select name="estado">${selectHtml(
            [{ id: 'activo', nombre: 'Activo' }, { id: 'pausado', nombre: 'Pausado' }, { id: 'baja', nombre: 'Baja' }],
            c.estado || 'activo'
          )}</select>
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Cuota mensual (USD) *</span>
          <input type="number" name="cuota" min="0" step="10" required value="${c.cuotaMensualUsd ?? ''}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Día de vencimiento *</span>
          <input type="number" name="vencimiento" min="1" max="28" required value="${c.diaVencimiento || 10}">
        </label>
      </div>
      <label class="campo">
        <span class="campo__nombre mono">Fecha de inicio</span>
        <input type="date" name="inicio" value="${aInputFecha(c.fechaInicio || new Date())}">
      </label>
      <label class="campo">
        <span class="campo__nombre mono">Notas generales</span>
        <textarea name="notas">${esc(c.notasGenerales || '')}</textarea>
      </label>
      <div class="modal__acciones">
        <button type="button" class="boton" data-cerrar>Cancelar</button>
        <button type="submit" class="boton boton--lleno">${esAlta ? 'Crear cliente' : 'Guardar'}</button>
      </div>
    </form>`);

  m.el.querySelector('#form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const datos = {
      negocio: f.negocio.value.trim(),
      contacto: f.contacto.value.trim(),
      telefono: f.telefono.value.trim(),
      email: f.email.value.trim(),
      instagram: f.instagram.value.trim(),
      rubro: f.rubro.value.trim(),
      zona: f.zona.value.trim(),
      direccion: f.direccion.value.trim(),
      paquete: f.paquete.value,
      estado: f.estado.value,
      cuotaMensualUsd: Number(f.cuota.value) || 0,
      diaVencimiento: Number(f.vencimiento.value) || 10,
      fechaInicio: fechaDeInput(f.inicio.value),
      notasGenerales: f.notas.value.trim(),
    };
    try {
      if (esAlta) {
        const ref = await addDoc(collection(db, 'clientes'), { ...datos, leadId: null, ...stamp(true) });
        toast('Cliente creado');
        m.cerrar();
        location.hash = '#/clientes/' + ref.id;
      } else {
        await updateDoc(doc(db, 'clientes', c.id), { ...datos, ...stamp() });
        toast('Cliente actualizado');
        m.cerrar();
      }
      if (alGuardar) alGuardar();
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}
