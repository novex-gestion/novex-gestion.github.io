// Búsqueda global (Ctrl+K o la lupa del tope): leads, clientes, tareas y gastos.
import { cache } from './datos.js';
import { esc, fmtUsd, modal, normalizar } from './ui.js';
import { detalleLead } from './vistas/pipeline.js';

export function iniciarBusqueda() {
  const boton = document.getElementById('btn-buscar');
  if (boton) boton.addEventListener('click', abrirBusqueda);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!document.getElementById('pantalla-app').hidden) abrirBusqueda();
    }
  });
}

function abrirBusqueda() {
  const m = modal('Buscar', `
    <div class="modal__cuerpo">
      <label class="campo">
        <input type="search" id="buscar-texto" placeholder="Negocio, contacto, tarea, gasto…" autocomplete="off">
      </label>
      <div id="buscar-resultados" class="filas"></div>
    </div>`);

  const entrada = m.el.querySelector('#buscar-texto');
  const caja = m.el.querySelector('#buscar-resultados');

  function buscar() {
    const q = normalizar(entrada.value.trim());
    if (q.length < 2) {
      caja.innerHTML = '<p class="modal__nota">// Escribí al menos 2 letras.</p>';
      return;
    }
    const pega = (...campos) => campos.some((c) => normalizar(c).includes(q));

    const resultados = [
      ...cache.clientes.filter((c) => pega(c.negocio, c.contacto, c.rubro))
        .map((c) => ({ tipo: 'Cliente', nombre: c.negocio, detalle: c.contacto, accion: () => { location.hash = '#/clientes/' + c.id; } })),
      ...cache.leads.filter((l) => pega(l.negocio, l.contacto, l.rubro))
        .map((l) => ({ tipo: 'Lead', nombre: l.negocio, detalle: l.etapa, accion: () => detalleLead(l.id) })),
      ...cache.tareas.filter((t) => pega(t.titulo, t.descripcion, t.clienteNegocio))
        .map((t) => ({ tipo: 'Tarea', nombre: t.titulo, detalle: t.estado, accion: () => { location.hash = '#/tareas'; } })),
      ...cache.gastos.filter((g) => pega(g.concepto, g.clienteNegocio))
        .map((g) => ({ tipo: 'Gasto', nombre: g.concepto, detalle: `${g.periodo} · ${fmtUsd(g.montoUsd)}`, accion: () => { location.hash = '#/gastos'; } })),
    ].slice(0, 12);

    caja.innerHTML = resultados.map((r, i) => `
      <button type="button" class="fila fila--link" data-i="${i}" style="text-align:left; width:100%">
        <div class="fila__principal">
          <p class="fila__nombre" style="font-size:14px">${esc(r.nombre)}</p>
          <p class="fila__detalle">${esc(r.detalle || '')}</p>
        </div>
        <span class="sello">${esc(r.tipo)}</span>
      </button>`).join('') || '<p class="modal__nota">// Sin resultados.</p>';

    caja.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => { m.cerrar(); resultados[Number(b.dataset.i)].accion(); })
    );
  }

  entrada.addEventListener('input', buscar);
  buscar();
}
