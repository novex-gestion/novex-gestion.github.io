// 04 · COBROS — cuotas mensuales por cliente + cuenta corriente.
// ID determinístico `${clienteId}_${YYYY-MM}`: regenerar nunca duplica.
//
// Dos modos:
//   MES  → las cuotas del período, para saber qué falta cobrar este mes.
//   CTA  → la cuenta corriente acumulada de cada cliente (cuotas + cargos
//          extra − lo cobrado), para saber cuánto debe en total.
import {
  collection, doc, addDoc, updateDoc, deleteDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from '../firebase.js';
import { PLANTILLAS_WA, MEDIOS_PAGO, CONCEPTOS_CARGO, opcionesCuenta, nombrePagador } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { ccTodos, ccCliente, cobradoDe, recibidoPor } from '../finanzas.js';
import {
  esc, fmtUsd, fmtFecha, fmtFechaCorta, aFecha, aInputFecha, fechaDeInput,
  periodoDe, nombrePeriodo, sumarMeses, modal, confirmar, toast, linkWa, selectHtml,
} from '../ui.js';

export function montarCobranzas(raiz) {
  let periodo = periodoDe();
  let modo = 'mes';

  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Cob<em>ros</em></h1>
        <p class="vista__sub mono">Retainers, cobranzas y cuenta corriente</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button type="button" class="boton boton--chico" id="btn-cargo">+ Cargo</button>
        <div class="conmuta" id="cob-modo">
          <button type="button" data-modo="mes" class="activo">Mes</button>
          <button type="button" data-modo="cta">Cuenta corriente</button>
        </div>
      </div>
    </div>
    <div class="kpis" id="cob-kpis"></div>
    <div id="cob-periodo" class="periodo">
      <button type="button" id="per-antes" aria-label="Mes anterior">‹</button>
      <span class="periodo__nombre" id="per-nombre"></span>
      <button type="button" id="per-despues" aria-label="Mes siguiente">›</button>
    </div>
    <div id="cob-generar"></div>
    <div class="filas" id="cob-lista" style="margin-top:14px"></div>`;

  raiz.querySelector('#per-antes').addEventListener('click', () => { periodo = sumarMeses(periodo, -1); pintar(); });
  raiz.querySelector('#per-despues').addEventListener('click', () => { periodo = sumarMeses(periodo, 1); pintar(); });
  raiz.querySelector('#btn-cargo').addEventListener('click', () => formularioCargo(null));
  raiz.querySelectorAll('#cob-modo button').forEach((b) =>
    b.addEventListener('click', () => {
      modo = b.dataset.modo;
      raiz.querySelectorAll('#cob-modo button').forEach((x) => x.classList.toggle('activo', x === b));
      pintar();
    })
  );

  function pintar() {
    const lista = raiz.querySelector('#cob-lista');
    if (!lista) return;
    raiz.querySelector('#cob-periodo').hidden = modo !== 'mes';
    raiz.querySelector('#cob-generar').hidden = modo !== 'mes';
    if (modo === 'cta') return pintarCuentaCorriente(lista);

    const activos = cache.clientes.filter((c) => c.estado === 'activo');
    const mrr = activos.reduce((s, c) => s + (Number(c.cuotaMensualUsd) || 0), 0);
    const delPeriodo = cache.pagos.filter((p) => p.periodo === periodo);
    const ahora = new Date();
    const cobrado = delPeriodo.reduce((s, p) => s + cobradoDe(p), 0);
    const pendiente = delPeriodo.reduce((s, p) => s + Math.max(0, (Number(p.montoUsd) || 0) - cobradoDe(p)), 0);
    const vencido = delPeriodo
      .filter((p) => aFecha(p.vence) && aFecha(p.vence) < ahora)
      .reduce((s, p) => s + Math.max(0, (Number(p.montoUsd) || 0) - cobradoDe(p)), 0);

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
      const total = Number(p.montoUsd) || 0;
      const cob = cobradoDe(p);
      const saldo = Math.max(0, total - cob);
      const parcial = cob > 0 && saldo > 0.004;
      const estaVencida = saldo > 0.004 && aFecha(p.vence) && aFecha(p.vence) < ahora;
      const sello = saldo <= 0.004
        ? '<span class="sello sello--verde">Cobrado</span>'
        : parcial
          ? `<span class="sello sello--naranja">Parcial · falta ${fmtUsd(saldo)}</span>`
          : estaVencida ? '<span class="sello sello--rojo">Vencido</span>' : '<span class="sello sello--naranja">Pendiente</span>';
      return `
        <article class="fila fila--link" data-id="${esc(p.id)}">
          <div class="fila__principal">
            <p class="fila__nombre">${esc(p.clienteNegocio)}</p>
            <p class="fila__detalle">${esc([
              saldo <= 0.004 ? `cobrado ${fmtFecha(p.fechaCobro)}` : `vence ${fmtFecha(p.vence)}`,
              p.medioPago || null,
              cob > 0 ? 'entró a ' + nombrePagador(recibidoPor(p)) : null,
            ].filter(Boolean).join(' · '))}</p>
          </div>
          <div class="fila__lado">
            ${sello}
            <span class="fila__monto">${fmtUsd(total)}</span>
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

  // ============ MODO CUENTA CORRIENTE ============
  function pintarCuentaCorriente(lista) {
    const cuentas = ccTodos(cache);
    const deuda = cuentas.reduce((s, c) => s + Math.max(0, c.saldo), 0);
    const aFavor = cuentas.reduce((s, c) => s + Math.min(0, c.saldo), 0);
    const vencido = cuentas.reduce((s, c) => s + c.vencido, 0);
    const conDeuda = cuentas.filter((c) => c.saldo > 0.004);

    raiz.querySelector('#cob-kpis').innerHTML = `
      <div class="kpi"><p class="kpi__nombre">Nos deben</p><p class="kpi__valor ${deuda ? 'rojo' : 'verde'}">${fmtUsd(deuda)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Vencido</p><p class="kpi__valor ${vencido ? 'rojo' : ''}">${fmtUsd(vencido)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Clientes con saldo</p><p class="kpi__valor">${conDeuda.length}</p></div>
      <div class="kpi"><p class="kpi__nombre">Saldo a favor de clientes</p><p class="kpi__valor">${fmtUsd(Math.abs(aFavor))}</p></div>`;

    lista.innerHTML = cuentas.map((c) => `
      <article class="fila fila--link" data-cliente="${esc(c.cliente.id)}">
        <div class="fila__principal">
          <p class="fila__nombre">${esc(c.cliente.negocio || '—')}</p>
          <p class="fila__detalle">${esc(`facturado ${fmtUsd(c.devengado)} · cobrado ${fmtUsd(c.cobrado)}`)}${
            c.vencido > 0.004 ? ` · <span class="rojo">vencido ${fmtUsd(c.vencido)}</span>` : ''}</p>
        </div>
        <div class="fila__lado">
          <span class="fila__monto ${c.saldo > 0.004 ? 'rojo' : c.saldo < -0.004 ? 'verde' : ''}">${fmtUsd(c.saldo)}</span>
          ${c.saldo < -0.004 ? '<span class="sello sello--verde">a favor</span>' : ''}
        </div>
      </article>`).join('') ||
      (cache.listo.pagos
        ? '<p class="vacio">// Todavía no hay movimientos de cuenta corriente.</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('[data-cliente]').forEach((el) =>
      el.addEventListener('click', () => { location.hash = '#/clientes/' + el.dataset.cliente; })
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
          montoCobrado: 0,
          fechaCobro: null,
          medioPago: '',
          recibidoPor: null,
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
    const total = Number(p.montoUsd) || 0;
    const yaCobrado = cobradoDe(p);
    const saldo = Math.max(0, total - yaCobrado);

    if (saldo > 0.004) {
      const cliente = cache.clientes.find((c) => c.id === p.clienteId);
      const wa = cliente ? linkWa(cliente.telefono, PLANTILLAS_WA.cobro, {
        contacto: cliente.contacto || '', negocio: cliente.negocio || '',
        mes: nombrePeriodo(p.periodo), monto: fmtUsd(saldo),
      }) : null;
      const m = modal(`Cobrar: ${p.clienteNegocio}`, `
        <form id="form-cobrar">
          <p class="modal__nota">// Cuota de ${esc(nombrePeriodo(p.periodo))} · vence ${esc(fmtFecha(p.vence))}${
            yaCobrado > 0 ? ` · ya entraron ${fmtUsd(yaCobrado)} de ${fmtUsd(total)}` : ''}</p>
          ${wa ? `<a class="boton boton--chico" href="${wa}" target="_blank" rel="noopener" style="text-decoration:none; align-self:flex-start">WA: recordar cobro →</a>` : ''}
          <div class="campos-2">
            <label class="campo">
              <span class="campo__nombre mono">Cuánto entra ahora (USD)</span>
              <input type="number" name="monto" min="0" step="10" required value="${saldo}">
            </label>
            <label class="campo">
              <span class="campo__nombre mono">Fecha de cobro</span>
              <input type="date" name="fecha" required value="${aInputFecha(new Date())}">
            </label>
          </div>
          <div class="campos-2">
            <label class="campo">
              <span class="campo__nombre mono">Medio</span>
              <select name="medio">${selectHtml(MEDIOS_PAGO, 'transferencia')}</select>
            </label>
            <label class="campo">
              <span class="campo__nombre mono">¿Dónde entró? *</span>
              <select name="destino">${selectHtml(opcionesCuenta(), recibidoPor(p))}</select>
            </label>
          </div>
          <p class="modal__nota">// Si la cobró un socio en su cuenta personal, esa plata se le descuenta de su cuenta en el neteo.</p>
          <div class="modal__acciones">
            <button type="button" class="boton boton--peligro" data-quitar>Quitar cuota</button>
            <button type="submit" class="boton boton--lleno">Registrar cobro</button>
          </div>
        </form>`);

      m.el.querySelector('#form-cobrar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const entra = Number(f.monto.value) || 0;
        if (entra <= 0) { toast('El monto tiene que ser mayor a cero', true); return; }
        const acumulado = Math.round((yaCobrado + entra) * 100) / 100;
        try {
          await updateDoc(doc(db, 'pagos', id), {
            estado: acumulado >= total - 0.004 ? 'cobrado' : 'pendiente',
            montoCobrado: acumulado,
            fechaCobro: fechaDeInput(f.fecha.value),
            medioPago: f.medio.value,
            recibidoPor: f.destino.value,
            ...stamp(),
          });
          m.cerrar();
          toast(acumulado >= total - 0.004 ? 'Cuota cobrada 💵' : `Cobro parcial: falta ${fmtUsd(total - acumulado)}`);
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
          <p class="modal__nota">// ${esc(nombrePeriodo(p.periodo))} · ${fmtUsd(yaCobrado)} cobrado el ${esc(fmtFecha(p.fechaCobro))}${
            p.medioPago ? ' por ' + esc(p.medioPago) : ''} · entró a ${esc(nombrePagador(recibidoPor(p)))}.</p>
          <div class="modal__acciones">
            <button type="button" class="boton" data-cerrar>Cerrar</button>
            <button type="button" class="boton boton--peligro" data-revertir>Volver a pendiente</button>
          </div>
        </div>`);
      m.el.querySelector('[data-revertir]').addEventListener('click', async () => {
        try {
          await updateDoc(doc(db, 'pagos', id), {
            estado: 'pendiente', montoCobrado: 0, fechaCobro: null, medioPago: '', recibidoPor: null, ...stamp(),
          });
          m.cerrar();
          toast('Cuota vuelta a pendiente');
        } catch (err) { console.error(err); toast('No se pudo revertir', true); }
      });
    }
  }

  pintar();
  return alCambiar((col) => { if (['pagos', 'clientes', 'cargos'].includes(col)) pintar(); });
}

// ============ CARGOS SUELTOS (lo que no es la cuota mensual) ============
export function formularioCargo(cargo, clienteIdFijo) {
  const esAlta = !cargo;
  const c = cargo || {};
  const clientes = cache.clientes
    .slice()
    .sort((a, b) => (a.negocio || '').localeCompare(b.negocio || ''))
    .map((x) => ({ id: x.id, nombre: x.negocio }));

  const m = modal(esAlta ? 'Cargo a un cliente' : `Editar: ${c.concepto}`, `
    <form id="form-cargo">
      <p class="modal__nota">// Todo lo que se le cobra al cliente y no es la cuota mensual: setup, un trabajo extra, pauta. Un crédito descuenta (bonificación, nota de crédito).</p>
      <label class="campo">
        <span class="campo__nombre mono">Cliente *</span>
        <select name="cliente" required ${clienteIdFijo ? 'disabled' : ''}>${
          selectHtml(clientes, clienteIdFijo || c.clienteId, clienteIdFijo ? null : '— elegir —')}</select>
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Tipo</span>
          <select name="tipo">${selectHtml(
            [{ id: 'cargo', nombre: 'Cargo (le cobramos)' }, { id: 'credito', nombre: 'Crédito (le descontamos)' }],
            c.tipo || 'cargo')}</select>
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Monto (USD) *</span>
          <input type="number" name="monto" min="0" step="0.01" required value="${c.montoUsd ?? ''}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Fecha *</span>
          <input type="date" name="fecha" required value="${aInputFecha(c.fecha || new Date())}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Concepto</span>
          <select name="preset">${selectHtml(CONCEPTOS_CARGO, 'extra')}</select>
        </label>
      </div>
      <label class="campo">
        <span class="campo__nombre mono">Detalle</span>
        <input type="text" name="concepto" placeholder="Sesión de fotos de septiembre" value="${esc(c.concepto || '')}">
      </label>
      <div class="modal__acciones">
        ${esAlta
          ? '<button type="button" class="boton" data-cerrar>Cancelar</button>'
          : '<button type="button" class="boton boton--peligro" data-borrar>Borrar</button>'}
        <button type="submit" class="boton boton--lleno">${esAlta ? 'Cargar' : 'Guardar'}</button>
      </div>
    </form>`);

  if (!esAlta) {
    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      m.cerrar();
      if (!(await confirmar(`Se borra "${c.concepto}" (${fmtUsd(c.montoUsd)}) de la cuenta del cliente.`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'cargos', c.id));
        toast('Cargo borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  m.el.querySelector('#form-cargo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const clienteId = clienteIdFijo || f.cliente.value;
    const cliente = cache.clientes.find((x) => x.id === clienteId);
    if (!cliente) { toast('Elegí un cliente', true); return; }
    const fecha = fechaDeInput(f.fecha.value);
    const preset = CONCEPTOS_CARGO.find((x) => x.id === f.preset.value);
    const datos = {
      clienteId,
      clienteNegocio: cliente.negocio || '',
      tipo: f.tipo.value,
      montoUsd: Number(f.monto.value) || 0,
      fecha,
      periodo: periodoDe(fecha),
      concepto: f.concepto.value.trim() || (preset ? preset.nombre : 'Cargo'),
    };
    try {
      if (esAlta) {
        await addDoc(collection(db, 'cargos'), { ...datos, ...stamp(true) });
        toast(datos.tipo === 'credito' ? 'Crédito cargado' : 'Cargo cargado');
      } else {
        await updateDoc(doc(db, 'cargos', c.id), { ...datos, ...stamp() });
        toast('Cargo actualizado');
      }
      m.cerrar();
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}
