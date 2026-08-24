// 02 · EQUIPO — los promotores que ya están en la calle.
// Lleva la cuenta de altas de cada uno, que es de donde sale lo que cobra
// (y el bono cada 10). Es el seguimiento que hoy no existe en ningún lado.
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, stamp } from '../firebase.js';
import { PAGO, bonosPorAltas, aCobrarPromotor, fmtPesos } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { esc, fmtFechaCorta, modal, confirmar, toast } from '../../../gestion/js/ui.js';
import { normalizarTel } from './postulantes.js';

export function montarEquipo(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Equi<em>po</em></h1>
        <p class="vista__sub mono" id="eq-resumen"></p>
      </div>
    </div>
    <div class="kpis" id="eq-kpis"></div>
    <div class="filas" id="eq-lista"></div>
    <section class="panel" id="eq-coordinadores" style="margin-top:18px"></section>`;

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
          p.numeroActivador ? `Activador N° ${p.numeroActivador}` : '⚠ sin N° de activador',
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
          <div><p class="dato__nombre">Activador N°</p><p class="dato__valor">${esc(p.numeroActivador || '—')}</p></div>
          <div><p class="dato__nombre">Altas</p><p class="dato__valor">${n}</p></div>
          <div><p class="dato__nombre">Bonos ganados</p><p class="dato__valor">${bonosPorAltas(n)}</p></div>
          <div><p class="dato__nombre">Le corresponde</p><p class="dato__valor">${fmtPesos(aCobrarPromotor(n))}</p></div>
          <div><p class="dato__nombre">En la calle desde</p><p class="dato__valor">${
            p.activoDesde ? fmtFechaCorta(p.activoDesde) : '—'}</p></div>
        </div>

        <div class="campo">
          <label class="campo__nombre" for="eq-numero">N° de activador (Trackeando)</label>
          <input type="text" id="eq-numero" value="${esc(p.numeroActivador || '')}" placeholder="Ej: 1043">
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
      const numeroActivador = m.el.querySelector('#eq-numero').value.trim();
      try {
        await updateDoc(doc(db, 'postulantes', p.id), {
          altas, numeroActivador, ultimaActividad: serverTimestamp(), ...stamp(),
        });
        m.cerrar();
        toast('Guardado');
      } catch (err) { console.error(err); toast('No se pudo guardar', true); }
    });
  }

  // ============ COORDINADORES DE JUNO ============
  // Viven en postulantes/_coordinadores (la colección donde Juno puede leer).
  // Juno les avisa las novedades y les acepta órdenes por WhatsApp, además
  // de Iván y Juan que están siempre.
  const REF_COORD = doc(db, 'postulantes', '_coordinadores');

  async function pintarCoordinadores() {
    const caja = raiz.querySelector('#eq-coordinadores');
    if (!caja) return;
    let lista = [];
    try {
      const d = await getDoc(REF_COORD);
      lista = (d.exists() && Array.isArray(d.data().lista)) ? d.data().lista : [];
    } catch (e) { console.error(e); }

    caja.innerHTML = `
      <h2 class="panel__titulo">Coordinadores de Juno
        <button type="button" class="boton boton--chico" id="coord-nuevo">+ Coordinador</button>
      </h2>
      <p class="modal__nota" style="margin-bottom:10px">// Reciben los avisos de Juno y pueden darle
      órdenes por WhatsApp. Iván y Juan están siempre, sin cargarse acá.</p>
      <div class="filas">
        ${lista.map((c, i) => `
          <div class="fila">
            <div class="fila__principal">
              <p class="fila__nombre" style="font-size:14px">${esc(c.nombre)}</p>
              <p class="fila__detalle">${esc(c.telefono)}</p>
            </div>
            <button type="button" class="boton boton--chico boton--peligro" data-quitar="${i}">Quitar</button>
          </div>`).join('') || '<p class="modal__nota">// Sin coordinadores extra todavía.</p>'}
      </div>`;

    caja.querySelector('#coord-nuevo').addEventListener('click', () => {
      const m = modal('Nuevo coordinador', `
        <div class="modal__cuerpo">
          <div class="campo">
            <label class="campo__nombre" for="co-nombre">Nombre</label>
            <input id="co-nombre" type="text" placeholder="Mati" autocomplete="off">
          </div>
          <div class="campo">
            <label class="campo__nombre" for="co-tel">WhatsApp</label>
            <input id="co-tel" type="tel" placeholder="11 3495-3442" autocomplete="off">
          </div>
          <div class="modal__acciones">
            <button type="button" class="boton" data-cerrar>Cancelar</button>
            <button type="button" class="boton boton--lleno" data-crear>Agregar</button>
          </div>
        </div>`);
      m.el.querySelector('[data-crear]').addEventListener('click', async () => {
        const nombre = m.el.querySelector('#co-nombre').value.trim();
        const tel = normalizarTel(m.el.querySelector('#co-tel').value);
        if (!nombre) return toast('Ponele un nombre.');
        if (!tel) return toast('Ese teléfono no se entiende.');
        try {
          await setDoc(REF_COORD, {
            lista: [...lista, { nombre, telefono: tel }],
            actualizado: serverTimestamp(),
            ...stamp(),
          });
          m.cerrar();
          toast(`${nombre} ya puede hablar con Juno (le hace caso en ~10 min)`);
          pintarCoordinadores();
        } catch (e) { console.error(e); toast('No se pudo guardar', true); }
      });
    });

    caja.querySelectorAll('[data-quitar]').forEach((b) =>
      b.addEventListener('click', async () => {
        const i = Number(b.dataset.quitar);
        if (!(await confirmar(`Se quita a ${lista[i].nombre}: Juno deja de avisarle y de aceptarle órdenes.`, 'Quitar'))) return;
        try {
          await setDoc(REF_COORD, {
            lista: lista.filter((_, x) => x !== i),
            actualizado: serverTimestamp(),
            ...stamp(),
          });
          toast('Quitado');
          pintarCoordinadores();
        } catch (e) { console.error(e); toast('No se pudo quitar', true); }
      })
    );
  }

  pintar();
  pintarCoordinadores();
  return alCambiar((col) => { if (col === 'postulantes') pintar(); });
}
