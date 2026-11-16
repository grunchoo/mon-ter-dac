/* Custom widget SAC — kpis de cheques. Ver KPIS_CHEQUES.md */
(function () {
  // ---- utilidades comunes (copiadas en cada widget; SAC carga un archivo por widget) ----
  function aFecha(v) {
    if (v == null) return null;
    const s = String(v);
    let m = s.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/(\d{2})[./](\d{2})[./](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dias = (a, b) => Math.round((a - b) / 86400000);
  const abrev = n => {
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (a >= 1e9) return s + (a / 1e9).toFixed(1) + " B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + " M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(0) + " K";
    return s + a.toFixed(0);
  };
  const txt = cell => cell ? String(cell.label != null && cell.label !== "" ? cell.label : cell.id) : "";
  // Devuelve { estado, filas: [{dims:[cell...], meas:[num...]}] } o null
  function leerBinding(db) {
    if (!db) return null;
    if (db.state && db.state !== "success") return { estado: db.state, filas: [] };
    if (!db.data) return null;
    const f = (db.metadata && db.metadata.feeds) || {};
    const dk = (f.dimensions && f.dimensions.values) || [];
    const mk = (f.measures && f.measures.values) || [];
    const filas = db.data.map(r => ({
      dims: (dk.length ? dk : Object.keys(r).filter(k => k.startsWith("dimensions_"))).map(k => r[k]),
      meas: (mk.length ? mk : Object.keys(r).filter(k => k.startsWith("measures_"))).map(k => Math.abs(Number(r[k] && r[k].raw) || 0)),
    }));
    return { estado: "success", filas, muestra: JSON.stringify(db.data[0] || {}).slice(0, 300) };
  }
  const CSS_BASE = `
    :host{display:block;width:100%;height:100%;font-family:"72",Arial,sans-serif;color:#1d2d3e}
    .wrap{height:100%;overflow:auto;padding:10px 12px;box-sizing:border-box}
    h3{margin:0 0 10px;font-size:14px;font-weight:600}
    .vacio{color:#6a7b8c;font-size:12px;padding:8px 0}
    .ver{position:absolute;right:6px;bottom:2px;font-size:9px;opacity:.4}`;
  const VERSION = "kpis v1.1.0";
  class KpisCheques extends HTMLElement {
    constructor() {
      super();
      this._s = this.attachShadow({ mode: "open" });
      this._p = { titulo: "Pagos con cheques", diasProximos: 7 };
    }
    onCustomWidgetBeforeUpdate(c) {
      if (c && c.myDataBinding) this.myDataBinding = c.myDataBinding;
      const { myDataBinding, ...r } = c || {}; this._p = { ...this._p, ...r };
    }
    onCustomWidgetAfterUpdate() { this._render(); }
    onCustomWidgetResize() { this._render(); }
    connectedCallback() { this._render(); }

    _calcular(filas) {
      // dims: [0] fecha vencimiento (día), [1] estado; opcionales en cualquier orden:
      //       fecha de compensación (se reconoce por ser fecha) y tipo_cheque (ECHEQ / FISICO)
      const h = hoy0(), prox = Number(this._p.diasProximos) || 7;
      const k = { cartera: 0, vencido: 0, proximos: 0, d30: 0, pondDias: 0, pondBase: 0,
                  pagMes: 0, pagMesAnt: 0, hayComp: false, cartQty: 0, sinFecha: 0,
                  hayTipo: false, echeqCart: 0, echeqPagMes: 0, echeqVencido: 0 };
      const mes = h.getFullYear() * 12 + h.getMonth();
      for (const f of filas) {
        const imp = f.meas[0] || 0, qty = f.meas[1];
        const fv = aFecha(f.dims[0] && f.dims[0].id) || aFecha(txt(f.dims[0]));
        const est = (txt(f.dims[1]) + " " + (f.dims[1] ? f.dims[1].id : "")).toUpperCase();
        const abierta = f.dims[1] ? est.includes("ABIERTA") : true;
        let fcCell = null, esEcheq = null;
        for (const c of f.dims.slice(2)) {
          const t = (txt(c) + " " + (c ? c.id : "")).toUpperCase();
          if (/ECHEQ|FISICO|FÍSICO/.test(t)) { esEcheq = t.includes("ECHEQ"); k.hayTipo = true; }
          else fcCell = c;
        }
        if (abierta && esEcheq) { k.echeqCart += imp; }
        if (abierta) {
          k.cartera += imp; if (qty != null) k.cartQty += qty;
          if (!fv) { k.sinFecha++; continue; }
          const d = dias(fv, h);
          if (d < 0) { k.vencido += imp; if (esEcheq) k.echeqVencido += imp; }
          else {
            if (d <= prox) k.proximos += imp;
            if (d <= 30) k.d30 += imp;
            k.pondDias += imp * d; k.pondBase += imp;
          }
        } else if (est.includes("COMPENSADA") && fcCell) {
          k.hayComp = true;
          const fc = aFecha(fcCell.id) || aFecha(txt(fcCell));
          if (!fc) continue;
          const m = fc.getFullYear() * 12 + fc.getMonth();
          if (m === mes) { k.pagMes += imp; if (esEcheq) k.echeqPagMes += imp; }
          else if (m === mes - 1) k.pagMesAnt += imp;
        }
      }
      return k;
    }

    _render() {
      const datos = leerBinding(this.myDataBinding);
      let html = `<style>${CSS_BASE}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
        .t{border:1px solid #e5e9ee;border-radius:8px;padding:10px 12px;background:#fff;position:relative}
        .t .l{font-size:11px;color:#556b82;margin-bottom:4px}
        .t .v{font-size:22px;font-weight:700;line-height:1.1}
        .t .s{font-size:11px;color:#6a7b8c;margin-top:4px}
        .t.rojo .v{color:#bb0000} .t.ambar .v{color:#c25d00} .t.verde .v{color:#256f3a}
        .bar{height:4px;border-radius:2px;background:#eef1f4;margin-top:6px;overflow:hidden}
        .bar i{display:block;height:100%}
      </style><div class="wrap"><h3>${this._p.titulo || ""}</h3>`;
      if (!datos || datos.estado !== "success") {
        html += `<div class="vacio">${datos && datos.estado === "loading" ? "Cargando datos…" :
          "Asigná: Fecha de vencimiento (día) y Estado como dimensiones, Importe como indicador. Opcional: Fecha de compensación."}</div>`;
      } else {
        const k = this._calcular(datos.filas);
        const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
        const plazo = k.pondBase ? Math.round(k.pondDias / k.pondBase) : null;
        const tile = (cls, l, v, s, barPct, color) => `<div class="t ${cls}"><div class="l">${l}</div><div class="v">${v}</div>
          ${s ? `<div class="s">${s}</div>` : ""}${barPct != null ? `<div class="bar"><i style="width:${Math.min(100, barPct)}%;background:${color}"></i></div>` : ""}</div>`;
        html += `<div class="grid">`;
        html += tile("", "Cartera de cheques", abrev(k.cartera), k.cartQty ? `${k.cartQty.toLocaleString("es-AR")} cheques` : "abiertos (sin compensar)");
        html += tile(k.vencido ? "rojo" : "verde", "Vencidos sin compensar", abrev(k.vencido), `${pct(k.vencido, k.cartera)}% de la cartera`, pct(k.vencido, k.cartera), "#bb0000");
        html += tile(k.proximos ? "ambar" : "", `Vencen en ${this._p.diasProximos || 7} días`, abrev(k.proximos), `${pct(k.proximos, k.cartera)}% de la cartera`, pct(k.proximos, k.cartera), "#c25d00");
        html += tile("", "Vencen en 30 días", abrev(k.d30), `${pct(k.d30, k.cartera)}% de la cartera`, pct(k.d30, k.cartera), "#0a6ed1");
        html += tile("", "Plazo promedio a vencer", plazo == null ? "–" : `${plazo} días`, "ponderado por importe");
        if (k.hayComp) {
          const delta = k.pagMesAnt ? Math.round(100 * (k.pagMes - k.pagMesAnt) / k.pagMesAnt) : null;
          html += tile("", "Pagado este mes", abrev(k.pagMes),
            delta == null ? "sin datos del mes anterior" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs mes anterior (${abrev(k.pagMesAnt)})`);
        }
        if (k.hayTipo) {
          html += tile("", "Cartera en echeq", abrev(k.echeqCart),
            `${pct(k.echeqCart, k.cartera)}% de la cartera · físico ${abrev(k.cartera - k.echeqCart)}`, pct(k.echeqCart, k.cartera), "#6c32a8");
          if (k.hayComp) html += tile("", "Pagado este mes con echeq", abrev(k.echeqPagMes), `${pct(k.echeqPagMes, k.pagMes)}% de lo pagado en el mes`, pct(k.echeqPagMes, k.pagMes), "#6c32a8");
        }
        html += `</div>`;
        if (k.sinFecha && !k.pondBase && !k.vencido) html += `<div class="vacio">No reconozco la fecha. Ejemplo: ${datos.muestra}</div>`;
      }
      html += `<div class="ver">${VERSION}</div></div>`;
      this._s.innerHTML = html;
    }
  }
  customElements.define("com-grupomotta-kpischeques", KpisCheques);
})();
