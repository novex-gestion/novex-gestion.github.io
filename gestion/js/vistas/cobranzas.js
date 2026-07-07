// 03 · COBROS — cuotas mensuales por cliente + tablero de recurrentes.
// ID determinístico `${clienteId}_${YYYY-MM}`: regenerar nunca duplica.
import {
  doc, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from '../firebase.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtUsd, fmtFecha, aFecha, aInputFecha, fechaDeInput, periodoDe, nombrePeriodo, sumarMeses,
  modal, confirmar, toast,
} from '../ui.js';

export function montarCobranzas(raiz) {
  let periodo = periodoDe();

  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Cob<em>ros</em></h1>
        <p class="vista__sub mono">Retainers y cobranzas</p>
      </div>
    </div>
    <div class="kpis" id="cob-kpis"></div>
    <div class="periodo">
      <button type="button" id="per-antes" aria-label="Mes anterior">‹</button>
      <span class="periodo__nombre" id="per-nombre"></span>
      <button type="button" id="per-despues" aria-label="Mes siguiente">›</button>
    </div>
    <div id="cob-generar"></div>
    <div class="filas" id="cob-lista" style="margin-top:14px"></div>`;

  raiz.querySelector('#per-antes').addEventListener('click', () => { periodo = sumarMeses(periodo, -1); pintar(); });
  raiz.querySelector('#per-despues').addEventListener('click', () => { periodo = sumarMeses(periodo, 1); pintar(); });

  function pintar() {
    const lista = raiz.querySelector('#cob-lista');
    if (!lista) return;

    const activos = cache.clientes.filter((c) => c.estado === 'activo');
    const mrr = activos.reduce((s, c) => s + (Number(c.cuotaMensualUsd) || 0), 0);
    const delPeriodo = cache.pagos.filter((p) => p.periodo === periodo);
    const ahora = new Date();
    const cobrado = delPeriodo.filter((p) => p.estado === 'cobrado').reduce((s, p) => s + (Number(p.montoUsd) || 0), 0);
    const pendientes = delPeriodo.filter((p) => p.estado === 'pendiente');
    const pendiente = pendientes.reduce((s, p) => s + (Number(p.montoUsd) || 0), 0);
    const vencido = pendientes.filter((p) => aFecha(p.vence) && aFecha(p.vence) < ahora)
      .reduce((s, p) => s + (Number(p.montoUsd) || 0), 0);

    raiz.querySelector('#cob-kpis').innerHTML = `
      <div class="kpi"><p class="kpi__nombre">Recurrente (activos)</p><p class="kpi__valor naranja">${fmtUsd(mrr)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Cobrado ${esc(periodo)}</p><p class="kpi__valor verde">${fmtUsd(cobrado)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Pendiente</p><p class="kpi__valor">${fmtUsd(pendiente)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Vencido</p><p class="kpi__valor ${vencido ? 'rojo' : ''}">${fmtUsd(vencido)}</p></div>`;

    raiz.querySelector('#per-nombre').textContent = nombrePeriodo(periodo).toUpperCase();

    // Clientes activos sin cuota generada este período
    const sinCuota = activos.filter((c) => !cache.pagos.some((p) => p.id === `${c.id}_${periodo}`));
    const generar = raiz.querySelector('#cob-generar');
    if (cache.listo.clientes && sinCuota.length) {
      generar.innerHTML = `<button type="button" class="boton" style="width:100%" id="btn-generar">
        Generar ${sinCuota.length === 1 ? 'la cuota que falta' : `las ${sinCuota.length} cuotas que faltan`} de ${esc(nombrePeriodo(periodo))}</button>`;
      generar.querySelector('#btn-generar').addEventListener('click', () => generarCuotas(sinCuota));
    } else {
      generar.innerHTML = '';
    }

    const filas = delPeriodo
      .slice()
      .sort((a, b) => (a.estado > b.estado ? 1 : a.estado < b.estado ? -1 : (a.clienteNegocio || '').localeCompare(b.clienteNegocio || '')));

    lista.innerHTML = filas.map((p) => {
      const estaVencida = p.estado === 'pendiente' && aFecha(p.vence) && aFecha(p.vence) < ahora;
      return `
        <article class="fila fila--link" data-id="${esc(p.id)}">
          <div class="fila__principal">
            <p class="fila__nombre">${esc(p.clienteNegocio)}</p>
            <p class="fila__detalle">${p.estado === 'cobrado'
              ? `cobrado ${esc(fmtFecha(p.fechaCobro))}${p.medioPago ? ' · ' + esc(p.medioPago) : ''}`
              : `vence ${esc(fmtFecha(p.vence))}`}</p>
          </div>
          <div class="fila__lado">
            <span class="sello ${p.estado === 'cobrado' ? 'sello--verde' : estaVencida ? 'sello--rojo' : 'sello--naranja'}">
              ${p.estado === 'cobrado' ? 'Cobrado' : estaVencida ? 'Vencido' : 'Pendiente'}</span>
            <span class="fila__monto">${fmtUsd(p.montoUsd)}</span>
          </div>
        </article>`;
    }).join('') ||
      (cache.listo.pagos
        ? `<p class="vacio">// Sin cuotas en ${esc(nombrePeriodo(periodo))}.${sinCuota.length ? '<br>Generalas con el botón de arriba.' : ''}</p>`
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila--link').forEach((el) =>
      el.addEventListener('click', () => detalleCuota(el.dataset.id))
    );
  }

  async function generarCuotas(clientes) {
    try {
      const [a, m] = periodo.split('-').map(Number);
      const lote = writeBatch(db);
      for (const c of clientes) {
        lote.set(doc(db, 'pagos', `${c.id}_${periodo}`), {
          clienteId: c.id,
          clienteNegocio: c.negocio || '',
          periodo,
          montoUsd: Number(c.cuotaMensualUsd) || 0,
          vence: new Date(a, m - 1, Math.min(Number(c.diaVencimiento) || 10, 28), 12),
          estado: 'pendiente',
          fechaCobro: null,
          medioPago: '',
          notas: '',
          ...stamp(true),
        });
      }
      await lote.commit();
      toast(`${clientes.length === 1 ? 'Cuota generada' : clientes.length + ' cuotas generadas'}`);
    } catch (err) { console.error(err); toast('No se pudieron generar', true); }
  }

  function detalleCuota(id) {
    const p = cache.pagos.find((x) => x.id === id);
    if (!p) return;

    if (p.estado === 'pendiente') {
      const m = modal(`Cobrar: ${p.clienteNegocio}`, `
        <form id="form-cobrar">
          <p class="modal__nota">// Cuota de ${esc(nombrePeriodo(p.periodo))} · vence ${esc(fmtFecha(p.vence))}</p>
          <div class="campos-2">
            <label class="campo">
              <span class="campo__nombre mono">Monto (USD)</span>
              <input type="number" name="monto" min="0" step="10" required value="${p.montoUsd ?? 0}">
            </label>
            <label class="campo">
              <span class="campo__nombre mono">Fecha de cobro</span>
              <input type="date" name="fecha" required value="${aInputFecha(new Date())}">
            </label>
          </div>
          <label class="campo">
            <span class="campo__nombre mono">Medio</span>
            <input type="text" name="medio" placeholder="Transferencia, efectivo, cripto…">
          </label>
          <div class="modal__acciones">
            <button type="button" class="boton boton--peligro" data-quitar>Quitar cuota</button>
            <button type="submit" class="boton boton--lleno">Marcar cobrada</button>
          </div>
        </form>`);

      m.el.querySelector('#form-cobrar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          await updateDoc(doc(db, 'pagos', id), {
            estado: 'cobrado',
            montoUsd: Number(f.monto.value) || 0,
            fechaCobro: fechaDeInput(f.fecha.value),
            medioPago: f.medio.value.trim(),
            ...stamp(),
          });
          m.cerrar();
          toast('Cuota cobrada 💵');
        } catch (err) { console.error(err); toast('No se pudo guardar', true); }
      });

      m.el.querySelector('[data-quitar]').addEventListener('click', async () => {
        m.cerrar();
        if (!(await confirmar(`Se quita la cuota de ${p.clienteNegocio} de ${nombrePeriodo(p.periodo)} (ej.: mes bonificado).`, 'Quitar'))) return;
        try {
          await deleteDoc(doc(db, 'pagos', id));
          toast('Cuota quitada');
        } catch (err) { console.error(err); toast('No se pudo quitar', true); }
      });
    } else {
      const m = modal(`${p.clienteNegocio}`, `
        <div class="modal__cuerpo">
          <p class="modal__nota">// ${esc(nombrePeriodo(p.periodo))} · ${fmtUsd(p.montoUsd)} cobrado el ${esc(fmtFecha(p.fechaCobro))}${p.medioPago ? ' por ' + esc(p.medioPago) : ''}.</p>
          <div class="modal__acciones">
            <button type="button" class="boton" data-cerrar>Cerrar</button>
            <button type="button" class="boton boton--peligro" data-revertir>Volver a pendiente</button>
          </div>
        </div>`);
      m.el.querySelector('[data-revertir]').addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'pagos', id), {
            estado: 'pendiente', fechaCobro: null, medioPago: '', ...stamp(),
          });
          m.cerrar();
          toast('Cuota vuelta a pendiente');
        } catch (err) { console.error(err); toast('No se pudo revertir', true); }
      });
    }
  }

  pintar();
  return alCambiar((col) => { if (col === 'pagos' || col === 'clientes') pintar(); });
}
