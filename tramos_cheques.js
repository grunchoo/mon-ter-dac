/* Custom widget SAC — tramos de cheques. Ver LEEME.md */
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
  const VERSION = "tramos v1.0.0";
  const TRAMOS = [
    { n: "Vencido > 30 días", c: "#8c0000", t: d => d < -30 },
    { n: "Vencido 1-30 días", c: "#d32f2f", t: d => d < 0 },
    { n: "Vence 0-7 días", c: "#e07b00", t: d => d <= 7 },
    { n: "Vence 8-30 días", c: "#0a6ed1", t: d => d <= 30 },
    { n: "Vence 31-60 días", c: "#5b9bd5", t: d => d <= 60 },
    { n: "Vence > 60 días", c: "#9fb8d1", t: () => true },
  ];
  class TramosCheques extends HTMLElement {
    constructor() { super(); this._s = this.attachShadow({ mode: "open" }); this._p = { titulo: "Cartera por vencimiento" }; }
    onCustomWidgetBeforeUpdate(c) { if (c && c.myDataBinding) this.myDataBinding = c.myDataBinding; const { myDataBinding, ...r } = c || {}; this._p = { ...this._p, ...r }; }
    onCustomWidgetAfterUpdate() { this._render(); }
    onCustomWidgetResize() { this._render(); }
    connectedCallback() { this._render(); }
    _render() {
      const datos = leerBinding(this.myDataBinding);
      let html = `<style>${CSS_BASE}
        .fila{display:grid;grid-template-columns:130px 1fr 70px 44px;align-items:center;gap:8px;margin:6px 0;font-size:12px;cursor:pointer}
        .fila:hover .b{filter:brightness(1.1)} .b{height:18px;border-radius:3px;min-width:2px}
        .num{text-align:right;font-weight:600} .pct{text-align:right;color:#6a7b8c}
        .tot{margin-top:10px;font-size:12px;color:#556b82;border-top:1px solid #e5e9ee;padding-top:6px}
      </style><div class="wrap"><h3>${this._p.titulo || ""}</h3>`;
      if (!datos || datos.estado !== "success") {
        html += `<div class="vacio">${datos && datos.estado === "loading" ? "Cargando datos…" : "Asigná: Fecha de vencimiento (día) como dimensión e Importe como indicador. Filtrá estado = ABIERTA."}</div>`;
      } else {
        const h = hoy0(), suma = TRAMOS.map(() => 0); let sinF = 0;
        for (const f of datos.filas) {
          const fv = aFecha(f.dims[0] && f.dims[0].id) || aFecha(txt(f.dims[0]));
          if (!fv) { sinF++; continue; }
          const d = dias(fv, h);
          suma[TRAMOS.findIndex(t => t.t(d))] += f.meas[0] || 0;
        }
        const tot = suma.reduce((a, b) => a + b, 0), max = Math.max(...suma, 1);
        TRAMOS.forEach((t, i) => {
          html += `<div class="fila" data-i="${i}"><span>${t.n}</span>
            <div><div class="b" style="width:${100 * suma[i] / max}%;background:${t.c}"></div></div>
            <span class="num">${abrev(suma[i])}</span><span class="pct">${tot ? Math.round(100 * suma[i] / tot) : 0}%</span></div>`;
        });
        html += `<div class="tot">Total cartera: <b>${abrev(tot)}</b>${sinF ? ` · ${sinF} filas sin fecha reconocible (ej. ${datos.muestra})` : ""}</div>`;
      }
      html += `<div class="ver">${VERSION}</div></div>`;
      this._s.innerHTML = html;
      this._s.querySelectorAll(".fila").forEach(el => el.addEventListener("click", () => {
        this.tramoSeleccionado = TRAMOS[+el.dataset.i].n;
        this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: { tramoSeleccionado: this.tramoSeleccionado } } }));
        this.dispatchEvent(new Event("onSelect"));
      }));
    }
  }
  customElements.define("com-grupomotta-tramoscheques", TramosCheques);
})();
