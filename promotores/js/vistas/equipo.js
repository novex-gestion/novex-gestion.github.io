// 02 · EQUIPO — los promotores que ya están en la calle.
// Lleva la cuenta de altas de cada uno, que es de donde sale lo que cobra
// (y el bono cada 10). Es el seguimiento que hoy no existe en ningún lado.
import {
  doc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from '../firebase.js';
import { PAGO, bonosPorAltas, aCobrarPromotor, fmtPesos } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { esc, fmtFechaCorta, modal, toast } from '../../../gestion/js/ui.js';

export function montarEquipo(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Equi<em>po</em></h1>
        <p class="vista__sub mono" id="eq-resumen"></p>
      </div>
    </div>
    <div class="kpis" id="eq-kpis"></div>
    <div class="filas" id="eq-lista"></div>`;

  function pintar() {
    const lista = raiz.querySelector('#eq-lista');
    if (!lista) return;

    const activos = (cache.postulantes || []).filter((p) => p.estado === 'activo');
    const altas = activos.reduce((s, p) => s + (Number(p.altas) || 0), 0);
    const aPagar = activos.reduce((s, p) => s + aCobrarPromotor(p.altas), 0);
    const cobra = altas * PAGO.porAltaCanal;

    raiz.querySelector('#eq-resumen').textContent =
      `${activos.length} en la calle · ${altas} altas`;

    raiz.querySelector('#eq-kpis').innerHTML = `
      <div class="kpi"><p class="kpi__nombre">Promotores</p><p class="kpi__valor">${activos.length}</p></div>
      <div class="kpi"><p class="kpi__nombre">Altas</p><p class="kpi__valor">${altas}</p></div>
      <div class="kpi"><p class="kpi__nombre">A pagar</p><p class="kpi__valor">${fmtPesos(aPagar)}</p></div>
      <div class="kpi"><p class="kpi__nombre">Margen bruto</p><p class="kpi__valor">${fmtPesos(cobra - aPagar)}</p></div>`;

    lista.innerHTML = activos
      .sort((a, b) => (Number(b.altas) || 0) - (Number(a.altas) || 0))
      .map((p) => {
        const n = Number(p.altas) || 0;
        const faltan = PAGO.bonoCadaAltas - (n % PAGO.bonoCadaAltas);
        const detalle = [
          p.localidad,
          `${n} altas`,
          bonosPorAltas(n) ? `${bonosPorAltas(n)} bono(s)` : null,
          n > 0 && faltan < PAGO.bonoCadaAltas ? `faltan ${faltan} para el próximo bono` : null,
        ].filter(Boolean).join(' · ');
        return `
          <article class="fila" data-id="${esc(p.id)}">
            <div class="fila__principal">
              <p class="fila__nombre">${esc(p.nombre || 'Sin nombre')}</p>
              <p class="fila__detalle">${esc(detalle)}</p>
            </div>
            <div class="fila__lado">
              <p class="fila__monto">${fmtPesos(aCobrarPromotor(n))}</p>
            </div>
          </article>`;
      }).join('') ||
      (cache.listo.postulantes
        ? '<p class="vacio">// Todavía no hay nadie en la calle.</p>'
        : '<p class="vacio">cargando…</p>');

    lista.querySelectorAll('.fila').forEach((el) => {
      const p = (cache.postulantes || []).find((x) => x.id === el.dataset.id);
      if (p) el.addEventListener('click', () => detalle(p));
    });
  }

  function detalle(p) {
    const n = Number(p.altas) || 0;
    const m = modal(p.nombre || 'Promotor', `
      <div class="modal__cuerpo">
        <div class="datos">
          <div><p class="dato__nombre">Altas</p><p class="dato__valor">${n}</p></div>
          <div><p class="dato__nombre">Bonos ganados</p><p class="dato__valor">${bonosPorAltas(n)}</p></div>
          <div><p class="dato__nombre">Le corresponde</p><p class="dato__valor">${fmtPesos(aCobrarPromotor(n))}</p></div>
          <div><p class="dato__nombre">En la calle desde</p><p class="dato__valor">${
            p.activoDesde ? fmtFechaCorta(p.activoDesde) : '—'}</p></div>
        </div>

        <div class="campo">
          <label class="campo__nombre" for="eq-altas">Altas confirmadas</label>
          <input type="number" id="eq-altas" min="0" step="1" value="${n}">
        </div>
        <p class="ficha">Se cuentan las altas que el canal ya dio por activadas: la terminal
        tiene que haber facturado. Una alta cargada que despues no activa se paga igual y no
        vuelve atras, asi que conviene cargarla recien cuando esta confirmada.</p>

        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-guardar>Guardar</button>
        </div>
      </div>`);

    m.el.querySelector('[data-guardar]').addEventListener('click', async () => {
      const altas = Math.max(0, parseInt(m.el.querySelector('#eq-altas').value, 10) || 0);
      try {
        await updateDoc(doc(db, 'postulantes', p.id), {
          altas, ultimaActividad: serverTimestamp(), ...stamp(),
        });
        m.cerrar();
        toast('Guardado');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
  }

  pintar();
  return alCambiar((col) => { if (col === 'postulantes') pintar(); });
}
