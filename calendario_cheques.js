/*
 * Custom widget de SAC: Calendario de cheques.
 * Muestra un mapa de calor por día (lunes a domingo) con el importe que vence cada día
 * y el total de cada semana. Data binding: 1 dimensión (fecha) + 1 medida (importe).
 */
(function () {
  const plantilla = document.createElement("template");
  plantilla.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; font-family: "72", Arial, sans-serif; font-size:12px; color:#1d2d3e; }
      .wrap { height:100%; overflow:auto; padding:8px; box-sizing:border-box; }
      h3 { margin:0 0 8px; font-size:14px; font-weight:600; }
      .vacio { color:#6a7b8c; padding:16px 0; }
      table { border-collapse:separate; border-spacing:3px; width:100%; table-layout:fixed; }
      th { font-weight:600; color:#556b82; font-size:11px; text-align:center; }
      th.sem, td.sem { width:90px; text-align:left; white-space:nowrap; }
      th.tot, td.tot { width:90px; text-align:right; white-space:nowrap; }
      td.dia { height:34px; border-radius:4px; text-align:center; vertical-align:middle; cursor:pointer;
               position:relative; border:1px solid transparent; }
      td.dia .n { font-size:10px; opacity:.75; display:block; }
      td.dia .v { font-size:11px; font-weight:600; display:block; }
      td.hoy { border-color:#0a6ed1; }
      td.sel { outline:2px solid #0a6ed1; }
      td.pasado .n { text-decoration: line-through; }
      .ley { display:flex; align-items:center; gap:6px; margin-top:8px; color:#556b82; font-size:11px; }
      .ley span.b { width:60px; height:8px; border-radius:4px; display:inline-block; }
    </style>
    <div class="wrap">
      <h3 id="titulo"></h3>
      <div id="cuerpo"></div>
      <div class="ley" id="ley"></div>
    </div>`;

  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function aFecha(v) {
    if (v == null) return null;
    let s = String(v).trim();
    // Quitar prefijos de miembro tipo "[Dim].[2025-04-26]" o "&[20250426]"
    const m = s.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const m2 = s.match(/(\d{2})[./](\d{2})[./](\d{4})/); // DD.MM.AAAA
    if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    return null;
  }
  const clave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lunes = d => { const x = new Date(d); const dw = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dw); x.setHours(0, 0, 0, 0); return x; };
  const abrev = n => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1) + " B";
    if (a >= 1e6) return (n / 1e6).toFixed(1) + " M";
    if (a >= 1e3) return (n / 1e3).toFixed(0) + " K";
    return n.toFixed(0);
  };
  function mezclar(hex, t) { // de blanco al color, t en [0,1]
    const c = parseInt(hex.slice(1), 16);
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const f = x => Math.round(255 + (x - 255) * t);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  class CalendarioCheques extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(plantilla.content.cloneNode(true));
      this._props = { semanas: 12, semanasAtras: 2, colorAlto: "#c2410c", titulo: "Vencimientos de cheques" };
      this.diaSeleccionado = "";
    }

    // --- Ciclo de vida de SAC ---
    onCustomWidgetBeforeUpdate(changedProperties) {
      this._props = { ...this._props, ...changedProperties };
    }
    onCustomWidgetAfterUpdate(changedProperties) {
      this._render();
    }
    onCustomWidgetResize() { this._render(); }
    onCustomWidgetDestroy() {}
    connectedCallback() { this._render(); }

    // Propiedades accesibles desde script (setSemanas / getDiaSeleccionado)
    set semanas(v) { this._props.semanas = Number(v) || 12; this._render(); }
    get semanas() { return this._props.semanas; }

    // --- Datos ---
    _leerDatos() {
      const db = this.myDataBinding;
      if (!db || db.state !== "success" || !db.data) return null;
      const feeds = (db.metadata && db.metadata.feeds) || {};
      const dimKey = (feeds.dimensions && feeds.dimensions.values && feeds.dimensions.values[0]) || "dimensions_0";
      const meaKey = (feeds.measures && feeds.measures.values && feeds.measures.values[0]) || "measures_0";
      const porDia = new Map();
      for (const fila of db.data) {
        const dim = fila[dimKey];
        const mea = fila[meaKey];
        if (!dim || !mea) continue;
        const f = aFecha(dim.id) || aFecha(dim.label);
        if (!f) continue;
        const k = clave(f);
        porDia.set(k, (porDia.get(k) || 0) + (Number(mea.raw) || 0));
      }
      return porDia;
    }

    // --- Dibujo ---
    _render() {
      const $ = id => this._shadow.getElementById(id);
      $("titulo").textContent = this._props.titulo || "";
      const porDia = this._leerDatos();
      if (!porDia) {
        $("cuerpo").innerHTML = `<div class="vacio">Asigná en el panel de datos: Fecha de vencimiento (dimensión) e Importe (medida).</div>`;
        $("ley").innerHTML = "";
        return;
      }
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const inicio = lunes(hoy); inicio.setDate(inicio.getDate() - 7 * (this._props.semanasAtras || 0));
      const nSem = (this._props.semanas || 12) + (this._props.semanasAtras || 0);

      let max = 0;
      for (const v of porDia.values()) max = Math.max(max, Math.abs(v));

      let html = `<table><thead><tr><th class="sem">Semana</th>${DIAS.map(d => `<th>${d}</th>`).join("")}<th class="tot">Total</th></tr></thead><tbody>`;
      for (let s = 0; s < nSem; s++) {
        const ini = new Date(inicio); ini.setDate(inicio.getDate() + 7 * s);
        let tot = 0, celdas = "";
        for (let d = 0; d < 7; d++) {
          const dia = new Date(ini); dia.setDate(ini.getDate() + d);
          const k = clave(dia);
          const v = porDia.get(k) || 0;
          tot += v;
          const t = max ? Math.abs(v) / max : 0;
          const fondo = v ? mezclar(this._props.colorAlto || "#c2410c", 0.15 + 0.85 * t) : "#f5f6f7";
          const texto = t > 0.55 ? "#fff" : "#1d2d3e";
          const cls = ["dia", k === clave(hoy) ? "hoy" : "", dia < hoy ? "pasado" : "", k === this.diaSeleccionado ? "sel" : ""].join(" ");
          celdas += `<td class="${cls}" data-k="${k}" style="background:${fondo};color:${texto}" title="${dia.toLocaleDateString("es-AR")}: ${v.toLocaleString("es-AR")}">
                       <span class="n">${dia.getDate()}/${dia.getMonth() + 1}</span><span class="v">${v ? abrev(v) : ""}</span></td>`;
        }
        html += `<tr><td class="sem">${ini.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</td>${celdas}<td class="tot">${tot ? abrev(tot) : "–"}</td></tr>`;
      }
      html += "</tbody></table>";
      $("cuerpo").innerHTML = html;
      $("ley").innerHTML = `<span>0</span><span class="b" style="background:linear-gradient(90deg, ${mezclar(this._props.colorAlto, .15)}, ${this._props.colorAlto})"></span><span>${abrev(max)}</span><span style="margin-left:12px">Borde azul = hoy</span>`;

      $("cuerpo").querySelectorAll("td.dia").forEach(td => td.addEventListener("click", () => {
        this.diaSeleccionado = td.dataset.k;
        this._render();
        // Avisar a SAC del cambio para que getDiaSeleccionado() lo devuelva en los scripts
        this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: { diaSeleccionado: td.dataset.k } } }));
        this.dispatchEvent(new Event("onSelect"));
      }));
    }
  }

  customElements.define("com-grupomotta-calendariocheques", CalendarioCheques);
})();
