/* ============================================================================
   NOVEX — Sistema de gestión adaptable
   Un motor, muchos negocios. Todo lo que cambia entre un cliente y otro vive en
   el "paquete de negocio": un JSON con { perfil, datos }.
     - perfil: cómo se llaman las cosas, qué módulos se encienden, qué columnas
       tiene cada tabla, en qué moneda se mide, qué forma tiene el embudo.
     - datos: las tablas, siempre con la misma forma.
   Este archivo no sabe de rubros. No hay una sola condición por tipo de negocio.
   ============================================================================ */

/* ---------------------------------------------------------------- utilidades */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseF = s => (s ? new Date(s + "T00:00:00") : null);
const dias = (a, b) => (a && b ? Math.round((b - a) / 86400000) : null);
const suma = (a, f) => a.reduce((t, x) => t + (+f(x) || 0), 0);
const art = g => (g === "f" ? "las" : "los");
const tod = g => (g === "f" ? "todas" : "todos");
const plural = (n, uno, muchos) => `${entero(n)} ${n === 1 ? uno : muchos}`;

let MONEDA = "ARS";
const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const simbolo = () => (MONEDA === "USD" ? "USD " : "$ ");
const money = v => simbolo() + nf.format(Math.round(v || 0));
const moneyC = v => {                                   // compacto, para tablas y fichas
  const a = Math.abs(v || 0);
  if (a >= 1e6) return simbolo() + nf.format(Math.round((v / 1e6) * 10) / 10) + " M";
  if (a >= 1e4) return simbolo() + nf.format(Math.round(v / 1e3)) + " k";
  return money(v);
};
const pct = v => nf.format(Math.round((v || 0) * 100)) + " %";
const pct1 = v => ((v || 0) * 100).toFixed(1).replace(".", ",") + " %";
const entero = v => nf.format(Math.round(v || 0));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtMes = m => MESES[+m.slice(5, 7) - 1] + " " + m.slice(2, 4);
const fmtFecha = f => { if (!f) return "—"; const [y, m, d] = f.split("-"); return d + "/" + m + "/" + y.slice(2); };

const FORMATOS = { money, moneyC, pct, pct1, entero, fecha: fmtFecha, texto: v => esc(v ?? "—") };
const aplicar = (v, f) => (FORMATOS[f] ? FORMATOS[f](v) : esc(v ?? "—"));

/* ------------------------------------------------------------------- estado */
const App = {
  paquetes: {},        // id -> paquete cargado
  actual: null,
  app: "erp",
  ruta: "tablero",
  HOY: new Date(),
};

/* ------------------------------------------------------------------- motor */
const Motor = {
  /* Cuentas a cobrar: las "cuotas" son compromisos de cobro. El titular puede ser
     una obra, un cliente o lo que el negocio use; el motor solo agrupa. */
  cobranzas(d) {
    const cuotas = (d.cuotas || []).filter(c => (c.saldo != null ? c.saldo : c.monto - (c.cobrado || 0)) > 0.5);
    const porTitular = {};
    cuotas.forEach(c => {
      const saldo = c.saldo != null ? c.saldo : c.monto - (c.cobrado || 0);
      const b = porTitular[c.titular] || (porTitular[c.titular] = {
        titular: c.titular, nombre: c.titular_nombre || c.titular, total: 0, n: 0,
        d30: 0, d60: 0, d90: 0, mas: 0, porVencer: 0, tipos: {},
      });
      b.total += saldo; b.n++;
      b.tipos[c.tipo || "—"] = (b.tipos[c.tipo || "—"] || 0) + saldo;
      const t = dias(parseF(c.venc || c.fecha), App.HOY);
      if (t == null) b.mas += saldo;
      else if (t < 0) b.porVencer += saldo;
      else if (t <= 30) b.d30 += saldo;
      else if (t <= 60) b.d60 += saldo;
      else if (t <= 90) b.d90 += saldo;
      else b.mas += saldo;
    });
    const filas = Object.values(porTitular).sort((a, b) => b.total - a.total);
    const porTipo = {};
    cuotas.forEach(c => {
      const s = c.saldo != null ? c.saldo : c.monto - (c.cobrado || 0);
      porTipo[c.tipo || "—"] = (porTipo[c.tipo || "—"] || 0) + s;
    });
    return { filas, cuotas, porTipo, total: suma(filas, f => f.total) };
  },

  /* Cuentas a pagar. "arrastre" marca lo que el sistema origen nunca concilió:
     se informa aparte para no inflar la deuda real. */
  cxp(d) {
    const abiertas = (d.facturas || []).filter(f => !f.pagada);
    const vivas = abiertas.filter(f => !f.arrastre);
    const arrastre = abiertas.filter(f => f.arrastre);
    const porProv = {};
    vivas.forEach(f => {
      const b = porProv[f.prov] || (porProv[f.prov] = { prov: f.prov, total: 0, n: 0, vencido: 0, viejo: null });
      b.total += f.monto; b.n++;
      const t = dias(parseF(f.venc || f.fecha), App.HOY);
      if (t > 0) b.vencido += f.monto;
      if (b.viejo == null || t > b.viejo) b.viejo = t;
    });
    return {
      porProv: Object.values(porProv).sort((a, b) => b.total - a.total),
      vivas, arrastre,
      total: suma(vivas, f => f.monto),
      totalArrastre: suma(arrastre, f => f.monto),
    };
  },

  stock(d) {
    const s = d.stock || [];
    return {
      filas: s,
      unidades: suma(s, x => x.cant),
      valor: suma(s, x => x.valor),
      sinValorizar: s.filter(x => x.valor == null).length,
      muerto: s.filter(x => x.dias_sin_vender == null || x.dias_sin_vender > 365),
      lento: s.filter(x => x.dias_sin_vender != null && x.dias_sin_vender > 180 && x.dias_sin_vender <= 365),
    };
  },

  embudo(d, p) {
    const etapas = p.crm.tramos === 2 ? [...p.crm.capta.etapas, ...p.crm.cierra.etapas] : p.crm.capta.etapas;
    const gana = etapas[etapas.length - 1];
    const leads = d.leads || [];
    const conteo = etapas.map(e => ({
      etapa: e, n: leads.filter(l => l.estado === e).length,
      tramo: p.crm.tramos === 2 && p.crm.cierra.etapas.includes(e) ? 2 : 1,
    }));
    const ganados = leads.filter(l => l.estado === gana);
    const porOrigen = {};
    leads.forEach(l => {
      const b = porOrigen[l.origen] || (porOrigen[l.origen] = { origen: l.origen, n: 0, ganados: 0, monto: 0 });
      b.n++; if (l.estado === gana) { b.ganados++; b.monto += l.monto || 0; }
    });
    return {
      etapas, gana, conteo,
      abiertos: leads.filter(l => ![gana, "perdido", "descartado", "dormido"].includes(l.estado)),
      hoy: leads.filter(l => l.f_prox && parseF(l.f_prox) <= App.HOY),
      ganados: ganados.length, valorGanado: suma(ganados, l => l.monto),
      perdidos: leads.filter(l => l.estado === "perdido").length,
      descartados: leads.filter(l => l.estado === "descartado").length,
      dormidos: leads.filter(l => l.estado === "dormido").length,
      pasePendiente: leads.filter(l => l.handoff === "pendiente").length,
      devueltos: leads.filter(l => l.handoff === "devuelto").length,
      porOrigen: Object.values(porOrigen).sort((a, b) => b.n - a.n),
    };
  },

  /* Señales: reglas explícitas sobre los datos cargados. Cada una dice de dónde sale
     el número. Si falta el dato, la señal no aparece — no se estima. */
  senales(pq) {
    const d = pq.datos, v = pq.perfil.voz, out = [];
    const u = d.unidades || [];
    const ventas = suma(u, x => x.ventas);

    if (u.length > 1 && ventas > 0) {
      const top = [...u].sort((a, b) => b.ventas - a.ventas)[0];
      const part = top.ventas / ventas;
      if (part > 0.5) out.push({ nivel: "mal", t: `Concentración: ${pct1(part)} de las ventas en ${top.nombre}`,
        s: `De ${money(ventas)} vendidos en el período, ${money(top.ventas)} son de una sola ${v.unidad.toLowerCase()}. Si esa ${v.unidad.toLowerCase()} falla — precio, entrega, exclusividad — cae el negocio entero.` });
    }

    const st = this.stock(d);
    if (st.valor > 0 && ventas > 0) {
      const meses = st.valor / (ventas / 12);
      if (meses > 12) out.push({ nivel: "mal", t: `Stock para ${meses.toFixed(1)} meses de venta`,
        s: `Hay ${money(st.valor)} inmovilizado y se vende ${money(ventas / 12)} por mes. Al ritmo actual, tardaría ${meses.toFixed(1)} meses en salir.` });
      else if (meses > 6) out.push({ nivel: "alerta", t: `Stock para ${meses.toFixed(1)} meses de venta`,
        s: `${money(st.valor)} inmovilizado contra ${money(ventas / 12)} de venta mensual.` });
    }
    if (st.muerto.length) {
      const val = suma(st.muerto, x => x.valor);
      out.push({ nivel: "alerta", t: `${plural(st.muerto.length, "artículo", "artículos")} sin vender hace más de un año`,
        s: `${entero(suma(st.muerto, x => x.cant))} unidades${val ? ", " + money(val) + " valorizados" : ""}. Es plata quieta, no surtido.` });
    }

    const cob = this.cobranzas(d);
    const tipos = Object.entries(cob.porTipo).filter(([k]) => k !== "—");
    if (tipos.length > 1) {
      const [tipoMayor, montoMayor] = tipos.sort((a, b) => b[1] - a[1])[0];
      if (montoMayor / cob.total > 0.5 && tipoMayor === "remito") out.push({ nivel: "mal",
        t: `${money(montoMayor)} en remitos sin facturar`,
        s: `Es el ${pct1(montoMayor / cob.total)} de lo pendiente. Mercadería entregada que todavía no se facturó: no se puede reclamar como deuda ni se declaró como venta.` });
    }
    const viejo = cob.filas.filter(f => f.mas > 0);
    if (viejo.length) out.push({ nivel: "alerta", t: `${money(suma(viejo, f => f.mas))} con más de 90 días`,
      s: `En ${plural(viejo.length, "cuenta", "cuentas")}. Cuanto más viejo, menos se cobra.` });

    const cxp = this.cxp(d);
    if (cxp.totalArrastre > 0) out.push({ nivel: "alerta", t: `${money(cxp.totalArrastre)} de saldos viejos sin conciliar`,
      s: `${cxp.arrastre.length} comprobantes de proveedor quedaron con saldo en el sistema origen. Antes de tomarlos como deuda hay que depurarlos: no se suman al total por pagar.` });

    const cli = d.clientes || [];
    const dormidos = cli.filter(c => c.dias_sin_comprar > 180 && c.facturado > 0);
    if (dormidos.length && cli.length) {
      const top = [...dormidos].sort((a, b) => b.facturado - a.facturado).slice(0, 5);
      out.push({ nivel: "alerta", t: `${plural(dormidos.length, v.cliente.toLowerCase() + " sin comprar", v.clientes.toLowerCase() + " sin comprar")} hace más de 6 meses`,
        s: `Facturaron ${money(suma(dormidos, c => c.facturado))} históricos. Los cinco más grandes: ${top.map(c => c.nombre).join(", ")}.` });
    }
    if (!out.length) out.push({ nivel: "ok", t: "Sin señales críticas", s: "Ninguna de las reglas configuradas se disparó con los datos cargados." });
    return out;
  },
};

/* ------------------------------------------------------------------ piezas UI */
const UI = {
  fichas: items => `<div class="fichas">${items.filter(Boolean).map(f => `
    <div class="ficha ${f.tono ? "ficha--" + f.tono : ""}">
      <div class="ficha__nombre">${esc(f.nombre)}</div>
      <div class="ficha__valor">${f.valor}</div>
      ${f.pie ? `<div class="ficha__pie">${f.pie}</div>` : ""}
    </div>`).join("")}</div>`,

  bloque: (titulo, cuerpo, nota) => `<div class="bloque"><div class="bloque__titulo">${esc(titulo)}
    ${nota ? `<span class="nota">${nota}</span>` : ""}</div>${cuerpo}</div>`,

  tabla(cols, filas, op = {}) {
    if (!filas || !filas.length) return `<div class="vacio">${op.vacio || "No hay datos cargados para esta vista."}</div>`;
    return `<table><thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}">${esc(c.t)}</th>`).join("")}</tr></thead><tbody>
      ${filas.map((f, i) => `<tr class="${op.clic ? "clicable" : ""}" ${op.clic ? `onclick="${op.clic(f)}"` : ""}>
        ${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.v ? c.v(f, i) : aplicar(f[c.c], c.f)}</td>`).join("")}
      </tr>`).join("")}</tbody></table>`;
  },

  barra: (p, clase) => `<div class="linea-barra ${clase || ""}"><span style="width:${Math.max(0, Math.min(100, (p || 0) * 100))}%"></span></div>`,

  grafico(datos, etiqueta) {
    if (!datos || !datos.length) return `<div class="vacio">Sin serie mensual en el paquete.</div>`;
    const W = 900, H = 200, pad = 30, n = datos.length;
    const max = Math.max(1, ...datos.map(d => Math.max(d.ing || 0, d.costo || 0)));
    const ancho = (W - pad * 2) / n;
    const y = v => H - pad - ((v || 0) / max) * (H - pad * 2);
    const hayCosto = datos.some(d => d.costo);
    const barras = datos.map((d, i) => {
      const x = pad + i * ancho;
      const w = hayCosto ? ancho * 0.32 : ancho * 0.62;
      const off = hayCosto ? ancho * 0.14 : ancho * 0.19;
      return `<rect x="${x + off}" y="${y(d.ing)}" width="${w}" height="${H - pad - y(d.ing)}" fill="#D76526"/>
        ${hayCosto ? `<rect x="${x + ancho * 0.5}" y="${y(d.costo)}" width="${w}" height="${H - pad - y(d.costo)}" fill="#4a4a4c"/>` : ""}
        ${n <= 26 && (i % (n > 14 ? 2 : 1) === 0) ? `<text x="${x + ancho / 2}" y="${H - 10}" text-anchor="middle" font-size="9.5" fill="#7a7a77" font-family="IBM Plex Mono">${fmtMes(d.mes)}</text>` : ""}`;
    }).join("");
    return `<svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="rgba(255,255,255,.12)"/>${barras}</svg>
      <div class="leyenda"><span><i style="background:#D76526"></i>${esc(etiqueta || "Ventas netas del mes")}</span>
      ${hayCosto ? `<span><i style="background:#4a4a4c"></i>Costos</span>` : ""}</div>`;
  },
};

/* ------------------------------------------------------------------- vistas */
const Vistas = {

  tablero(pq) {
    const d = pq.datos, p = pq.perfil, v = p.voz, m = p.modulos;
    const u = d.unidades || [];
    const ventas = suma(u, x => x.ventas);
    const cob = Motor.cobranzas(d), cxp = Motor.cxp(d), st = Motor.stock(d);
    const senales = Motor.senales(pq);

    const fichas = [
      { nombre: v.contrato, valor: moneyC(ventas), pie: `${u.length} ${v.unidades.toLowerCase()} con movimiento` },
      m.cobranzas && { nombre: "Pendiente de cobro", valor: moneyC(cob.total), tono: cob.total > 0 ? "alerta" : "ok",
        pie: `${cob.filas.length} ${v.clientes.toLowerCase()} con saldo` },
      m.compras && { nombre: "Por pagar", valor: moneyC(cxp.total), tono: cxp.total > 0 ? "alerta" : "",
        pie: cxp.totalArrastre ? `+ ${moneyC(cxp.totalArrastre)} de arrastre sin conciliar` : `${cxp.vivas.length} comprobantes abiertos` },
      m.stock && { nombre: "Stock valorizado", valor: st.valor ? moneyC(st.valor) : "—",
        pie: st.valor ? `${entero(st.unidades)} unidades` : "sin precios cargados" },
      m.stock && ventas > 0 && st.valor > 0 && { nombre: "Meses de stock", valor: (st.valor / (ventas / 12)).toFixed(1),
        tono: st.valor / (ventas / 12) > 12 ? "mal" : st.valor / (ventas / 12) > 6 ? "alerta" : "ok", pie: "a ritmo de venta actual" },
      m.resultado && { nombre: "Margen", valor: moneyC(suma(u, x => x.ventas - (x.costo || 0))), tono: "ok" },
    ];

    let html = UI.fichas(fichas);
    html += UI.bloque("Señales", senales.map(s => `
      <div class="senal senal--${s.nivel}">
        <div class="senal__icono">${s.nivel === "ok" ? "✓" : "!"}</div>
        <div class="senal__texto"><b>${esc(s.t)}</b><span>${esc(s.s)}</span></div>
      </div>`).join(""), "reglas sobre los datos cargados");

    html += UI.bloque(p.textos?.serie || "Ventas por mes",
      `<div class="bloque__cuerpo">${UI.grafico(d.pnl, p.textos?.serie_leyenda)}</div>`,
      p.textos?.serie_nota || "");

    html += UI.bloque(v.unidades, UI.tabla(this._colsUnidades(p), u, { clic: f => `App.ir('unidad/${encodeURIComponent(f.id)}')` }),
      "clic para abrir el detalle");
    return html;
  },

  _colsUnidades(p) {
    /* Si el perfil define columnas, mandan esas: sumar un rubro nuevo no toca el código. */
    if (p.vistas?.unidades) return p.vistas.unidades.map(c => ({ ...c, v: c.barra ? f => UI.barra(f[c.c]) : null }));
    const v = p.voz;
    return [
      { t: v.unidad, v: f => `<b>${esc(f.nombre || f.id)}</b>` },
      { t: v.contrato, c: "ventas", f: "moneyC", num: true },
      { t: "Participación", num: true, v: f => pct1(f.participacion || 0) },
      { t: "", v: f => UI.barra(f.participacion) },
      { t: "Unidades", c: "unidades_vendidas", f: "entero", num: true },
      { t: "Stock", num: true, v: f => (f.stock_unidades != null ? entero(f.stock_unidades) : "—") },
    ];
  },

  unidad(pq, id) {
    const d = pq.datos, p = pq.perfil, v = p.voz;
    const u = (d.unidades || []).find(x => String(x.id) === String(id));
    if (!u) return `<div class="vacio">No existe esa ${v.unidad.toLowerCase()}.</div>`;
    const st = (d.stock || []).filter(s => s.linea === u.id);
    const meses = u.ventas > 0 && u.stock_valor ? u.stock_valor / (u.ventas / 12) : null;

    let html = `<button class="volver" onclick="App.ir('unidades')">← ${v.unidades.toLowerCase()}</button>`;
    html += UI.fichas([
      { nombre: v.contrato, valor: moneyC(u.ventas), pie: pct1(u.participacion || 0) + " del total" },
      { nombre: "Unidades vendidas", valor: entero(u.unidades_vendidas) },
      { nombre: "Stock", valor: entero(u.stock_unidades || 0) + " u", pie: u.stock_valor ? moneyC(u.stock_valor) : "sin valorizar" },
      meses ? { nombre: "Meses de stock", valor: meses.toFixed(1), tono: meses > 12 ? "mal" : meses > 6 ? "alerta" : "ok" } : null,
      { nombre: "Artículos", valor: entero(u.articulos || st.length), pie: `${entero(u.comprobantes || 0)} comprobantes` },
    ]);
    html += UI.bloque("Artículos en stock de " + u.nombre, UI.tabla(this._colsStock(), st, { vacio: "Esta línea no tiene stock cargado." }));
    return html;
  },

  unidades(pq) {
    const p = pq.perfil, v = p.voz, u = pq.datos.unidades || [];
    return `<div class="aviso aviso--dato">${esc(p.textos?.unidades || `Cada ${v.unidad.toLowerCase()} agrupa las ventas y el stock de sus artículos.`)}</div>`
      + UI.bloque("Maestro de " + v.unidades.toLowerCase(), UI.tabla(this._colsUnidades(p), u,
        { clic: f => `App.ir('unidad/${encodeURIComponent(f.id)}')` }));
  },

  cobranzas(pq) {
    const d = pq.datos, p = pq.perfil, v = p.voz;
    const cob = Motor.cobranzas(d);
    const t = k => suma(cob.filas, f => f[k]);
    const tipos = Object.entries(cob.porTipo).filter(([k, x]) => k !== "—" && x > 0);

    let html = `<div class="aviso aviso--dato">${esc(p.textos?.cobranzas || "El aging se mide desde la fecha de vencimiento.")}</div>`;
    html += UI.fichas([
      { nombre: "Total pendiente", valor: moneyC(cob.total), pie: `${cob.cuotas.length} comprobantes` },
      { nombre: "Hasta 30 días", valor: moneyC(t("d30")) },
      { nombre: "31 a 90 días", valor: moneyC(t("d60") + t("d90")), tono: "alerta" },
      { nombre: "Más de 90 días", valor: moneyC(t("mas")), tono: t("mas") > 0 ? "mal" : "ok" },
    ]);

    if (tipos.length > 1) html += UI.bloque("Composición de lo pendiente",
      UI.tabla([
        { t: "Tipo", v: f => `<b>${esc(f[0])}</b>` },
        { t: "Monto", num: true, v: f => money(f[1]) },
        { t: "Peso", num: true, v: f => pct1(f[1] / cob.total) },
        { t: "", v: f => UI.barra(f[1] / cob.total) },
      ], tipos), "no es lo mismo una factura impaga que un remito sin facturar");

    html += UI.bloque("Saldo por " + (v.titular_cobranza || v.cliente).toLowerCase(), UI.tabla([
      { t: v.titular_cobranza || v.cliente, v: f => `<b>${esc(f.nombre)}</b><div class="chico">${esc(f.titular)}</div>` },
      { t: "Comprob.", c: "n", num: true },
      { t: "≤30", num: true, v: f => (f.d30 ? moneyC(f.d30) : "—") },
      { t: "31-60", num: true, v: f => (f.d60 ? moneyC(f.d60) : "—") },
      { t: "61-90", num: true, v: f => (f.d90 ? moneyC(f.d90) : "—") },
      { t: "+90", num: true, v: f => (f.mas ? `<b style="color:var(--mal)">${moneyC(f.mas)}</b>` : "—") },
      { t: "Total", num: true, v: f => `<b>${moneyC(f.total)}</b>` },
    ], cob.filas.slice(0, 40)), cob.filas.length > 40 ? `los 40 mayores de ${cob.filas.length}` : "");
    return html;
  },

  tesoreria(pq) {
    const d = pq.datos, p = pq.perfil, v = p.voz;
    const cxp = Motor.cxp(d);
    const vencido = suma(cxp.vivas.filter(f => dias(parseF(f.venc || f.fecha), App.HOY) > 0), f => f.monto);

    let html = UI.fichas([
      { nombre: "Por pagar", valor: moneyC(cxp.total), pie: `${cxp.vivas.length} comprobantes` },
      { nombre: "Con más de 30 días", valor: moneyC(vencido), tono: vencido > 0 ? "alerta" : "ok" },
      cxp.totalArrastre ? { nombre: "Arrastre sin conciliar", valor: moneyC(cxp.totalArrastre), tono: "mal",
        pie: `${cxp.arrastre.length} comprobantes viejos — no suman al total` } : null,
    ]);
    if (cxp.totalArrastre) html += `<div class="aviso"><b>El arrastre se cuenta aparte.</b> Son comprobantes viejos que quedaron con saldo en el sistema origen. Sumarlos daría una deuda que probablemente no existe; ignorarlos sin decirlo sería peor. Se muestran, separados, hasta que alguien los depure.</div>`;

    html += UI.bloque("Por " + v.proveedor.toLowerCase(), UI.tabla([
      { t: v.proveedor, v: f => `<b>${esc(f.prov)}</b>` },
      { t: "Comprob.", c: "n", num: true },
      { t: "Más viejo", num: true, v: f => (f.viejo != null ? f.viejo + " días" : "—") },
      { t: "Vencido", num: true, v: f => (f.vencido ? `<b style="color:var(--alerta)">${moneyC(f.vencido)}</b>` : "—") },
      { t: "Total", num: true, v: f => `<b>${moneyC(f.total)}</b>` },
    ], cxp.porProv.slice(0, 30)), cxp.porProv.length > 30 ? `los 30 mayores de ${cxp.porProv.length}` : "");
    return html;
  },

  _colsStock() {
    return [
      { t: "SKU", v: f => `<span class="mono chico">${esc(f.sku)}</span>` },
      { t: "Descripción", v: f => esc(f.desc) },
      { t: "Línea", v: f => `<span class="chico">${esc(f.linea || "—")}</span>` },
      { t: "Cant.", c: "cant", f: "entero", num: true },
      { t: "Precio ref.", num: true, v: f => (f.precio_ref != null ? money(f.precio_ref) : `<span class="chico">sin precio</span>`) },
      { t: "Valor", num: true, v: f => (f.valor != null ? moneyC(f.valor) : "—") },
      { t: "Sin vender", num: true, v: f => (f.dias_sin_vender != null ? f.dias_sin_vender + " d" : `<span class="chico">nunca</span>`) },
      { t: "Señal", v: f => {
          if (f.dias_sin_vender == null) return `<span class="marca-estado marca-estado--mal">nunca se vendió</span>`;
          if (f.dias_sin_vender > 365) return `<span class="marca-estado marca-estado--mal">sin rotación</span>`;
          if (f.dias_sin_vender > 180) return `<span class="marca-estado marca-estado--alerta">lento</span>`;
          if (f.cant < 5) return `<span class="marca-estado marca-estado--ac">por quebrar</span>`;
          return `<span class="marca-estado marca-estado--ok">ok</span>`;
        } },
    ];
  },

  stock(pq) {
    const d = pq.datos, p = pq.perfil;
    const st = Motor.stock(d);
    let html = `<div class="aviso aviso--dato">${esc(p.textos?.stock || "La rotación se mide por la última venta registrada de cada artículo.")}</div>`;
    html += UI.fichas([
      { nombre: "Unidades", valor: entero(st.unidades), pie: `${st.filas.length} artículos` },
      { nombre: "Valorizado", valor: st.valor ? moneyC(st.valor) : "—",
        pie: st.sinValorizar ? `${st.sinValorizar} sin precio de referencia` : "" },
      { nombre: "Sin rotación", valor: st.muerto.length, tono: st.muerto.length ? "mal" : "ok", pie: "más de un año sin vender" },
      { nombre: "Lentos", valor: st.lento.length, tono: st.lento.length ? "alerta" : "ok", pie: "entre 6 y 12 meses" },
    ]);
    html += UI.bloque("Artículos con existencia",
      UI.tabla(this._colsStock(), [...st.filas].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 60)),
      st.filas.length > 60 ? `los 60 de mayor valor, de ${st.filas.length}` : "");
    return html;
  },

  clientes(pq) {
    const d = pq.datos, v = pq.perfil.voz;
    const cli = d.clientes || [];
    const dormidos = cli.filter(c => c.dias_sin_comprar > 180);
    const activos = cli.filter(c => c.dias_sin_comprar <= 180);
    const total = suma(cli, c => c.facturado);
    const orden = [...cli].sort((a, b) => b.facturado - a.facturado);
    let acum = 0; const top = [];
    for (const c of orden) { acum += c.facturado; top.push(c); if (acum / total > 0.8) break; }

    let html = UI.fichas([
      { nombre: v.clientes + " con historial", valor: entero(cli.length) },
      { nombre: "Activos", valor: entero(activos.length), tono: "ok", pie: "compraron en los últimos 6 meses" },
      { nombre: "Dormidos", valor: entero(dormidos.length), tono: dormidos.length ? "alerta" : "ok", pie: "más de 6 meses sin comprar" },
      { nombre: "Concentración", valor: entero(top.length), pie: `clientes explican el 80 % de lo facturado` },
    ]);
    html += UI.bloque("Ranking por facturación histórica", UI.tabla([
      { t: v.cliente, v: f => `<b>${esc(f.nombre)}</b>` },
      { t: "Provincia", v: f => `<span class="chico">${esc(f.provincia || "—")}</span>` },
      { t: "Comprob.", c: "compras", f: "entero", num: true },
      { t: "Facturado", c: "facturado", f: "moneyC", num: true },
      { t: "Última compra", v: f => fmtFecha(f.ultima_compra) },
      { t: "", v: f => f.dias_sin_comprar > 365 ? `<span class="marca-estado marca-estado--mal">${f.dias_sin_comprar} d</span>`
          : f.dias_sin_comprar > 180 ? `<span class="marca-estado marca-estado--alerta">${f.dias_sin_comprar} d</span>`
          : `<span class="marca-estado marca-estado--ok">${f.dias_sin_comprar} d</span>` },
    ], orden.slice(0, 40)), cli.length > 40 ? `los 40 mayores de ${cli.length}` : "");
    return html;
  },

  resultado(pq) {
    const p = pq.perfil;
    if (p.modulos.resultado) {
      const u = pq.datos.unidades || [];
      return UI.bloque("Margen por " + p.voz.unidad.toLowerCase(), UI.tabla([
        { t: p.voz.unidad, v: f => `<b>${esc(f.nombre)}</b>` },
        { t: "Ventas", c: "ventas", f: "moneyC", num: true },
        { t: "Costo", num: true, v: f => moneyC(f.costo) },
        { t: "Margen", num: true, v: f => `<b style="color:${f.ventas - f.costo > 0 ? "var(--ok)" : "var(--mal)"}">${moneyC(f.ventas - f.costo)}</b>` },
      ], u));
    }
    /* Módulo apagado: en vez de mostrar ceros, se explica qué falta para encenderlo. */
    return `<div class="aviso"><b>Este módulo está apagado en el perfil de ${esc(p.meta.nombre)}.</b>
      ${esc(p.textos?.resultado_apagado || "El sistema origen no tiene cargados los costos, así que no hay margen que calcular.")}</div>
      ${UI.bloque("Qué falta para encenderlo", `<div class="bloque__cuerpo">
        <p style="font-size:13.5px;color:var(--tenue);line-height:1.7">
        El motor ya sabe calcular margen por ${esc(p.voz.unidad.toLowerCase())}, resultado mensual y desvío contra presupuesto:
        es el mismo código que corre en los otros negocios. Lo único que falta es el dato de costo.
        <br><br>Se enciende cambiando <span class="mono" style="color:var(--naranja)">"resultado": true</span> en el perfil,
        el día que los costos estén cargados. Mientras tanto se muestra apagado y no en cero:
        <b style="color:var(--crema)">un cero inventado es peor que un dato que falta</b>, porque alguien lo usa para decidir.</p>
      </div>`)}`;
  },

  crm(pq) {
    const d = pq.datos, p = pq.perfil, v = p.voz, c = p.crm;
    const e = Motor.embudo(d, p);
    const max = Math.max(1, ...e.conteo.map(x => x.n));
    const Gana = e.gana.charAt(0).toUpperCase() + e.gana.slice(1);

    let html = "";
    if (p.modulos.crm_muestra) html += `<div class="aviso"><b>Datos de ejemplo.</b> El sistema origen de ${esc(p.meta.nombre)} no tiene el embudo comercial cargado, así que este módulo se muestra con ${d.leads.length} ${v.leads.toLowerCase()} de muestra para que se vea cómo funciona. Los números del resto del sistema sí son reales.</div>`;

    html += UI.fichas([
      { nombre: "En el embudo", valor: e.abiertos.length, pie: v.leads.toLowerCase() + " sin cerrar" },
      { nombre: "Para hoy", valor: e.hoy.length, tono: e.hoy.length ? "alerta" : "ok", pie: "vencidos o del día" },
      { nombre: Gana + "s", valor: e.ganados, tono: "ok", pie: moneyC(e.valorGanado) },
      { nombre: "Perdidos", valor: e.perdidos, pie: "se trabajaron y no cerraron" },
      { nombre: "Descartados", valor: e.descartados, pie: "nunca calificaron" },
      c.dormido ? { nombre: "Dormidos", valor: e.dormidos, pie: "vuelven solos · ciclo " + c.ciclo } : null,
      c.tramos === 2 ? { nombre: "Pases pendientes", valor: e.pasePendiente, tono: e.pasePendiente ? "alerta" : "ok",
        pie: e.devueltos + " devueltos" } : null,
    ]);

    let emb = `<div class="bloque__cuerpo"><div class="embudo">`;
    e.conteo.forEach((x, i) => {
      if (c.tramos === 2 && i === c.capta.etapas.length)
        emb += `<div class="chico mono" style="margin:6px 0 6px 145px;padding-left:12px;border-left:2px dashed var(--borde)">⇄ EL PASE — de ${esc(c.capta.quien)} a ${esc(c.cierra.quien)}: el otro lado acepta o devuelve con motivo</div>`;
      const fin = i === e.conteo.length - 1;
      emb += `<div class="paso ${fin ? "paso--fin" : ""}">
        <span>${esc(x.etapa)}${fin ? ` <span class="chico">acumulado</span>` : ""}</span>
        <div class="paso__barra"><span style="width:${Math.max(3, (x.n / max) * 100)}%"></span></div>
        <span class="paso__n">${x.n}</span></div>`;
    });
    emb += `</div></div>`;
    html += UI.bloque("Embudo", emb, c.tramos === 2 ? "dos tramos con pase explícito" : "un tramo");

    html += UI.bloque("Por origen", UI.tabla([
      { t: "Origen", v: f => `<b>${esc(f.origen)}</b>` },
      { t: v.leads, c: "n", num: true },
      { t: Gana + "s", c: "ganados", num: true },
      { t: "Conversión", num: true, v: f => `<span class="marca-estado ${f.ganados / f.n > 0.15 ? "marca-estado--ok" : "marca-estado--alerta"}">${pct(f.n ? f.ganados / f.n : 0)}</span>` },
      { t: "Valor cerrado", num: true, v: f => (f.monto ? moneyC(f.monto) : "—") },
    ], e.porOrigen), "el origen se sigue hasta el dinero cerrado");
    return html;
  },

  crmleads(pq) {
    const d = pq.datos, p = pq.perfil, v = p.voz;
    const e = Motor.embudo(d, p);
    const vivos = (d.leads || []).filter(l => !["descartado", "perdido"].includes(l.estado))
      .sort((a, b) => (a.f_prox || "9999") < (b.f_prox || "9999") ? -1 : 1);
    const fuera = (d.leads || []).length - vivos.length;
    return `<div class="aviso aviso--dato">Se muestran ${art(v.gen_l)} ${vivos.length} ${v.leads.toLowerCase()} sin cerrar. Quedan fuera ${fuera} ya descartados o no cerrados, que <b>siguen en la base</b>: son el denominador que hace real el costo por ${v.lead.toLowerCase()} de cada origen.</div>`
      + UI.bloque(v.leads, UI.tabla([
        { t: "ID", v: f => `<span class="mono chico">${esc(f.id)}</span>` },
        { t: "Nombre", v: f => `<b>${esc(f.nombre)}</b>` },
        { t: "Origen", v: f => `<span class="chico">${esc(f.origen)}</span>` },
        { t: "Estado", v: f => `<span class="marca-estado ${f.estado === e.gana ? "marca-estado--ok" : f.estado === "dormido" ? "" : "marca-estado--ac"}">${esc(f.estado)}</span>` },
        { t: "Responsable", v: f => esc(f.responsable) },
        ...(p.crm.tramos === 2 ? [{ t: "Pase", v: f => f.handoff ? `<span class="marca-estado marca-estado--alerta">${esc(f.handoff)}</span>` : "—" }] : []),
        { t: "Próxima acción", v: f => f.f_prox ? (parseF(f.f_prox) <= App.HOY ? `<span class="marca-estado marca-estado--mal">${fmtFecha(f.f_prox)}</span>` : fmtFecha(f.f_prox)) : `<span class="chico">sin fecha</span>` },
        { t: "Valor est.", c: "monto", f: "moneyC", num: true },
      ], vivos.slice(0, 30)), "sin fecha de próxima acción = decisión humana pendiente, no atraso");
  },
};

/* -------------------------------------------------------------- navegación */
App.menu = function (p) {
  const v = p.voz, m = p.modulos;
  if (this.app === "crm") return [["Comercial", null], ["crm", "Embudo"], ["crmleads", v.leads]];
  const items = [["Gestión", null], ["tablero", "Tablero"], ["unidades", v.unidades]];
  if (m.cobranzas) items.push(["cobranzas", "Cobranzas"]);
  if (m.compras) items.push(["tesoreria", "Cuentas a pagar"]);
  if (m.stock) items.push(["stock", "Stock"]);
  if ((p.datos_tiene || {}).clientes !== false) items.push(["clientes", v.clientes]);
  items.push(["Dirección", null], ["resultado", "Resultado"]);
  return items;
};

App.ir = function (ruta) { this.ruta = ruta; this.pintar(); window.scrollTo(0, 0); };

App.usar = function (id) {
  this.actual = id;
  const p = this.paquetes[id].perfil;
  MONEDA = p.meta.moneda || "ARS";
  this.HOY = p.meta.corte ? parseF(p.meta.corte) : new Date();
  document.documentElement.style.setProperty("--naranja", p.meta.acento || "#D76526");
  this.ruta = this.app === "erp" ? "tablero" : "crm";
  this.pintar();
};

App.cambiarApp = function (a) { this.app = a; this.ruta = a === "erp" ? "tablero" : "crm"; this.pintar(); };

App.verPerfil = function () {
  const p = this.paquetes[this.actual].perfil;
  const limpio = { meta: p.meta, voz: p.voz, modulos: p.modulos, crm: { tramos: p.crm.tramos, etapas: p.crm.capta.etapas, dormido: p.crm.dormido } };
  const json = esc(JSON.stringify(limpio, null, 2))
    .replace(/&quot;([\w_]+)&quot;:/g, '<span class="llave">"$1"</span>:')
    .replace(/: &quot;([^&]*)&quot;/g, ': <span class="texto">"$1"</span>')
    .replace(/&quot;([^&:]+)&quot;(?=[,\n\]])/g, '<span class="texto">"$1"</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="bool">$1</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="numero">$1</span>');
  document.getElementById("capa").innerHTML = `
    <div class="panel-fondo" onclick="if(event.target===this)App.cerrar()">
      <button class="boton-linea mono panel__cerrar" onclick="App.cerrar()">cerrar ✕</button>
      <div class="panel">
        <h2>perfil.json — ${esc(p.meta.nombre)}</h2>
        <p>Esto es <b>lo único que cambia</b> entre un negocio y otro. Mismo motor, mismas reglas de cálculo,
        mismas pantallas. El perfil define cómo se llaman las cosas, qué módulos se encienden, en qué moneda
        se mide y qué forma tiene el embudo. Dar de alta un cliente nuevo es escribir uno de estos archivos.</p>
        <pre>${json}</pre>
      </div>
    </div>`;
};
App.cerrar = function () { document.getElementById("capa").innerHTML = ""; };

App.pintar = function () {
  const pq = this.paquetes[this.actual], p = pq.perfil, v = p.voz;

  document.getElementById("selector-negocio").innerHTML = Object.values(this.paquetes).map(x =>
    `<button class="${x.perfil.meta.id === this.actual ? "activo" : ""}" onclick="App.usar('${x.perfil.meta.id}')">
      <i class="punto" style="background:${x.perfil.meta.acento}"></i>${esc(x.perfil.meta.nombre)}</button>`).join("");

  document.getElementById("conmutador-app").innerHTML =
    `<button class="${this.app === "erp" ? "activo" : ""}" onclick="App.cambiarApp('erp')">ERP</button>
     <button class="${this.app === "crm" ? "activo" : ""}" onclick="App.cambiarApp('crm')" ${p.modulos.crm ? "" : "disabled style='opacity:.35'"}>CRM</button>`;

  document.getElementById("negocio-nombre").textContent = p.meta.nombre;
  document.getElementById("negocio-rubro").textContent = p.meta.rubro;
  document.getElementById("negocio-corte").textContent = p.meta.corte ? "corte " + fmtFecha(p.meta.corte) : "";
  document.getElementById("negocio-fuente").textContent = p.meta.fuente || "";
  document.getElementById("sello").textContent = p.meta.demo ? "datos de ejemplo" : (p.meta.fuente || "");

  document.getElementById("menu").innerHTML = this.menu(p).map(([r, t]) =>
    t === null ? `<div class="grupo">${esc(r)}</div>`
      : `<a href="javascript:App.ir('${r}')" class="${this.ruta === r || this.ruta.startsWith(r + "/") ? "activo" : ""}">${esc(t)}</a>`).join("");

  const [base, arg] = this.ruta.split("/");
  const titulos = {
    tablero: "Tablero", unidades: v.unidades, unidad: v.unidad, cobranzas: "Cobranzas",
    tesoreria: "Cuentas a pagar", stock: "Stock", clientes: v.clientes, resultado: "Resultado",
    crm: "Embudo comercial", crmleads: v.leads,
  };
  document.getElementById("titulo-vista").textContent = titulos[base] || base;
  document.getElementById("miga").textContent = arg ? decodeURIComponent(arg) : "";

  // .call(Vistas, ...) y no fn(...): las vistas se apoyan entre ellas con `this`
  // (columnas compartidas), y llamarlas sueltas lo pierde y rompe la tabla entera.
  const fn = Vistas[base];
  document.getElementById("vista").innerHTML = fn
    ? fn.call(Vistas, pq, arg ? decodeURIComponent(arg) : null)
    : `<div class="vacio">Vista no disponible.</div>`;
};

/* -------------------------------------------------- carga de paquetes */
App.agregar = function (pq, usar) {
  if (!pq || !pq.perfil || !pq.datos) throw new Error("El archivo no tiene la forma { perfil, datos }.");
  const id = pq.perfil.meta.id;
  this.paquetes[id] = pq;
  if (usar) this.usar(id);
  return id;
};

App.cargarArchivo = function (file) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const id = this.agregar(JSON.parse(lector.result), true);
      document.getElementById("capa").innerHTML = "";
    } catch (e) {
      alert("No se pudo leer el paquete: " + e.message);
    }
  };
  lector.readAsText(file);
};

App.iniciar = async function () {
  const lista = ["muestra-constructora", "muestra-restaurante"];
  for (const n of lista) {
    try {
      const r = await fetch("datos/" + n + ".json");
      if (r.ok) this.agregar(await r.json(), false);
    } catch (e) { /* si falta un paquete de muestra, el sistema igual abre */ }
  }
  const ids = Object.keys(this.paquetes);
  if (!ids.length) {
    document.getElementById("vista").innerHTML = `<div class="vacio">No se pudo cargar ningún negocio de muestra. Usá “Cargar un negocio” para abrir un paquete propio.</div>`;
    return;
  }
  const q = new URLSearchParams(location.search);
  const v = q.get("v");
  if (v && ["crm", "crmleads"].includes(v.split("/")[0])) this.app = "crm";
  this.usar(q.get("n") && this.paquetes[q.get("n")] ? q.get("n") : ids[0]);
  if (v && Vistas[v.split("/")[0]]) this.ir(v);
};

/* ------------------------------------------------------------- eventos */
document.getElementById("btn-perfil").onclick = () => App.verPerfil();
document.getElementById("btn-cargar").onclick = () => document.getElementById("archivo").click();
document.getElementById("archivo").onchange = e => { if (e.target.files[0]) App.cargarArchivo(e.target.files[0]); };

const zona = document.getElementById("soltar");
let arrastre = 0;
window.addEventListener("dragenter", e => { e.preventDefault(); if (++arrastre === 1) zona.hidden = false; });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("dragleave", () => { if (--arrastre <= 0) { arrastre = 0; zona.hidden = true; } });
window.addEventListener("drop", e => {
  e.preventDefault(); arrastre = 0; zona.hidden = true;
  const f = e.dataTransfer.files[0];
  if (f) App.cargarArchivo(f);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") App.cerrar(); });

App.iniciar();
