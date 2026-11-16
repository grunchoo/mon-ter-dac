/* Custom widget SAC — ranking de cheques. Ver KPIS_CHEQUES.md */
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
  const VERSION = "ranking v1.1.0";
  const PALETA = ["#6c32a8", "#0a6ed1", "#e07b00", "#2b7d2b", "#8396a8", "#c0399f"];
  class RankingCheques extends HTMLElement {
    constructor() { super(); this._s = this.attachShadow({ mode: "open" }); this._p = { titulo: "Top proveedores", topN: 10, color: "#0a6ed1" }; }
    onCustomWidgetBeforeUpdate(c) { if (c && c.myDataBinding) this.myDataBinding = c.myDataBinding; const { myDataBinding, ...r } = c || {}; this._p = { ...this._p, ...r }; }
    onCustomWidgetAfterUpdate() { this._render(); }
    onCustomWidgetResize() { this._render(); }
    connectedCallback() { this._render(); }
    _render() {
      const datos = leerBinding(this.myDataBinding);
      let html = `<style>${CSS_BASE}
        .fila{display:grid;grid-template-columns:22px minmax(90px,38%) 1fr 64px;align-items:center;gap:8px;margin:5px 0;font-size:12px;cursor:pointer}
        .pos{color:#8396a8;text-align:right} .nom{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .b{height:14px;min-width:2px} .b:first-child{border-radius:3px 0 0 3px} .b:last-child{border-radius:0 3px 3px 0} .num{text-align:right;font-weight:600}
        .conc{margin:0 0 10px;font-size:12px;color:#556b82} .conc b{color:#1d2d3e}
      </style><div class="wrap"><h3>${this._p.titulo || ""}</h3>`;
      if (!datos || datos.estado !== "success") {
        html += `<div class="vacio">${datos && datos.estado === "loading" ? "Cargando datos…" : "Asigná una dimensión (proveedor, banco…) y un indicador (importe)."}</div>`;
      } else {
        // 2ª dimensión opcional (p. ej. tipo_cheque): barras apiladas por ese valor
        const acc = new Map(), partes = new Map(), series = [];
        for (const f of datos.filas) {
          const n = txt(f.dims[0]) || "(sin dato)", v = f.meas[0] || 0;
          acc.set(n, (acc.get(n) || 0) + v);
          if (f.dims[1]) {
            const s2 = txt(f.dims[1]) || "(sin dato)";
            if (!series.includes(s2)) series.push(s2);
            const p = partes.get(n) || {}; p[s2] = (p[s2] || 0) + v; partes.set(n, p);
          }
        }
        series.sort((a, b) => (b.toUpperCase().includes("ECHEQ") ? 1 : 0) - (a.toUpperCase().includes("ECHEQ") ? 1 : 0));
        const col = s2 => PALETA[series.indexOf(s2) % PALETA.length];
        const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]);
        const tot = arr.reduce((a, [, v]) => a + v, 0), N = Math.max(1, Number(this._p.topN) || 10);
        const top = arr.slice(0, N), topSum = top.reduce((a, [, v]) => a + v, 0), max = top.length ? top[0][1] : 1;
        if (series.length) {
          const totS = {}; for (const p of partes.values()) for (const k2 in p) totS[k2] = (totS[k2] || 0) + p[k2];
          html += `<div class="conc">${series.map(s2 => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${col(s2)};margin:0 4px 0 10px"></span>${s2}: <b>${abrev(totS[s2] || 0)}</b> (${tot ? Math.round(100 * (totS[s2] || 0) / tot) : 0}%)`).join("")}</div>`;
        }
        html += `<div class="conc">Los primeros ${top.length} concentran <b>${tot ? Math.round(100 * topSum / tot) : 0}%</b> de ${abrev(tot)} (${arr.length} en total)</div>`;
        top.forEach(([n, v], i) => {
          html += `<div class="fila" data-n="${n.replace(/"/g, "&quot;")}"><span class="pos">${i + 1}</span><span class="nom" title="${n.replace(/"/g, "&quot;")}">${n}</span>
            <div style="display:flex;width:${100 * v / max}%">${series.length
              ? series.map(s2 => { const pv = (partes.get(n) || {})[s2] || 0; return pv ? `<div class="b" title="${s2}: ${abrev(pv)}" style="flex:${pv};background:${col(s2)}"></div>` : ""; }).join("")
              : `<div class="b" style="flex:1;background:${this._p.color || "#0a6ed1"}"></div>`}</div><span class="num">${abrev(v)}</span></div>`;
        });
      }
      html += `<div class="ver">${VERSION}</div></div>`;
      this._s.innerHTML = html;
      this._s.querySelectorAll(".fila").forEach(el => el.addEventListener("click", () => {
        this.seleccion = el.dataset.n;
        this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: { seleccion: this.seleccion } } }));
        this.dispatchEvent(new Event("onSelect"));
      }));
    }
  }
  customElements.define("com-grupomotta-rankingcheques", RankingCheques);
})();
