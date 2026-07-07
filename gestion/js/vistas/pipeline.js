// 01 · PIPELINE — kanban de leads por etapa.
import {
  collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, stamp } from '../firebase.js';
import { ETAPAS, PAQUETES, ORIGENES, PLANTILLAS_WA, nombrePaquete, nombreSocio } from '../config.js';
import { cache, alCambiar } from '../datos.js';
import {
  esc, fmtUsd, fmtFecha, haceDias, aFecha, modal, confirmar, toast, selectHtml, fechaDeInput, aInputFecha, linkWa,
} from '../ui.js';

export function montarPipeline(raiz) {
  raiz.innerHTML = `
    <div class="vista__cab">
      <div>
        <h1 class="vista__titulo">Pipe<em>line</em></h1>
        <p class="vista__sub mono" id="pipe-resumen"></p>
      </div>
      <button type="button" class="boton boton--lleno boton--chico" id="btn-nuevo-lead">+ Lead</button>
    </div>
    <div id="consultas-web"></div>
    <div class="kanban" id="kanban"></div>`;

  raiz.querySelector('#btn-nuevo-lead').addEventListener('click', () => formularioLead(null));

  function pintar() {
    const kanban = raiz.querySelector('#kanban');
    if (!kanban) return;
    pintarConsultas(raiz.querySelector('#consultas-web'));
    const abiertos = cache.leads.filter((l) => l.etapa !== 'ganado' && l.etapa !== 'perdido');
    const valorAbierto = abiertos.reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);
    raiz.querySelector('#pipe-resumen').textContent =
      `${abiertos.length} abiertos · ${fmtUsd(valorAbierto)} en juego`;

    kanban.innerHTML = ETAPAS.map((etapa, i) => {
      const leads = cache.leads
        .filter((l) => l.etapa === etapa.id)
        .sort((a, b) => (aFecha(b.etapaCambiadaEl)?.getTime() || Date.now()) - (aFecha(a.etapaCambiadaEl)?.getTime() || Date.now()));
      const valor = leads.reduce((s, l) => s + (Number(l.valorEstimadoUsd) || 0), 0);
      return `
        <section class="columna" data-etapa="${etapa.id}">
          <header class="columna__cab">
            <span class="columna__nombre"><span class="num">0${i + 1}</span>${esc(etapa.nombre)}</span>
            <span class="columna__datos">${leads.length}${valor ? ' · ' + fmtUsd(valor) : ''}</span>
          </header>
          <div class="columna__cuerpo">
            ${leads.map((l) => tarjetaLead(l)).join('') ||
              (cache.listo.leads ? '<p class="vacio">sin leads acá</p>' : '<p class="vacio">cargando…</p>')}
          </div>
        </section>`;
    }).join('');

    // Interacción de tarjetas
    kanban.querySelectorAll('.lead').forEach((el) => {
      const lead = cache.leads.find((l) => l.id === el.dataset.id);
      if (!lead) return;

      el.addEventListener('click', (e) => {
        if (e.target.closest('.lead__flecha')) return;
        detalleLead(lead.id);
      });
      el.querySelectorAll('.lead__flecha').forEach((btn) => {
        btn.addEventListener('click', () => moverLead(lead, Number(btn.dataset.delta)));
      });

      // Drag & drop (mejora progresiva desktop)
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        el.classList.add('arrastrando');
      });
      el.addEventListener('dragend', () => el.classList.remove('arrastrando'));
    });

    kanban.querySelectorAll('.columna').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('arrastre-encima'); });
      col.addEventListener('dragleave', () => col.classList.remove('arrastre-encima'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('arrastre-encima');
        const lead = cache.leads.find((l) => l.id === e.dataTransfer.getData('text/plain'));
        if (lead && lead.etapa !== col.dataset.etapa) cambiarEtapa(lead, col.dataset.etapa);
      });
    });
  }

  pintar();
  const parar = alCambiar((col) => { if (col === 'leads' || col === 'consultas') pintar(); });
  return parar;
}

// ============ CONSULTAS DESDE LA WEB ============
function pintarConsultas(caja) {
  if (!caja) return;
  const nuevas = cache.consultas
    .filter((c) => c.estado === 'nueva')
    .sort((a, b) => (aFecha(b.fecha)?.getTime() || 0) - (aFecha(a.fecha)?.getTime() || 0));

  if (!nuevas.length) { caja.innerHTML = ''; return; }

  caja.innerHTML = `
    <section class="panel panel--consultas">
      <h2 class="panel__titulo">Consultas desde la web (${nuevas.length})</h2>
      <div class="filas">
        ${nuevas.map((c) => `
          <div class="fila" data-id="${esc(c.id)}">
            <div class="fila__principal">
              <p class="fila__nombre" style="font-size:14px">${esc(c.negocio)}</p>
              <p class="fila__detalle">${esc([c.nombre, c.rubro, fmtFecha(c.fecha)].filter(Boolean).join(' · '))}</p>
            </div>
            <div class="fila__lado" style="flex-direction:row; align-items:center; gap:8px">
              <button type="button" class="boton boton--lleno boton--chico" data-crear>Crear lead</button>
              <button type="button" class="boton boton--chico boton--peligro" data-descartar aria-label="Descartar">×</button>
            </div>
          </div>`).join('')}
      </div>
    </section>`;

  caja.querySelectorAll('.fila').forEach((el) => {
    const consulta = nuevas.find((c) => c.id === el.dataset.id);
    el.querySelector('[data-crear]').addEventListener('click', async () => {
      try {
        const lote = writeBatch(db);
        lote.set(doc(collection(db, 'leads')), {
          negocio: consulta.negocio || '',
          contacto: consulta.nombre || '',
          telefono: '', email: '', instagram: '',
          rubro: consulta.rubro || '',
          zona: '',
          origen: 'web',
          paqueteInteres: null,
          valorEstimadoUsd: null,
          etapa: 'contacto',
          etapaCambiadaEl: serverTimestamp(),
          notas: [{ texto: 'Entró por el formulario de la web.', fecha: new Date(), por: auth.currentUser.uid }],
          motivoPerdido: '',
          clienteId: null,
          ...stamp(true),
        });
        lote.update(doc(db, 'consultas', consulta.id), { estado: 'procesada', ...stamp() });
        await lote.commit();
        toast('Lead creado desde la consulta');
      } catch (err) { console.error(err); toast('No se pudo crear', true); }
    });
    el.querySelector('[data-descartar]').addEventListener('click', async () => {
      try {
        await updateDoc(doc(db, 'consultas', consulta.id), { estado: 'descartada', ...stamp() });
        toast('Consulta descartada');
      } catch (err) { console.error(err); toast('No se pudo descartar', true); }
    });
  });
}

function tarjetaLead(l) {
  const idx = ETAPAS.findIndex((e) => e.id === l.etapa);
  const detalle = [l.contacto, l.rubro, l.zona].filter(Boolean).join(' · ');
  return `
    <article class="lead" data-id="${esc(l.id)}" draggable="true">
      <p class="lead__negocio">${esc(l.negocio)}</p>
      ${detalle ? `<p class="lead__detalle">${esc(detalle)}</p>` : ''}
      <p class="lead__detalle">${esc(haceDias(l.etapaCambiadaEl))} en esta etapa</p>
      <div class="lead__pie">
        <div class="lead__sellos">
          ${l.paqueteInteres ? `<span class="sello sello--naranja">${esc(nombrePaquete(l.paqueteInteres))}</span>` : ''}
          ${l.valorEstimadoUsd ? `<span class="lead__valor">${fmtUsd(l.valorEstimadoUsd)}</span>` : ''}
        </div>
        <div class="lead__mover">
          <button type="button" class="lead__flecha" data-delta="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Etapa anterior">‹</button>
          <button type="button" class="lead__flecha" data-delta="1" ${idx >= ETAPAS.length - 1 ? 'disabled' : ''} aria-label="Etapa siguiente">›</button>
        </div>
      </div>
    </article>`;
}

function moverLead(lead, delta) {
  const idx = ETAPAS.findIndex((e) => e.id === lead.etapa);
  const destino = ETAPAS[idx + delta];
  if (!destino) return;
  cambiarEtapa(lead, destino.id);
}

async function cambiarEtapa(lead, etapaId) {
  if (etapaId === 'perdido') return pedirMotivoPerdido(lead);
  if (etapaId === 'ganado') return ofrecerConversion(lead);
  try {
    await updateDoc(doc(db, 'leads', lead.id), {
      etapa: etapaId, etapaCambiadaEl: serverTimestamp(), ...stamp(),
    });
  } catch (err) { console.error(err); toast('No se pudo mover', true); }
}

function pedirMotivoPerdido(lead) {
  const m = modal(`Perdido: ${lead.negocio}`, `
    <form id="form-perdido">
      <label class="campo">
        <span class="campo__nombre mono">¿Por qué se perdió?</span>
        <textarea name="motivo" required placeholder="Precio, tiempos, eligió otra agencia…"></textarea>
      </label>
      <div class="modal__acciones">
        <button type="button" class="boton" data-cerrar>Cancelar</button>
        <button type="submit" class="boton boton--lleno">Marcar perdido</button>
      </div>
    </form>`);
  m.el.querySelector('#form-perdido').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        etapa: 'perdido', etapaCambiadaEl: serverTimestamp(),
        motivoPerdido: e.target.motivo.value.trim(), ...stamp(),
      });
      m.cerrar();
      toast('Lead marcado como perdido');
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}

// Ganado → ofrece crear el cliente en el mismo paso (batch).
function ofrecerConversion(lead) {
  const m = modal(`Ganado: ${lead.negocio}`, `
    <form id="form-convertir">
      <p class="modal__nota">// Se marca ganado y se crea la ficha de cliente con estos datos.</p>
      <label class="campo">
        <span class="campo__nombre mono">Paquete contratado</span>
        <select name="paquete" required>${selectHtml(PAQUETES, lead.paqueteInteres)}</select>
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Cuota mensual (USD)</span>
          <input type="number" name="cuota" min="0" step="10" required value="${lead.valorEstimadoUsd || ''}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Día de vencimiento</span>
          <input type="number" name="vencimiento" min="1" max="28" required value="10">
        </label>
      </div>
      <label class="campo">
        <span class="campo__nombre mono">Fecha de inicio</span>
        <input type="date" name="inicio" required value="${aInputFecha(new Date())}">
      </label>
      <div class="modal__acciones">
        <button type="button" class="boton" data-solo-ganado>Solo marcar ganado</button>
        <button type="submit" class="boton boton--lleno">Crear cliente</button>
      </div>
    </form>`);

  m.el.querySelector('[data-solo-ganado]').addEventListener('click', async () => {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        etapa: 'ganado', etapaCambiadaEl: serverTimestamp(), ...stamp(),
      });
      m.cerrar();
      toast('Lead ganado 🎉');
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });

  m.el.querySelector('#form-convertir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const lote = writeBatch(db);
      const refCliente = doc(collection(db, 'clientes'));
      const uid = auth.currentUser.uid;
      const notasPrevias = (lead.notas || [])
        .map((n) => `[${fmtFecha(n.fecha)}] ${n.texto}`).join('\n');

      lote.set(refCliente, {
        negocio: lead.negocio || '',
        contacto: lead.contacto || '',
        telefono: lead.telefono || '',
        email: lead.email || '',
        instagram: lead.instagram || '',
        rubro: lead.rubro || '',
        zona: lead.zona || '',
        direccion: '',
        paquete: f.paquete.value,
        estado: 'activo',
        cuotaMensualUsd: Number(f.cuota.value) || 0,
        diaVencimiento: Number(f.vencimiento.value) || 10,
        fechaInicio: fechaDeInput(f.inicio.value),
        leadId: lead.id,
        notasGenerales: '',
        ...stamp(true),
      });
      if (notasPrevias) {
        lote.set(doc(collection(refCliente, 'interacciones')), {
          tipo: 'nota',
          texto: 'Notas del lead:\n' + notasPrevias,
          fecha: new Date(),
          creadoPor: uid,
          creadoEl: serverTimestamp(),
        });
      }
      lote.update(doc(db, 'leads', lead.id), {
        etapa: 'ganado', etapaCambiadaEl: serverTimestamp(), clienteId: refCliente.id, ...stamp(),
      });
      await lote.commit();
      m.cerrar();
      toast('Cliente creado 🎉');
      location.hash = '#/clientes/' + refCliente.id;
    } catch (err) { console.error(err); toast('No se pudo convertir', true); }
  });
}

// ============ DETALLE DE LEAD ============
export function detalleLead(id) {
  const lead = cache.leads.find((l) => l.id === id);
  if (!lead) return;
  const notas = (lead.notas || []).slice().reverse();
  const wa = linkWa(lead.telefono, PLANTILLAS_WA.seguimientoLead, {
    contacto: lead.contacto || '', negocio: lead.negocio || '',
  });

  const m = modal(lead.negocio, `
    <div class="modal__cuerpo">
      <div class="datos">
        ${dato('Etapa', ETAPAS.find((e) => e.id === lead.etapa)?.nombre || lead.etapa)}
        ${dato('Contacto', lead.contacto)}
        ${dato('Teléfono', lead.telefono)}
        ${dato('Email', lead.email)}
        ${dato('Instagram', lead.instagram)}
        ${dato('Rubro', lead.rubro)}
        ${dato('Zona', lead.zona)}
        ${dato('Origen', ORIGENES.find((o) => o.id === lead.origen)?.nombre || lead.origen)}
        ${dato('Interés', lead.paqueteInteres ? nombrePaquete(lead.paqueteInteres) : '')}
        ${dato('Valor est.', lead.valorEstimadoUsd ? fmtUsd(lead.valorEstimadoUsd) : '')}
        ${dato('Cargado por', nombreSocio(lead.creadoPor))}
        ${dato('Alta', fmtFecha(lead.creadoEl))}
      </div>
      ${lead.motivoPerdido ? `<p class="modal__nota">// Perdido: ${esc(lead.motivoPerdido)}</p>` : ''}
      ${wa ? `<a class="boton boton--chico" href="${wa}" target="_blank" rel="noopener" style="text-decoration:none">WhatsApp: seguimiento →</a>` : ''}
      ${lead.clienteId ? `<a class="boton boton--chico" href="#/clientes/${esc(lead.clienteId)}" data-cerrar style="text-decoration:none">Ver ficha de cliente →</a>` : ''}

      <div>
        <p class="campo__nombre mono" style="margin-bottom:8px">Notas</p>
        ${notas.map((n) => `
          <div class="interaccion">
            <p class="interaccion__meta">${esc(fmtFecha(n.fecha))} · ${esc(nombreSocio(n.por))}</p>
            <p class="interaccion__texto">${esc(n.texto)}</p>
          </div>`).join('') || '<p class="modal__nota">// Sin notas todavía.</p>'}
      </div>

      <form id="form-nota" style="display:flex; gap:8px">
        <input type="text" name="texto" placeholder="Agregar nota…" required
          style="flex:1; background:var(--negro); border:1px solid var(--borde); color:var(--crema); padding:9px 12px; font-family:var(--body); font-size:14px">
        <button type="submit" class="boton boton--chico">Sumar</button>
      </form>

      <div class="modal__acciones">
        <button type="button" class="boton boton--peligro" data-borrar>Borrar</button>
        <button type="button" class="boton" data-editar>Editar</button>
      </div>
    </div>`);

  m.el.querySelector('#form-nota').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'leads', id), {
        notas: arrayUnion({ texto: e.target.texto.value.trim(), fecha: new Date(), por: auth.currentUser.uid }),
        ...stamp(),
      });
      m.cerrar();
      detalleLead(id);
    } catch (err) { console.error(err); toast('No se pudo guardar la nota', true); }
  });

  m.el.querySelector('[data-editar]').addEventListener('click', () => { m.cerrar(); formularioLead(lead); });

  m.el.querySelector('[data-borrar]').addEventListener('click', async () => {
    if (!(await confirmar(`Se borra el lead "${lead.negocio}" definitivamente.`, 'Borrar'))) return;
    try {
      await deleteDoc(doc(db, 'leads', id));
      m.cerrar();
      toast('Lead borrado');
    } catch (err) { console.error(err); toast('No se pudo borrar', true); }
  });
}

function dato(nombre, valor) {
  if (!valor) return '';
  return `<div><p class="dato__nombre">${esc(nombre)}</p><p class="dato__valor">${esc(valor)}</p></div>`;
}

// ============ ALTA / EDICIÓN ============
function formularioLead(lead) {
  const esAlta = !lead;
  const l = lead || {};
  const m = modal(esAlta ? 'Nuevo lead' : `Editar: ${l.negocio}`, `
    <form id="form-lead">
      <label class="campo">
        <span class="campo__nombre mono">Negocio *</span>
        <input type="text" name="negocio" required value="${esc(l.negocio || '')}">
      </label>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Contacto</span>
          <input type="text" name="contacto" value="${esc(l.contacto || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Teléfono</span>
          <input type="tel" name="telefono" inputmode="tel" value="${esc(l.telefono || '')}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Email</span>
          <input type="email" name="email" value="${esc(l.email || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Instagram</span>
          <input type="text" name="instagram" placeholder="@..." value="${esc(l.instagram || '')}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Rubro</span>
          <input type="text" name="rubro" placeholder="Gastronomía, comercio…" value="${esc(l.rubro || '')}">
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Zona</span>
          <input type="text" name="zona" placeholder="Pilar, Escobar…" value="${esc(l.zona || '')}">
        </label>
      </div>
      <div class="campos-2">
        <label class="campo">
          <span class="campo__nombre mono">Origen</span>
          <select name="origen">${selectHtml(ORIGENES, l.origen || 'referido')}</select>
        </label>
        <label class="campo">
          <span class="campo__nombre mono">Paquete de interés</span>
          <select name="paqueteInteres">${selectHtml(PAQUETES, l.paqueteInteres, '— sin definir —')}</select>
        </label>
      </div>
      <label class="campo">
        <span class="campo__nombre mono">Valor estimado (USD/mes)</span>
        <input type="number" name="valor" min="0" step="10" value="${l.valorEstimadoUsd || ''}">
      </label>
      <div class="modal__acciones">
        <button type="button" class="boton" data-cerrar>Cancelar</button>
        <button type="submit" class="boton boton--lleno">${esAlta ? 'Crear lead' : 'Guardar'}</button>
      </div>
    </form>`);

  m.el.querySelector('#form-lead').addEventListener('submit', async (e) => {
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
      origen: f.origen.value,
      paqueteInteres: f.paqueteInteres.value || null,
      valorEstimadoUsd: f.valor.value ? Number(f.valor.value) : null,
    };
    try {
      if (esAlta) {
        await addDoc(collection(db, 'leads'), {
          ...datos,
          etapa: 'contacto',
          etapaCambiadaEl: serverTimestamp(),
          notas: [],
          motivoPerdido: '',
          clienteId: null,
          ...stamp(true),
        });
        toast('Lead creado');
      } else {
        await updateDoc(doc(db, 'leads', l.id), { ...datos, ...stamp() });
        toast('Lead actualizado');
      }
      m.cerrar();
    } catch (err) { console.error(err); toast('No se pudo guardar', true); }
  });
}
