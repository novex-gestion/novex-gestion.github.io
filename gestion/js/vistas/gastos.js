// 05 · GASTOS — la plata que sale: puntuales + fijos recurrentes.
// Fijos generados con ID `${fijoId}_${YYYY-MM}` (regenerar no duplica).
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { SOCIOS, CATEGORIAS_GASTO, nombreCategoria, nombrePagador } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtUsd, fmtFechaCorta, aFecha, aInputFecha, fechaDeInput, periodoDe, nombrePeriodo, sumarMeses,
  modal, confirmar, toast, selectHtml,
} from '../ui.js';

function opcionesPagador() {
  return [
    ...Object.keys(SOCIOS).map((u) => ({ id: u, nombre: nombrePagador(u) })),
    { id: 'novex', nombre: 'Cuenta NOVEX' },
  ];
}

export function montarGastos(raiz) {
  let periodo = periodoDe();

  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Gas<em>tos</em></h1>
        <p class="vista__sub mono">La plata que sale</p>
      </div>
      <div style="display:flex; gap:8px">
        <button type="button" class="boton boton--chico" id="btn-fijos">Fijos</button>
        <button type="button" class="boton boton--lleno boton--chico" id="btn-nuevo-gasto">+ Gasto</button>
      </div>
    </div>
    <div class="kpis" id="gas-kpis"></div>
    <div class="periodo">
      <button type="button" id="gas-antes" aria-label="Mes anterior">‹</button>
      <span class="periodo__nombre" id="gas-nombre"></span>
      <button type="button" id="gas-despues" aria-label="Mes siguiente">›</button>
    </div>
    <div id="gas-generar"></div>
    <div class="filas" id="gas-lista" style="margin-top:14px"></div>`;

  raiz.querySelector('#btn-nuevo-gasto').addEventListener('click', () => formularioGasto(null, periodo));
  raiz.querySelector('#btn-fijos').addEventListener('click', gestionarFijos);
  raiz.querySelector('#gas-antes').addEventListener('click', () => { periodo = sumarMeses(periodo, -1); pintar(); });
  raiz.querySelector('#gas-despues').addEventListener('click', () => { periodo = sumarMeses(periodo, 1); pintar(); });

  function pintar() {
    const lista = raiz.querySelector('#gas-lista');
    if (!lista) return;

    const delMes = cache.gastos.filter((g) => g.periodo === periodo);
    const total = delMes.reduce((s, g) => s + (Number(g.montoUsd) || 0), 0);
    const porPagador = {};
    for (const g of delMes) {
      porPagador[g.pagadoPor] = (porPagador[g.pagadoPor] || 0) + (Number(g.montoUsd) || 0);
    }
    const socios = Object.keys(SOCIOS);
    raiz.querySelector('#gas-kpis').innerHTML = `
      <div class="kpi"><p class="kpi__nombre">Total ${esc(periodo)}</p><p class="kpi__valor rojo">${fmtUsd(total)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Puso ${esc(nombrePagador(socios[0]))}</p><p class="kpi__valor">${fmtUsd(porPagador[socios[0]] || 0)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Puso ${esc(nombrePagador(socios[1]))}</p><p class="kpi__valor">${fmtUsd(porPagador[socios[1]] || 0)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Cuenta NOVEX</p><p class="kpi__valor">${fmtUsd(porPagador.novex || 0)}</p></div>`;

    raiz.querySelector('#gas-nombre').textContent = nombrePeriodo(periodo).toUpperCase();

    // Fijos activos sin generar este período
    const fijosActivos = cache.gastos_fijos.filter((f) => f.activo !== false);
    const sinGenerar = fijosActivos.filter((f) => !cache.gastos.some((g) => g.id === `${f.id}_${periodo}`));
    const generar = raiz.querySelector('#gas-generar');
    if (cache.listo.gastos_fijos && sinGenerar.length) {
      generar.innerHTML = `<button type="button" class="boton" style="width:100%" id="btn-generar-fijos">
        Cargar ${sinGenerar.length === 1 ? 'el gasto fijo' : `los ${sinGenerar.length} gastos fijos`} de ${esc(nombrePeriodo(periodo))}</button>`;
      generar.querySelector('#btn-generar-fijos').addEventListener('click', () => generarFijos(sinGenerar));
    } else {
      generar.innerHTML = '';
    }

    const filas = delMes.slice().sort((a, b) =>
      (aFecha(b.fecha)?.getTime() || 0) - (aFecha(a.fecha)?.getTime() || 0));

    lista.innerHTML = filas.map((g) => `
      <article class="fila fila--link" data-id="${esc(g.id)}">
        <div class="fila__principal">
          <p class="fila__nombre">${esc(g.concepto)}</p>
          <p class="fila__detalle">${esc([
            fmtFechaCorta(g.fecha),
            nombreCategoria(g.categoria),
            g.clienteNegocio,
            nombrePagador(g.pagadoPor),
            g.fijoId ? 'fijo' : null,
          ].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="fila__lado">
          <span class="fila__monto">${fmtUsd(g.montoUsd)}</span>
          ${g.moneda === 'ARS' ? `<span class="sello sello--apagado">ARS ${Number(g.montoOriginal || 0).toLocaleString('es-AR')}</span>` : ''}
        </div>
      </article>`).join('') ||
      (cache.listo.gastos
        ? `<p class="vacio">// Sin gastos en ${esc(nombrePeriodo(periodo))}.<br>Cargalos con "+ Gasto" o definí los fijos mensuales.</p>`
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila--link').forEach((el) =>
      el.addEventListener('click', () => {
        const g = cache.gastos.find((x) => x.id === el.dataset.id);
        if (g) formularioGasto(g, periodo);
      })
    );
  }

  async function generarFijos(fijos) {
    try {
      const [a, m] = periodo.split('-').map(Number);
      const lote = writeBatch(db);
      for (const f of fijos) {
        lote.set(doc(db, 'gastos', `${f.id}_${periodo}`), {
          concepto: f.concepto,
          categoria: f.categoria || 'herramientas',
          fecha: new Date(a, m - 1, 1, 12),
          periodo,
          moneda: 'USD',
          montoOriginal: Number(f.montoUsd) || 0,
          tc: null,
          montoUsd: Number(f.montoUsd) || 0,
          clienteId: f.clienteId || null,
          clienteNegocio: f.clienteNegocio || null,
          pagadoPor: f.pagadoPor || 'novex',
          fijoId: f.id,
          ...stamp(true),
        });
      }
      await lote.commit();
      toast(`${fijos.length === 1 ? 'Gasto fijo cargado' : fijos.length + ' gastos fijos cargados'}`);
    } catch (err) { console.error(err); toast('No se pudieron cargar', true); }
  }

  pintar();
  return alCambiar((col) => {
    if (col === 'gastos' || col === 'gastos_fijos' || col === 'clientes') pintar();
  });
}

// ============ ALTA / EDICIÓN DE GASTO ============
function formularioGasto(gasto, periodoVisible) {
  const esAlta = !gasto;
  const g = gasto || {};
  const clientes = cache.clientes
    .slice()
    .sort((a, b) => (a.negocio || '').localeCompare(b.negocio || ''))
    .map((c) => ({ id: c.id, nombre: c.negocio }));

  const m = modal(esAlta ? 'Nuevo gasto' : `Editar: ${g.concepto}`, `
    <form id="form-gasto">
      <label class="campo">
        <span class="campo__nombre mono">Concepto *</span>
        <input type="text" name="concepto" required placeholder="Suscripción Higgsfield, sesión fotos…" value="${esc(g.concepto || '')}">
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Fecha *</span>
          <input type="date" name="fecha" required value="${aInputFecha(g.fecha || new Date())}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Categoría</span>
          <select name="categoria">${selectHtml(CATEGORIAS_GASTO, g.categoria || 'herramientas')}</select>
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Monto *</span>
          <input type="number" name="monto" min="0" step="0.01" required value="${g.montoOriginal ?? ''}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Moneda</span>
          <select name="moneda">${selectHtml(
            [{ id: 'USD', nombre: 'USD' }, { id: 'ARS', nombre: 'ARS' }], g.moneda || 'USD')}</select>
        </label>
      </div>
      <label class="campo" id="campo-tc" ${!g.moneda || g.moneda === 'USD' ? 'hidden' : ''}>
        <span class="campo__nombre mono">Tipo de cambio (ARS por USD) *</span>
        <input type="number" name="tc" min="1" step="0.01" value="${g.tc || ''}" placeholder="1500">
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Cliente (opcional)</span>
          <select name="cliente">${selectHtml(clientes, g.clienteId, '— gasto general —')}</select>
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Pagado por</span>
          <select name="pagador">${selectHtml(opcionesPagador(), g.pagadoPor || (auth.currentUser && auth.currentUser.uid))}</select>
        </label>
      </div>
      <div class="modal__acciones">
        ${esAlta
          ? '<button type="button" class="boton" data-cerrar>Cancelar</button>'
          : '<button type="button" class="boton boton--peligro" data-borrar>Borrar</button>'}
        <button type="submit" class="boton boton--lleno">${esAlta ? 'Cargar gasto' : 'Guardar'}</button>
      </div>
    </form>`);

  const form = m.el.querySelector('#form-gasto');
  form.moneda.addEventListener('change', () => {
    m.el.querySelector('#campo-tc').hidden = form.moneda.value === 'USD';
  });

  if (!esAlta) {
    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      m.cerrar();
      if (!(await confirmar(`Se borra el gasto "${g.concepto}" (${fmtUsd(g.montoUsd)}).`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'gastos', g.id));
        toast('Gasto borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const moneda = f.moneda.value;
    const montoOriginal = Number(f.monto.value) || 0;
    const tc = moneda === 'ARS' ? Number(f.tc.value) || 0 : null;
    if (moneda === 'ARS' && !tc) {
      toast('Falta el tipo de cambio', true);
      return;
    }
    const fecha = fechaDeInput(f.fecha.value);
    const cliente = cache.clientes.find((c) => c.id === f.cliente.value);
    const datos = {
      concepto: f.concepto.value.trim(),
      categoria: f.categoria.value,
      fecha,
      periodo: periodoDe(fecha),
      moneda,
      montoOriginal,
      tc,
      montoUsd: moneda === 'ARS' ? Math.round((montoOriginal / tc) * 100) / 100 : montoOriginal,
      clienteId: cliente ? cliente.id : null,
      clienteNegocio: cliente ? cliente.negocio : null,
      pagadoPor: f.pagador.value,
    };
    try {
      if (esAlta) {
        await addDoc(collection(db, 'gastos'), { ...datos, fijoId: null, ...stamp(true) });
        toast('Gasto cargado');
      } else {
        await updateDoc(doc(db, 'gastos', g.id), { ...datos, ...stamp() });
        toast('Gasto actualizado');
      }
      m.cerrar();
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}

// ============ GASTOS FIJOS (plantillas mensuales) ============
function gestionarFijos() {
  const fijos = cache.gastos_fijos.slice().sort((a, b) => (a.concepto || '').localeCompare(b.concepto || ''));
  const m = modal('Gastos fijos mensuales', `
    <div class="modal__cuerpo">
      <p class="modal__nota">// Se cargan una vez y cada mes aparece el botón para sumarlos al período. En USD (suscripciones).</p>
      <div class="filas" id="lista-fijos">
        ${fijos.map((f) => `
          <div class="fila ${f.activo === false ? 'fila--apagada' : ''}">
            <div class="fila__principal">
              <p class="fila__nombre" style="font-size:14px">${esc(f.concepto)}</p>
              <p class="fila__detalle">${esc(nombreCategoria(f.categoria))} · ${esc(nombrePagador(f.pagadoPor))}</p>
            </div>
            <div class="fila__lado" style="flex-direction:row; align-items:center; gap:8px">
              <span class="fila__monto">${fmtUsd(f.montoUsd)}</span>
              <button type="button" class="boton boton--chico" data-alternar="${esc(f.id)}">${f.activo === false ? 'Activar' : 'Pausar'}</button>
              <button type="button" class="boton boton--chico boton--peligro" data-quitar="${esc(f.id)}">×</button>
            </div>
          </div>`).join('') || '<p class="modal__nota">// Sin fijos definidos todavía.</p>'}
      </div>
      <form id="form-fijo">
        <p class="campo__nombre mono">Nuevo fijo</p>
        <div class="campos-2">
          <label class="campo"><span class="campo__nombre mono">Concepto *</span>
            <input type="text" name="concepto" required placeholder="Suscripción Claude"></label>
          <label class="campo"><span class="campo__nombre mono">USD/mes *</span>
            <input type="number" name="monto" min="0" step="0.01" required></label>
        </div>
        <div class="campos-2">
          <label class="campo"><span class="campo__nombre mono">Categoría</span>
            <select name="categoria">${selectHtml(CATEGORIAS_GASTO, 'herramientas')}</select></label>
          <label class="campo"><span class="campo__nombre mono">Pagado por</span>
            <select name="pagador">${selectHtml(opcionesPagador(), 'novex')}</select></label>
        </div>
        <button type="submit" class="boton">Agregar fijo</button>
      </form>
    </div>`);

  m.el.querySelectorAll('[data-alternar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const f = cache.gastos_fijos.find((x) => x.id === b.dataset.alternar);
      try {
        await updateDoc(doc(db, 'gastos_fijos', f.id), { activo: f.activo === false, ...stamp() });
        m.cerrar(); gestionarFijos();
      } catch (err) { console.error(err); toast('No se pudo', true); }
    })
  );
  m.el.querySelectorAll('[data-quitar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const f = cache.gastos_fijos.find((x) => x.id === b.dataset.quitar);
      m.cerrar();
      if (!(await confirmar(`Se quita el fijo "${f.concepto}" (los meses ya cargados quedan).`, 'Quitar'))) return;
      try {
        await deleteDoc(doc(db, 'gastos_fijos', f.id));
        toast('Fijo quitado');
      } catch (err) { console.error(err); toast('No se pudo quitar', true); }
    })
  );

  m.el.querySelector('#form-fijo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await addDoc(collection(db, 'gastos_fijos'), {
        concepto: f.concepto.value.trim(),
        montoUsd: Number(f.monto.value) || 0,
        categoria: f.categoria.value,
        pagadoPor: f.pagador.value,
        clienteId: null,
        clienteNegocio: null,
        activo: true,
        ...stamp(true),
      });
      toast('Fijo agregado');
      m.cerrar(); gestionarFijos();
    } catch (err) { console.error(err); toast('No se pudo agregar', true); }
  });
}
