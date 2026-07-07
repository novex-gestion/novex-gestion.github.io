// Helpers de interfaz: escape, formatos, modales y toasts.

export function esc(v) {
  return String(v == null ? '' : v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmtUsd(n) {
  if (n == null || isNaN(n)) return '—';
  return 'USD ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

// Acepta Timestamp de Firestore, Date, string ISO o null.
export function aFecha(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function fmtFecha(v) {
  const d = aFecha(v);
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtFechaCorta(v) {
  const d = aFecha(v);
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export function haceDias(v) {
  const d = aFecha(v);
  if (!d) return '';
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

// 'YYYY-MM' del mes actual (o de una fecha dada).
export function periodoDe(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nombrePeriodo(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(a, m - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

export function sumarMeses(periodo, delta) {
  const [a, m] = periodo.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return periodoDe(d);
}

// input[type=date] → Date al mediodía local (evita corrimientos de zona).
export function fechaDeInput(valor) {
  return valor ? new Date(valor + 'T12:00:00') : null;
}

export function aInputFecha(v) {
  const d = aFecha(v);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============ MODAL ============
export function modal(titulo, cuerpoHtml) {
  const raiz = document.getElementById('modal-raiz');
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal__cab">
        <h2 class="modal__titulo">${esc(titulo)}</h2>
        <button type="button" class="modal__cerrar" data-cerrar>Cerrar ×</button>
      </div>
      ${cuerpoHtml}
    </div>`;
  raiz.appendChild(fondo);
  document.body.style.overflow = 'hidden';

  function cerrar() {
    fondo.remove();
    if (!raiz.children.length) document.body.style.overflow = '';
  }
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
  });
  const primero = fondo.querySelector('input, select, textarea, button:not([data-cerrar])');
  if (primero) setTimeout(() => primero.focus(), 50);

  return { el: fondo.querySelector('.modal'), cerrar };
}

export function confirmar(mensaje, textoBoton = 'Confirmar') {
  return new Promise((resolver) => {
    const m = modal('¿Seguro?', `
      <div class="modal__cuerpo">
        <p>${esc(mensaje)}</p>
        <div class="modal__acciones">
          <button type="button" class="boton" data-cerrar>Cancelar</button>
          <button type="button" class="boton boton--lleno" data-ok>${esc(textoBoton)}</button>
        </div>
      </div>`);
    let ok = false;
    m.el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; m.cerrar(); resolver(true); });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.el)) { obs.disconnect(); if (!ok) resolver(false); }
    });
    obs.observe(document.getElementById('modal-raiz'), { childList: true });
  });
}

// ============ TOAST ============
export function toast(mensaje, esError = false) {
  const raiz = document.getElementById('toast-raiz');
  const t = document.createElement('div');
  t.className = 'toast' + (esError ? ' toast--error' : '');
  t.textContent = mensaje;
  raiz.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// wa.me con plantilla rellenada ({campo} → valor).
export function linkWa(telefono, plantilla, valores = {}) {
  const tel = String(telefono || '').replace(/\D/g, '');
  if (!tel) return null;
  const texto = plantilla.replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? '');
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

// Normaliza para búsqueda: minúsculas y sin tildes.
export function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function selectHtml(opciones, seleccionado, conVacio = null) {
  let html = conVacio != null ? `<option value="">${esc(conVacio)}</option>` : '';
  for (const o of opciones) {
    html += `<option value="${esc(o.id)}" ${o.id === seleccionado ? 'selected' : ''}>${esc(o.nombre)}</option>`;
  }
  return html;
}
