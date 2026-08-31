// Ficha 360° de un cliente: datos, interacciones y pagos.
import {
  collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth } from '../firebase.js';
import { TIPOS_INTERACCION, PLANTILLAS_WA, nombrePaquete, nombreSocio } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import { ccCliente, vencidoCliente, cobradoDe } from '../finanzas.js';
import { esc, fmtUsd, fmtFecha, aFecha, nombrePeriodo, modal, confirmar, toast, selectHtml, linkWa } from '../ui.js';
import { formularioCliente } from './clientes.js';
import { formularioCargo } from './cobranzas.js';

const NOMBRE_ESTADO = { activo: 'Activo', pausado: 'Pausado', baja: 'Baja' };
const SELLO_ESTADO = { activo: 'sello--verde', pausado: 'sello--naranja', baja: 'sello--apagado' };

export function montarClienteDetalle(raiz, id) {
  let interacciones = [];
  let interaccionesListas = false;

  const pararInteracciones = onSnapshot(
    query(collection(db, 'clientes', id, 'interacciones'), orderBy('fecha', 'desc')),
    (snap) => {
      interacciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      interaccionesListas = true;
      pintar();
    },
    (err) => console.error('Error escuchando interacciones:', err)
  );

  function pintar() {
    const c = cache.clientes.find((x) => x.id === id);
    if (!c) {
      raiz.innerHTML = cache.listo.clientes
        ? `<a class="volver" href="#/clientes">← Clientes</a><p class="vacio">// Ese cliente no existe (¿se borró?).</p>`
        : '<p class="vacio">cargando…</p>';
      return;
    }

    const cc = ccCliente(cache, id);
    const vencido = vencidoCliente(cache, id);

    const telLimpio = (c.telefono || '').replace(/\D/g, '');
    const ig = (c.instagram || '').replace(/^@/, '');

    raiz.innerHTML = `
      <a class="volver" href="#/clientes">← Clientes</a>
      <div class="vista__cab">
        <div>
          <h1 class="vista__titulo">${esc(c.negocio)}</h1>
          <p class="vista__sub mono">
            <span class="sello ${SELLO_ESTADO[c.estado] || ''}">${esc(NOMBRE_ESTADO[c.estado] || c.estado)}</span>
            &nbsp;${esc(nombrePaquete(c.paquete))} · ${fmtUsd(c.cuotaMensualUsd)}/mes · vence el ${esc(c.diaVencimiento)}
          </p>
        </div>
        <button type="button" class="boton boton--chico" id="btn-editar">Editar</button>
      </div>

      <div class="ficha">
        <section class="panel">
          <h2 class="panel__titulo">Datos</h2>
          <div class="datos">
            ${dato('Contacto', esc(c.contacto))}
            ${dato('Teléfono', telLimpio ? `<a href="https://wa.me/${esc(telLimpio)}" target="_blank" rel="noopener">${esc(c.telefono)}</a>` : '')}
            ${dato('Email', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '')}
            ${dato('Instagram', ig ? `<a href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a>` : '')}
            ${dato('Rubro', esc(c.rubro))}
            ${dato('Zona', esc(c.zona))}
            ${dato('Dirección', esc(c.direccion))}
            ${dato('Inicio', esc(fmtFecha(c.fechaInicio)))}
            ${dato('Alta por', esc(nombreSocio(c.creadoPor)))}
          </div>
          ${c.notasGenerales ? `<p class="modal__nota" style="margin-top:12px">// ${esc(c.notasGenerales)}</p>` : ''}
          ${telLimpio ? (() => {
            const base = { contacto: c.contacto || '', negocio: c.negocio || '' };
            const pendiente = cache.pagos
              .filter((p) => p.clienteId === id && (Number(p.montoUsd) || 0) - cobradoDe(p) > 0.004)
              .sort((a, b) => (a.periodo || '').localeCompare(b.periodo || ''))[0];
            const waSeg = linkWa(c.telefono, PLANTILLAS_WA.seguimientoCliente, base);
            const waCobro = pendiente ? linkWa(c.telefono, PLANTILLAS_WA.cobro, {
              ...base, mes: nombrePeriodo(pendiente.periodo),
              monto: fmtUsd((Number(pendiente.montoUsd) || 0) - cobradoDe(pendiente)),
            }) : null;
            const waBienv = linkWa(c.telefono, PLANTILLAS_WA.bienvenida, base);
            return `
              <div class="plantillas">
                <a class="boton boton--chico" href="${waSeg}" target="_blank" rel="noopener">WA: seguimiento</a>
                ${waCobro ? `<a class="boton boton--chico" href="${waCobro}" target="_blank" rel="noopener">WA: recordatorio de cobro</a>` : ''}
                <a class="boton boton--chico" href="${waBienv}" target="_blank" rel="noopener">WA: bienvenida</a>
              </div>`;
          })() : ''}
        </section>

        <section class="panel">
          <h2 class="panel__titulo">Seguimiento
            <button type="button" class="boton boton--chico" id="btn-interaccion">+ Registrar</button>
          </h2>
          <div id="lista-interacciones">
            ${interacciones.map((i) => `
              <div class="interaccion">
                <p class="interaccion__meta"><span class="tipo">${esc(nombreTipo(i.tipo))}</span> · ${esc(fmtFecha(i.fecha))} · ${esc(nombreSocio(i.creadoPor))}</p>
                <p class="interaccion__texto">${esc(i.texto)}</p>
              </div>`).join('') ||
              (interaccionesListas ? '<p class="modal__nota">// Sin registros todavía. Cada llamada, reunión o WhatsApp queda acá.</p>' : '<p class="modal__nota">cargando…</p>')}
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__titulo">Cuenta corriente
            <button type="button" class="boton boton--chico" id="btn-cargo-cliente">+ Cargo</button>
          </h2>
          <div class="cc-resumen">
            <div><span class="mono">Facturado</span><b>${fmtUsd(cc.devengado)}</b></div>
            <div><span class="mono">Cobrado</span><b>${fmtUsd(cc.cobrado)}</b></div>
            <div><span class="mono">Saldo</span><b class="${cc.saldo > 0.004 ? 'rojo' : cc.saldo < -0.004 ? 'verde' : ''}">${fmtUsd(cc.saldo)}</b></div>
          </div>
          ${vencido > 0.004 ? `<p class="modal__nota rojo">// Vencido: ${fmtUsd(vencido)}</p>` : ''}
          <div class="filas">
            ${cc.filas.slice().reverse().map((f) => `
                <div class="fila" ${f.tipo === 'cargo' || f.tipo === 'credito' ? `data-cargo="${esc(f.ref)}" style="cursor:pointer"` : ''}>
                  <div class="fila__principal">
                    <p class="fila__nombre" style="font-size:14px">${esc(f.concepto)}</p>
                    <p class="fila__detalle">${esc(fmtFecha(f.fecha))} · saldo ${fmtUsd(f.saldo)}</p>
                  </div>
                  <div class="fila__lado">
                    <span class="fila__monto ${f.haber ? 'verde' : ''}">${f.haber ? '−' : '+'} ${fmtUsd(f.haber || f.debe)}</span>
                  </div>
                </div>`).join('') || '<p class="modal__nota">// Sin movimientos. Las cuotas se generan desde Cobros; los extras con "+ Cargo".</p>'}
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__titulo">Zona de riesgo</h2>
          <button type="button" class="boton boton--chico boton--peligro" id="btn-borrar">Borrar cliente</button>
        </section>
      </div>`;

    raiz.querySelector('#btn-editar').addEventListener('click', () => formularioCliente(c));

    raiz.querySelector('#btn-cargo-cliente').addEventListener('click', (e) => {
      e.stopPropagation();
      formularioCargo(null, id);
    });
    raiz.querySelectorAll('[data-cargo]').forEach((el) =>
      el.addEventListener('click', () => {
        const cargo = cache.cargos.find((x) => x.id === el.dataset.cargo);
        if (cargo) formularioCargo(cargo, id);
      })
    );

    raiz.querySelector('#btn-interaccion').addEventListener('click', () => {
      const m = modal('Registrar seguimiento', `
        <form id="form-interaccion">
          <label class="campo">
            <span class="campo__nombre mono">Tipo</span>
            <select name="tipo">${selectHtml(TIPOS_INTERACCION, 'whatsapp')}</select>
          </label>
          <label class="campo">
            <span class="campo__nombre mono">¿Qué pasó?</span>
            <textarea name="texto" required placeholder="Le mandamos la propuesta, quedó en responder el lunes…"></textarea>
          </label>
          <div class="modal__acciones">
            <button type="button" class="boton" data-cerrar>Cancelar</button>
            <button type="submit" class="boton boton--lleno">Guardar</button>
          </div>
        </form>`);
      m.el.querySelector('#form-interaccion').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await addDoc(collection(db, 'clientes', id, 'interacciones'), {
            tipo: e.target.tipo.value,
            texto: e.target.texto.value.trim(),
            fecha: new Date(),
            creadoPor: auth.currentUser.uid,
            creadoEl: serverTimestamp(),
          });
          m.cerrar();
          toast('Seguimiento registrado');
        } catch (err) { console.error(err); toast('No se pudo guardar', true); }
      });
    });

    raiz.querySelector('#btn-borrar').addEventListener('click', async () => {
      if (!(await confirmar(`Se borra "${c.negocio}" con su ficha (los pagos generados quedan en Cobros).`, 'Borrar'))) return;
      try {
        await deleteDoc(doc(db, 'clientes', id));
        toast('Cliente borrado');
        location.hash = '#/clientes';
      } catch (err) { console.error(err); toast('No se pudo borrar', true); }
    });
  }

  pintar();
  const pararCache = alCambiar((col) => {
    if (col === 'clientes' || col === 'pagos' || col === 'cargos') pintar();
  });

  return () => { pararCache(); pararInteracciones(); };
}

function nombreTipo(id) {
  const t = TIPOS_INTERACCION.find((t) => t.id === id);
  return t ? t.nombre : id;
}

function dato(nombre, valorHtml) {
  if (!valorHtml) return '';
  return `<div><p class="dato__nombre">${esc(nombre)}</p><p class="dato__valor">${valorHtml}</p></div>`;
}
