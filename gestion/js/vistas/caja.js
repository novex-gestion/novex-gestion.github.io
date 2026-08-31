// 06 · CAJA — la plata de la sociedad: qué hay, qué entró y qué salió.
//
// La caja NO se carga a mano entera: los gastos pagados por la cuenta NOVEX y
// los cobros que entraron a la caja se leen de sus módulos. Acá sólo se cargan
// los movimientos propios: aportes, retiros, reintegros y ajustes.
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { SOCIOS, TIPOS_MOVIMIENTO, nombreSocio, nombreTipoMovimiento } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { caja, cajaDelPeriodo, rotuloTipo } from '../finanzas.js';
import {
  esc, fmtUsd, fmtFechaCorta, aInputFecha, fechaDeInput, periodoDe, nombrePeriodo, sumarMeses,
  modal, confirmar, toast, selectHtml,
} from '../ui.js';

export function montarCaja(raiz) {
  let periodo = periodoDe();

  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Ca<em>ja</em></h1>
        <p class="vista__sub mono">La plata de la sociedad</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button type="button" class="boton boton--chico" id="btn-aporte">+ Aporte</button>
        <button type="button" class="boton boton--chico" id="btn-retiro">− Retiro</button>
        <button type="button" class="boton boton--lleno boton--chico" id="btn-mov">+ Movimiento</button>
      </div>
    </div>
    <div class="kpis" id="caja-kpis"></div>
    <div class="periodo">
      <button type="button" id="caja-antes" aria-label="Mes anterior">‹</button>
      <span class="periodo__nombre" id="caja-nombre"></span>
      <button type="button" id="caja-despues" aria-label="Mes siguiente">›</button>
    </div>
    <div class="filas" id="caja-lista" style="margin-top:14px"></div>`;

  raiz.querySelector('#btn-aporte').addEventListener('click', () => formularioMovimiento(null, 'aporte', periodo));
  raiz.querySelector('#btn-retiro').addEventListener('click', () => formularioMovimiento(null, 'retiro', periodo));
  raiz.querySelector('#btn-mov').addEventListener('click', () => formularioMovimiento(null, 'ingreso', periodo));
  raiz.querySelector('#caja-antes').addEventListener('click', () => { periodo = sumarMeses(periodo, -1); pintar(); });
  raiz.querySelector('#caja-despues').addEventListener('click', () => { periodo = sumarMeses(periodo, 1); pintar(); });

  function pintar() {
    const lista = raiz.querySelector('#caja-lista');
    if (!lista) return;

    const c = caja(cache);
    const mes = cajaDelPeriodo(cache, periodo);

    raiz.querySelector('#caja-kpis').innerHTML = `
      <div class="kpi">
        <p class="kpi__nombre">Saldo de caja</p>
        <p class="kpi__valor ${c.saldo < 0 ? 'rojo' : 'verde'}">${fmtUsd(c.saldo)}</p>
      </div>
      <div class="kpi"><p class="kpi__nombre">Entró en ${esc(periodo)}</p><p class="kpi__valor verde">${fmtUsd(mes.entradas)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Salió en ${esc(periodo)}</p><p class="kpi__valor rojo">${fmtUsd(mes.salidas)}</p></div>
      <div class="kpi">
        <p class="kpi__nombre">Neto del mes</p>
        <p class="kpi__valor ${mes.neto < 0 ? 'rojo' : ''}">${fmtUsd(mes.neto)}</p>
      </div>`;

    raiz.querySelector('#caja-nombre').textContent = nombrePeriodo(periodo).toUpperCase();

    lista.innerHTML = mes.filas.map((f) => {
      const positivo = f.caja > 0;
      const manual = f.origen === 'movimientos';
      return `
        <article class="fila ${manual ? 'fila--link' : ''}" ${manual ? `data-mov="${esc(f.ref)}"` : ''}>
          <div class="fila__principal">
            <p class="fila__nombre">${esc(f.concepto)}</p>
            <p class="fila__detalle">${esc([
              fmtFechaCorta(f.fecha),
              rotuloTipo(f.clase),
              f.socio ? nombreSocio(f.socio) : null,
              f.detalle,
              manual ? null : 'automático',
            ].filter(Boolean).join(' · '))}</p>
          </div>
          <div class="fila__lado">
            <span class="fila__monto ${positivo ? 'verde' : 'rojo'}">${positivo ? '+' : '−'} ${fmtUsd(Math.abs(f.caja))}</span>
          </div>
        </article>`;
    }).join('') ||
      (cache.listo.movimientos
        ? `<p class="vacio">// Sin movimientos de caja en ${esc(nombrePeriodo(periodo))}.<br>Los cobros que entren a la caja y los gastos pagados por la cuenta NOVEX aparecen acá solos.</p>`
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('[data-mov]').forEach((el) =>
      el.addEventListener('click', () => {
        const mv = cache.movimientos.find((x) => x.id === el.dataset.mov);
        if (mv) formularioMovimiento(mv, mv.tipo, periodo);
      })
    );
  }

  pintar();
  return alCambiar((col) => {
    if (['movimientos', 'gastos', 'pagos', 'clientes'].includes(col)) pintar();
  });
}

// ============ ALTA / EDICIÓN DE MOVIMIENTO ============
export function formularioMovimiento(movimiento, tipoInicial, periodoVisible) {
  const esAlta = !movimiento;
  const mv = movimiento || {};
  const tipo = mv.tipo || tipoInicial || 'ingreso';
  const yo = auth.currentUser ? auth.currentUser.uid : Object.keys(SOCIOS)[0];

  const m = modal(esAlta ? nombreTipoMovimiento(tipo) : `Editar: ${mv.concepto || nombreTipoMovimiento(tipo)}`, `
    <form id="form-mov">
      <label class="campo">
        <span class="campo__nombre mono">Tipo *</span>
        <select name="tipo">${selectHtml(TIPOS_MOVIMIENTO, tipo)}</select>
      </label>
      <p class="modal__nota" id="mov-ayuda"></p>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Fecha *</span>
          <input type="date" name="fecha" required value="${aInputFecha(mv.fecha || new Date())}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Monto (USD) *</span>
          <input type="number" name="monto" min="0" step="0.01" required value="${mv.montoUsd ?? ''}">
        </label>
      </div>
      <label class="campo" id="campo-socio">
        <span class="campo__nombre mono" id="rotulo-socio">Socio *</span>
        <select name="socio">${selectHtml(
          Object.keys(SOCIOS).map((u) => ({ id: u, nombre: nombreSocio(u) })), mv.socio || yo)}</select>
      </label>
      <label class="campo" id="campo-destino" hidden>
        <span class="campo__nombre mono">Se lo transfiere a *</span>
        <select name="destino">${selectHtml(
          Object.keys(SOCIOS).map((u) => ({ id: u, nombre: nombreSocio(u) })), mv.socioDestino || '')}</select>
      </label>
      <label class="campo">
        <span class="campo__nombre mono">Concepto</span>
        <input type="text" name="concepto" placeholder="Para qué fue" value="${esc(mv.concepto || '')}">
      </label>
      <div class="modal__acciones">
        ${esAlta
          ? '<button type="button" class="boton" data-cerrar>Cancelar</button>'
          : '<button type="button" class="boton boton--peligro" data-borrar>Borrar</button>'}
        <button type="submit" class="boton boton--lleno">${esAlta ? 'Registrar' : 'Guardar'}</button>
      </div>
    </form>`);

  const form = m.el.querySelector('#form-mov');

  function refrescar() {
    const t = form.tipo.value;
    const def = TIPOS_MOVIMIENTO.find((x) => x.id === t);
    m.el.querySelector('#mov-ayuda').textContent = '// ' + (def ? def.ayuda : '');
    const necesitaSocio = ['aporte', 'retiro', 'reintegro', 'neteo'].includes(t);
    m.el.querySelector('#campo-socio').hidden = !necesitaSocio;
    m.el.querySelector('#campo-destino').hidden = t !== 'neteo';
    m.el.querySelector('#rotulo-socio').textContent = t === 'neteo' ? 'Lo paga *' : 'Socio *';
  }
  form.tipo.addEventListener('change', refrescar);
  refrescar();

  if (!esAlta) {
    m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
      m.cerrar();
      if (!(await confirmar(`Se borra el movimiento "${mv.concepto || nombreTipoMovimiento(mv.tipo)}" (${fmtUsd(mv.montoUsd)}).`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'movimientos', mv.id));
        toast('Movimiento borrado');
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const t = f.tipo.value;
    const necesitaSocio = ['aporte', 'retiro', 'reintegro', 'neteo'].includes(t);
    if (t === 'neteo' && f.socio.value === f.destino.value) {
      toast('El neteo va de un socio al otro', true);
      return;
    }
    const fecha = fechaDeInput(f.fecha.value);
    const datos = {
      tipo: t,
      fecha,
      periodo: periodoDe(fecha),
      montoUsd: Number(f.monto.value) || 0,
      socio: necesitaSocio ? f.socio.value : null,
      socioDestino: t === 'neteo' ? f.destino.value : null,
      concepto: f.concepto.value.trim() || nombreTipoMovimiento(t),
    };
    try {
      if (esAlta) {
        await addDoc(collection(db, 'movimientos'), { ...datos, ...stamp(true) });
        toast(nombreTipoMovimiento(t) + ' registrado');
      } else {
        await updateDoc(doc(db, 'movimientos', mv.id), { ...datos, ...stamp() });
        toast('Movimiento actualizado');
      }
      m.cerrar();
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}
