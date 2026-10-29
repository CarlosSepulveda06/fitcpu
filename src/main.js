import "./style.css";
import { CATALOG } from "./catalog.js";
import { searchProducts, productByBarcode } from "./off.js";
import * as store from "./store.js";

/* ============ Constantes ============ */
const MEALS = [["desayuno", "Desayuno"], ["comida", "Comida"], ["cena", "Cena"], ["snack1", "Snack 1"], ["snack2", "Snack 2"]];
const ACT = [[1.2, "Mayormente sentado"], [1.375, "Ligera (1–3 días de ejercicio)"], [1.55, "Moderada (3–5 días)"], [1.725, "Alta (6–7 días)"]];
const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const DOW3 = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const GLASS = 250;

/* ============ Estado de la interfaz ============ */
const U = { sel: todayStr(), weekOf: todayStr(), tab: "plan", session: null, ready: false, slide: 0, authMsg: "", authBusy: false };
const st = () => store.getState();

/* ============ Utilidades ============ */
function pad(n) { return String(n).padStart(2, "0"); }
function dstr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function todayStr() { return dstr(new Date()); }
function parseD(s) { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
function mondayOf(s) { const d = parseD(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dstr(d); }
function weekDays() { const m = mondayOf(U.weekOf); return [...Array(7)].map((_, i) => addDays(m, i)); }
function fmt(n, dec = 0) { return Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: dec }); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function num(v) { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function prettyDate(s) { const d = parseD(s); return d.getDate() + " " + MESES[d.getMonth()]; }
function dayTitle(s) { const t = todayStr(); if (s === t) return "Hoy"; if (s === addDays(t, -1)) return "Ayer"; if (s === addDays(t, 1)) return "Mañana"; return prettyDate(s); }
const $ = (id) => document.getElementById(id);
function toast(msg) { const r = $("toastRoot"); r.innerHTML = '<div class="toast" role="status">' + esc(msg) + "</div>"; clearTimeout(toast.t); toast.t = setTimeout(() => (r.innerHTML = ""), 2600); }
store.setErrorHandler((e) => toast(e && e.code === "42501" ? "Sin permiso para guardar. Vuelve a entrar." : "No se pudo guardar. Revisa tu conexión."));

/* ============ Metas ============ */
function autoTargets(p) {
  if (!p || !p.heightCm || !p.age || !p.weightKg) return null;
  const male = p.sex !== "f";
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (male ? 5 : -161);
  const tdee = bmr * (p.activity || 1.2);
  let rate = p.rate || 0.5;
  if (p.goal === "perder") rate = Math.min(rate, p.weightKg * 0.01);
  const delta = p.goal === "perder" ? -rate * 1100 : p.goal === "ganar" ? rate * 550 : 0;
  const kcal = Math.round(Math.max(male ? 1500 : 1200, tdee + delta));
  const prot = Math.round(1.5 * (p.goal === "perder" && p.goalWeightKg ? p.goalWeightKg : p.weightKg));
  const fat = Math.round((kcal * 0.275) / 9);
  const carbs = Math.max(50, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { kcal, p: prot, c: carbs, f: fat, tdee: Math.round(tdee), rate };
}
function targets() {
  const p = st().profile;
  if (p && p.manual && p.kcal) return { kcal: p.kcal, p: p.p, c: p.c, f: p.f };
  return autoTargets(p) || { kcal: 2000, p: 120, c: 225, f: 62, placeholder: true };
}
// Límites de "otros nutrientes" (derivados de la meta de kcal).
function limits() {
  const T = targets(), female = st().profile?.sex === "f";
  return { su: Math.round((T.kcal * 0.15) / 4), fi: female ? 25 : 38, na: Math.round(T.kcal * 1.15), sf: Math.round((T.kcal * 0.1) / 9) };
}
function waterGoal() {
  const p = st().profile || {};
  if (p.waterMl) return p.waterMl;
  return p.weightKg ? Math.min(4000, Math.max(2000, Math.round((p.weightKg * 30) / GLASS) * GLASS)) : 2500;
}

/* ============ Días ============ */
function getDay(s) { return st().days[s] || { date: s, meals: {}, water: 0, note: "" }; }
function ensureDay(s) { const d = getDay(s); d.meals = d.meals || {}; st().days[s] = d; return d; }
function itemVals(it) {
  const g = it.grams || 0, x = it.per100 || {}, r = (v) => (v == null ? null : (v * g) / 100);
  return { k: (x.k * g) / 100, p: (x.p * g) / 100, c: (x.c * g) / 100, f: (x.f * g) / 100, su: r(x.su), fi: r(x.fi), na: r(x.na), sf: r(x.sf) };
}
function sumItems(list, onlyEaten = true) {
  const t = { k: 0, p: 0, c: 0, f: 0 };
  (list || []).forEach((it) => { if (onlyEaten && it.eaten === false) return; const v = itemVals(it); t.k += v.k; t.p += v.p; t.c += v.c; t.f += v.f; });
  return t;
}
function dayTotals(s) {
  const d = getDay(s), t = { k: 0, p: 0, c: 0, f: 0, n: 0, su: 0, fi: 0, na: 0, sf: 0, miss: 0 };
  MEALS.forEach(([m]) => (d.meals?.[m] || []).forEach((it) => {
    if (it.eaten === false) return;
    const v = itemVals(it); t.k += v.k; t.p += v.p; t.c += v.c; t.f += v.f; t.n++;
    if (v.su == null && v.fi == null && v.na == null && v.sf == null) t.miss++;
    ["su", "fi", "na", "sf"].forEach((k) => { if (v[k] != null) t[k] += v[k]; });
  }));
  return t;
}
function dayAll(s) { const d = getDay(s), t = { k: 0, n: 0 }; MEALS.forEach(([m]) => { t.k += sumItems(d.meals?.[m], false).k; t.n += (d.meals?.[m] || []).length; }); return t; }
function streak() { let s = todayStr(); if (!dayTotals(s).n) s = addDays(s, -1); let n = 0; while (dayTotals(s).n && n < 999) { n++; s = addDays(s, -1); } return n; }

// Score nutricional del día (0–100): kcal en rango 40, proteína 25, fibra 15, azúcar/saturadas/sodio 20.
function dayScore(s) {
  const t = dayTotals(s); if (!t.n) return null;
  const T = targets(), L = limits();
  const r = t.k / T.kcal;
  const kc = r >= 0.9 && r <= 1.1 ? 40 : 40 * Math.max(0, 1 - (r < 0.9 ? 0.9 - r : r - 1.1) / 0.4);
  const pr = 25 * Math.min(1, t.p / T.p);
  const known = t.n - t.miss;
  const fi = known ? 15 * Math.min(1, t.fi / L.fi) : 7.5;
  const lim = (v, max) => (known ? (v <= max ? 20 / 3 : (20 / 3) * Math.max(0, 1 - (v - max) / max)) : 10 / 3);
  return Math.round(kc + pr + fi + lim(t.su, L.su) + lim(t.sf, L.sf) + lim(t.na, L.na));
}

/* ============ Render ============ */
function render() {
  const authed = store.mode === "local" || !!U.session;
  $("auth").hidden = authed;
  $("main").hidden = !authed;
  document.querySelector(".tabbar").hidden = !authed;
  if (!authed) return renderAuth();
  [["plan", "Plan"], ["week", "Week"], ["prog", "Prog"]].forEach(([k, n]) => {
    $("view" + n).hidden = U.tab !== k;
    $("tab" + n).setAttribute("aria-selected", U.tab === k);
  });
  $("banner").innerHTML = store.mode === "local" ? '<div class="banner">Modo local: tus datos se guardan solo en este navegador. Configura Supabase para tener cuenta y respaldo.</div>' : "";
  if (U.tab === "plan") renderPlan(); else if (U.tab === "week") renderWeek(); else renderProg();
}

function renderAuth() {
  $("auth").innerHTML = `
    <div class="auth">
      <div class="brand"><svg width="44" height="52" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1c1 4 6 6.5 6 12.5A6 6 0 0 1 4 13.5C4 10 6 9 6.5 6.5 8 8 8.5 9.5 8.5 11 9.5 8 11 5 10 1Z" fill="var(--accent)"/></svg><h1>FitCpu</h1></div>
      <p class="muted">Cuenta tus calorías y arma tu semana.</p>
      <form id="authForm" class="stack" novalidate>
        <div><label class="lbl" for="a_email">Correo</label><input id="a_email" type="email" autocomplete="email" required></div>
        <div><label class="lbl" for="a_pass">Contraseña</label><input id="a_pass" type="password" autocomplete="current-password" minlength="8" required></div>
        ${U.authMsg ? `<p class="note">${esc(U.authMsg)}</p>` : ""}
        <button class="cta" type="submit" ${U.authBusy ? "disabled" : ""}>Entrar</button>
        <button class="ghost" type="button" id="a_signup" ${U.authBusy ? "disabled" : ""}>Crear cuenta</button>
        <button class="link" type="button" id="a_forgot">Olvidé mi contraseña</button>
      </form>
    </div>`;
}

function renderPlan() {
  $("dayTitle").textContent = dayTitle(U.sel);
  $("streak").textContent = streak();
  const T = targets();
  let h = '<button class="nav" data-wk="-7" aria-label="Semana anterior">‹</button>';
  weekDays().forEach((s, i) => {
    const t = dayTotals(s);
    const cls = ["day", s === U.sel ? "sel" : "", s === todayStr() ? "today" : "", t.n ? "has" : "", t.n && t.k >= T.kcal * 0.9 && t.k <= T.kcal * 1.1 ? "ok" : ""].join(" ");
    h += `<button class="${cls}" data-day="${s}" aria-label="${esc(prettyDate(s))}"><span class="dl">${DOW[i]}</span><span class="dn num">${parseD(s).getDate()}</span><span class="dot"></span></button>`;
  });
  h += '<button class="nav" data-wk="7" aria-label="Semana siguiente">›</button>';
  $("week").innerHTML = h;

  // Resumen: tarjeta 1 (kcal y macros) y tarjeta 2 (otros nutrientes)
  const t = dayTotals(U.sel), lo = Math.round(T.kcal * 0.9), hi = Math.round(T.kcal * 1.1);
  let state, color;
  if (t.k < lo) { state = "Te faltan " + fmt(lo - t.k) + " kcal para entrar al rango"; color = "var(--accent)"; }
  else if (t.k <= hi) { state = "Dentro de tu rango"; color = "var(--good)"; }
  else { state = "Te pasaste " + fmt(t.k - hi) + " kcal del rango"; color = "var(--bad)"; }
  if (!t.n) state = "Sin registros todavía";
  const pend = dayAll(U.sel).k - t.k; if (pend > 0.5) state += " · " + fmt(pend) + " kcal pendientes";
  const mac = (lab, v, goal) => `<div class="mac"><div class="ml">${lab}</div><div class="mv num">${fmt(v)} <span>/ ${fmt(goal)} g</span></div><div class="bar${v > goal * 1.1 ? " over" : ""}"><i style="width:${Math.min(100, goal ? (v / goal) * 100 : 0)}%"></i></div></div>`;
  const L = limits();
  const nut = (icon, lab, v, lim, unit, isMax) => {
    const over = isMax && v > lim, none = t.n - t.miss === 0;
    return `<div class="nut"><span class="ni" aria-hidden="true">${icon}</span><span class="nl">${lab}</span><span class="nv num"><b${over ? ' class="bad"' : ""}>${none ? "—" : fmt(v) + " " + unit}</b><span>${isMax ? "Máx " : "Meta "}${fmt(lim)} ${unit}</span></span></div>`;
  };
  const score = dayScore(U.sel);
  $("summary").innerHTML = `
    <div class="slides" id="slides">
      <div class="slide card">
        <div class="sum-h"><span>kcal consumidas</span><span class="num">Meta ${fmt(T.kcal)}</span></div>
        <div class="sum-k num">${fmt(t.k)} <small>/ ${fmt(T.kcal)}</small></div>
        <div class="arcwrap"><svg viewBox="0 0 320 96" role="img" aria-label="Progreso de calorías del día"><path id="arcTrack" d="M14 74 Q160 14 306 74" fill="none" stroke="var(--card2)" stroke-width="9" stroke-linecap="round"/><path id="arcFill" d="M14 74 Q160 14 306 74" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/><g id="arcTicks"></g></svg></div>
        <div class="state" style="color:${t.n ? color : "var(--muted)"}">${esc(state)}</div>
        <div class="macros">${mac("Proteínas", t.p, T.p)}${mac("Carbs", t.c, T.c)}${mac("Grasas", t.f, T.f)}</div>
        ${T.placeholder ? '<p class="note">Metas de ejemplo. Toca el engrane para calcular las tuyas.</p>' : ""}
      </div>
      <div class="slide card">
        <div class="sum-h"><span style="color:var(--fg);font-weight:700">Otros nutrientes</span><span class="num">Score ${score == null ? "—" : score}</span></div>
        <div class="nuts">
          ${nut("🍬", "Azúcares", t.su, L.su, "g", true)}
          ${nut("🌾", "Fibra", t.fi, L.fi, "g", false)}
          ${nut("🧂", "Sodio", t.na, L.na, "mg", true)}
          ${nut("🧈", "Grasas saturadas", t.sf, L.sf, "g", true)}
        </div>
        ${t.miss ? `<p class="note">${t.miss} ${t.miss === 1 ? "alimento no trae" : "alimentos no traen"} estos datos (catálogo base o captura manual).</p>` : ""}
      </div>
    </div>
    <div class="dots" aria-hidden="true"><i class="${U.slide === 0 ? "on" : ""}"></i><i class="${U.slide === 1 ? "on" : ""}"></i></div>`;
  const sl = $("slides");
  sl.scrollLeft = U.slide * sl.clientWidth;
  sl.onscroll = () => { const n = Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth)); if (n !== U.slide) { U.slide = n; document.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i === n)); } };

  const track = $("arcTrack"), Lt = track.getTotalLength(), max = T.kcal * 2, frac = Math.min(1, t.k / max);
  $("arcFill").setAttribute("stroke-dasharray", frac * 100 + " 100");
  if (frac === 0) $("arcFill").setAttribute("stroke-opacity", "0");
  let ticks = "";
  [[lo, "end", -5], [hi, "start", 5]].forEach(([v, anc, dx]) => {
    const pt = track.getPointAtLength((Lt * v) / max);
    ticks += `<rect x="${pt.x - 2.5}" y="${pt.y - 8}" width="5" height="16" rx="2.5" fill="var(--fg)"/><text class="arc-lab num" x="${pt.x + dx}" y="${pt.y + 28}" text-anchor="${anc}">${fmt(v)}</text>`;
  });
  $("arcTicks").innerHTML = ticks;

  // Comidas
  const d = getDay(U.sel);
  let mh = "";
  MEALS.forEach(([key, label]) => {
    const list = d.meals?.[key] || [], x = sumItems(list);
    mh += `<div class="card"><div class="meal-h"><h2>${label}</h2></div><div class="meal-s num">${flame(12)}<b>${fmt(x.k)} kcal</b> · ${fmt(x.p)} P | ${fmt(x.c)} C | ${fmt(x.f)} G</div>`;
    if (list.length) {
      mh += '<div class="items">';
      list.forEach((it, i) => {
        const v = itemVals(it), off = it.eaten === false;
        mh += `<div class="item${off ? " off" : ""}"><span class="em" aria-hidden="true">${esc(it.emoji || "🍽️")}</span>
          <button class="nm" data-edit="${key}:${i}">${esc(it.name)}${it.brand ? `<span class="sub">${esc(it.brand)}</span>` : ""}</button>
          <button class="qt num" data-edit="${key}:${i}">${esc(it.qtyLabel ? it.qtyLabel + " (" + fmt(it.grams) + " g)" : fmt(it.grams) + " g")}<span>${fmt(v.k)} kcal</span></button>
          <button class="chk${off ? "" : " on"}" data-tog="${key}:${i}" aria-label="${off ? "Marcar como comido" : "Marcar como pendiente"}">${off ? "" : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0b1a0d" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'}</button></div>`;
      });
      mh += "</div>";
    }
    mh += `<button class="addbtn" data-add="${key}" aria-label="Agregar a ${label}">+</button></div>`;
  });

  // Agua y notas
  const wg = waterGoal(), w = d.water || 0;
  mh += `<div class="card"><div class="meal-h"><h2>Agua</h2></div>
    <div class="water num"><span class="wv">💧 <b>${fmt(w / 1000, 2)}</b> <span>/ ${fmt(wg / 1000, 1)} L</span></span><span class="muted">${Math.round(w / GLASS)} de ${Math.round(wg / GLASS)} vasos</span></div>
    <div class="bar" style="height:9px"><i style="width:${Math.min(100, (w / wg) * 100)}%;background:#5aa9e6"></i></div>
    <div class="row2" style="margin-top:14px"><button class="addbtn" id="waterMinus" aria-label="Quitar un vaso" ${w ? "" : "disabled"}>−</button><button class="addbtn" id="waterPlus" aria-label="Agregar un vaso de 250 ml">+</button></div></div>`;
  mh += `<div class="card"><div class="meal-h"><h2>Notas</h2></div><textarea id="dayNote" placeholder="¿Cómo te sentiste hoy? ¿Comiste fuera?" maxlength="4000">${esc(d.note || "")}</textarea></div>`;
  $("meals").innerHTML = mh;
}
const flame = (w) => `<svg width="${w}" height="${w * 1.25}" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1c1 4 6 6.5 6 12.5A6 6 0 0 1 4 13.5C4 10 6 9 6.5 6.5 8 8 8.5 9.5 8.5 11 9.5 8 11 5 10 1Z" fill="currentColor"/></svg>`;

function renderWeek() {
  const T = targets(), days = weekDays(), max = T.kcal * 1.4;
  let h = `<div class="wk-nav"><button data-wk="-7" aria-label="Semana anterior">‹</button><span class="num">${esc(prettyDate(days[0]))} – ${esc(prettyDate(days[6]))}</span><button data-wk="7" aria-label="Semana siguiente">›</button></div><div class="card"><div class="wrows">`;
  days.forEach((s, i) => {
    const e = dayTotals(s), a = dayAll(s);
    h += `<button class="wrow${s === todayStr() ? " today" : ""}" data-goday="${s}"><span class="wd"><span>${DOW3[i]}</span><b class="num">${parseD(s).getDate()}</b></span>
      <span class="wbar"><i class="pl" style="width:${Math.min(100, (a.k / max) * 100)}%"></i><i class="ea" style="width:${Math.min(100, (e.k / max) * 100)}%"></i><span class="tick" style="left:${(T.kcal / max) * 100}%"></span></span>
      <span class="wk num">${a.n ? fmt(a.k) : "—"}<span>${a.n ? (e.k < a.k ? fmt(e.k) + " comido" : "todo comido") : "sin plan"}</span></span></button>`;
  });
  h += `</div><div class="legend"><span><i></i>Comido</span><span><i style="opacity:.3"></i>Planeado</span><span><i style="width:2px;background:var(--fg);opacity:.5"></i>Meta ${fmt(T.kcal)}</span></div></div>
    <div class="stack" style="margin-top:14px;gap:10px">${store.mode === "cloud" ? '<button class="cta" id="genWeek" style="margin-top:0">Armar mi semana con Claude</button>' : ""}<button class="ghost" id="copyDay">Copiar un día a otros días</button></div>
    <p class="note">Lo planeado aparece como pendiente en cada día; palomea lo que vayas comiendo. Claude y la copia solo llenan comidas vacías, nunca tocan lo que ya tienes.</p>`;
  $("weekView").innerHTML = h;
}

function renderProg() {
  const p = st().profile || {}, T = targets();
  const ws = Object.values(st().weights).filter((w) => w && w.kg).sort((a, b) => (a.date < b.date ? -1 : 1));
  const cur = ws.length ? ws[ws.length - 1].kg : p.weightKg, first = ws.length ? ws[0].kg : cur;
  const goal = p.goalWeightKg, rate = (autoTargets(p) || {}).rate || p.rate || 0;
  const goalName = p.goal === "ganar" ? "Ganar masa" : p.goal === "mantener" ? "Mantener peso" : "Pérdida de grasa";
  let prog = 0; if (goal && first && first !== goal) prog = Math.max(0, Math.min(1, (first - cur) / (first - goal)));
  const weeks = goal && cur && rate && p.goal !== "mantener" ? Math.ceil(Math.abs(cur - goal) / rate) : null;
  const diff = cur && first ? cur - first : 0;

  const days = weekDays();
  let sc = '<div class="scores">';
  days.forEach((s, i) => {
    const v = dayScore(s), c = v == null ? "var(--card2)" : v >= 75 ? "var(--good)" : v >= 50 ? "var(--accent)" : "var(--bad)";
    sc += `<div class="sc${s === U.sel ? " sel" : ""}"><span>${DOW[i]}</span><b class="num">${v == null ? "–" : v}</b><i style="background:${c}"></i></div>`;
  });
  sc += "</div>";

  let h = `<div class="sec-t">Score nutricional</div><div class="card">${sc}<p class="note" style="margin-bottom:0">Suma calorías en rango, proteína, fibra y límites de azúcar, saturadas y sodio. 75 o más es un buen día.</p></div>
    <div class="sec-t">Objetivo</div><div class="card"><div class="goal-h">${esc(goalName)}</div>
    <div class="goal-row num"><span>${cur ? fmt(cur, 1) + " kg" : "—"} <span class="muted">(${diff > 0 ? "+" : ""}${fmt(diff, 1)} kg)</span></span><span class="tgt"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/></svg>${goal ? fmt(goal, 1) + " kg" : "—"}</span></div>
    <div class="bar"><i style="width:${prog * 100}%;background:var(--good)"></i></div>
    <div class="kv"><span>Llegarás en</span><b class="num">${weeks != null ? weeks + " semanas" : "—"}</b></div>
    <div class="kv"><span>Ritmo</span><b class="num">${rate ? fmt(rate, 2) + " kg/semana" : "—"}</b></div>
    <button class="cta" id="logWeight">+ Registrar peso</button></div>`;

  const week = days.map((s) => ({ s, t: dayTotals(s) })), logged = week.filter((x) => x.t.n);
  const avg = logged.length ? logged.reduce((a, x) => a + x.t.k, 0) / logged.length : 0;
  h += `<div class="sec-t">Estadísticas</div><div class="grid2">
    <div class="stat"><span class="sl">Calorías</span><span class="sv num">${fmt(avg)} <small>kcal</small></span><span class="sl" style="font-weight:500">Promedio de la semana</span><div class="chart">${kcalChart(week, T.kcal)}</div></div>
    <div class="stat"><span class="sl">Peso</span><span class="sv num">${cur ? fmt(cur, 1) : "—"} <small>kg</small></span><span class="sl" style="font-weight:500">${ws.length ? "Último: " + prettyDate(ws[ws.length - 1].date) : "Sin registros"}</span><div class="chart">${miniWeight(ws)}</div></div></div>
    <div class="card"><div class="meal-h"><h2>Tendencia de peso</h2></div><div class="chart" style="margin-top:12px">${weightChart(ws, goal)}</div></div>`;
  if (ws.length) {
    h += '<div class="card"><div class="meal-h"><h2>Historial</h2></div><div class="hist">';
    ws.slice(-12).reverse().forEach((w) => { h += `<button data-w="${w.date}"><span>${esc(prettyDate(w.date))} ${parseD(w.date).getFullYear()}</span><b class="num">${fmt(w.kg, 1)} kg</b></button>`; });
    h += "</div></div>";
  }
  $("prog").innerHTML = h;
}

function kcalChart(week, target) {
  const W = 140, H = 70, max = Math.max(target * 1.3, ...week.map((x) => x.t.k)) || 1, bw = 10, gap = (W - 7 * bw) / 6;
  let s = `<svg viewBox="0 0 ${W} ${H + 16}" aria-label="Calorías por día de la semana">`;
  const ty = H - (target / max) * H;
  s += `<line x1="0" x2="${W}" y1="${ty}" y2="${ty}" stroke="var(--dim)" stroke-dasharray="3 3"/>`;
  week.forEach((x, i) => {
    const hgt = Math.max(x.t.n ? 4 : 0, (x.t.k / max) * H), X = i * (bw + gap);
    const c = !x.t.n ? "var(--card2)" : x.t.k >= target * 0.9 && x.t.k <= target * 1.1 ? "var(--good)" : x.t.k > target * 1.1 ? "var(--bad)" : "var(--accent)";
    s += `<rect x="${X}" y="${x.t.n ? H - hgt : H - 4}" width="${bw}" height="${x.t.n ? hgt : 4}" rx="4" fill="${c}"/><text class="ax" x="${X + bw / 2}" y="${H + 13}" text-anchor="middle"${x.s === U.sel ? ' style="fill:var(--fg)"' : ""}>${DOW[i]}</text>`;
  });
  return s + "</svg>";
}
function miniWeight(ws) {
  const W = 140, H = 70;
  if (!ws.length) return `<svg viewBox="0 0 ${W} ${H + 16}"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--card2)" stroke-width="2"/></svg>`;
  const pts = ws.slice(-14), ys = pts.map((w) => w.kg), mn = Math.min(...ys) - 1, mx = Math.max(...ys) + 1;
  const xy = pts.map((w, i) => [pts.length === 1 ? W : (i / (pts.length - 1)) * W, H - ((w.kg - mn) / (mx - mn)) * H * 0.8 - H * 0.1]);
  const line = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = xy[xy.length - 1];
  const path = pts.length === 1 ? `M0 ${last[1]} L${W} ${last[1]}` : line;
  return `<svg viewBox="0 0 ${W} ${H + 16}"><defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path d="${path} L${W} ${H} L0 ${H} Z" fill="url(#gw)"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.2"/><circle cx="${last[0] - 3}" cy="${last[1]}" r="4" fill="var(--accent)"/></svg>`;
}
function weightChart(ws, goal) {
  const W = 320, H = 150, PL = 36, PR = 10, PT = 10, PB = 24;
  if (!ws.length) return '<p class="note">Registra tu peso para ver la gráfica.</p>';
  const pts = ws.slice(-60), vals = pts.map((w) => w.kg).concat(goal ? [goal] : []);
  let mn = Math.floor(Math.min(...vals) - 1), mx = Math.ceil(Math.max(...vals) + 1);
  if (mx - mn < 4) { mx += 2; mn -= 2; }
  const t0 = parseD(pts[0].date).getTime(), t1 = parseD(pts[pts.length - 1].date).getTime(), span = Math.max(1, t1 - t0);
  const X = (d) => PL + (pts.length === 1 ? (W - PL - PR) / 2 : ((parseD(d).getTime() - t0) / span) * (W - PL - PR));
  const Y = (v) => PT + ((mx - v) / (mx - mn)) * (H - PT - PB);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso a lo largo del tiempo">`;
  for (let i = 0; i <= 3; i++) { const v = mn + ((mx - mn) * i) / 3, y = Y(v); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--line)"/><text class="ax num" x="${PL - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; }
  if (goal) { const y = Y(goal); s += `<line x1="${PL}" x2="${W - PR}" y1="${y}" y2="${y}" stroke="var(--good)" stroke-dasharray="4 4"/><text class="ax" x="${W - PR}" y="${y - 5}" text-anchor="end" style="fill:var(--good)">Meta</text>`; }
  const line = pts.map((w, i) => (i ? "L" : "M") + X(w.date).toFixed(1) + " " + Y(w.kg).toFixed(1)).join(" ");
  if (pts.length > 1) s += `<path d="${line} L${X(pts[pts.length - 1].date)} ${H - PB} L${X(pts[0].date)} ${H - PB} Z" fill="var(--accent)" fill-opacity=".15"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;
  const l = pts[pts.length - 1];
  s += `<circle cx="${X(l.date)}" cy="${Y(l.kg)}" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/><text class="ax" x="${X(pts[0].date)}" y="${H - 6}" text-anchor="${pts.length === 1 ? "middle" : "start"}">${esc(prettyDate(pts[0].date))}</text>`;
  if (pts.length > 1) s += `<text class="ax" x="${X(l.date)}" y="${H - 6}" text-anchor="end">${esc(prettyDate(l.date))}</text>`;
  s += "</svg>";
  if (pts.length === 1) s += '<p class="note">Registra otro peso en los próximos días para ver la tendencia.</p>';
  return s;
}

/* ============ Hojas inferiores ============ */
let SH = null, genCtl = null, offCtl = null, offTimer = null, scanCtl = null;
function openSheet(state) { stopScan(); SH = state; drawSheet(); }
function closeSheet() {
  if (SH && SH.type === "gen" && SH.status === "loading" && genCtl) genCtl.abort();
  clearTimeout(offTimer); offCtl && offCtl.abort();
  stopScan(); SH = null; $("sheetRoot").innerHTML = "";
}
const sheetWrap = (title, body) => `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sh-h"><h3>${esc(title)}</h3><button class="close" data-close aria-label="Cerrar">✕</button></div>${body}</div></div>`;
const allFoods = () => CATALOG.concat(Object.values(st().foods));
const mealLabel = (m) => MEALS.find((x) => x[0] === m)[1];
const foodRow = (f, attr) => `<button ${attr}><span class="em">${esc(f.emoji || "🍽️")}</span><span>${esc(f.name)}${f.src === "ia" ? '<span class="tag">IA</span>' : f.src === "mio" ? '<span class="tag">Mío</span>' : ""}<br><span class="sub">${f.brand ? esc(f.brand) + " · " : ""}1 ${esc(f.unit)} (${fmt(f.g)} g)</span></span><span class="k num">${fmt((f.k * f.g) / 100)} kcal</span></button>`;

function drawSheet() {
  const root = $("sheetRoot");
  if (!SH) { root.innerHTML = ""; return; }
  const keep = document.activeElement && document.activeElement.id;
  let html = "";
  const T = targets();

  if (SH.type === "search") {
    const q = norm(SH.q || "");
    const toks = q.split(/\s+/).filter(Boolean).map((w) => w.slice(0, Math.min(5, w.length)));
    let list = allFoods(); if (q) list = list.filter((f) => { const n = norm(f.name + " " + (f.brand || "")); return toks.every((w) => n.includes(w)); });
    list = list.sort((a, b) => (b.src !== "base") - (a.src !== "base") || (q ? norm(a.name).indexOf(toks[0]) - norm(b.name).indexOf(toks[0]) : 0)).slice(0, q ? 25 : 40);
    let rows = list.map((f) => foodRow(f, `data-pick="${f.id}"`)).join("") || '<p class="note">No está en tu catálogo.</p>';
    let off = "";
    if (SH.off === "loading") off = '<p class="note"><span class="spin"></span>Buscando productos…</p>';
    else if (SH.off === "error") off = '<p class="note">No se pudo consultar Open Food Facts. Intenta en un momento.</p>';
    else if (Array.isArray(SH.off)) off = SH.off.length ? '<div class="res">' + SH.off.map((f, i) => foodRow(f, `data-off="${i}"`)).join("") + "</div>" : '<p class="note">Sin productos con ese nombre.</p>';
    let ai = "";
    if (SH.ai === "loading") ai = '<p class="note"><span class="spin"></span>Buscando con Claude…</p>';
    else if (Array.isArray(SH.ai)) ai = '<div class="lbl">Resultados de Claude (aproximados)</div><div class="res">' + SH.ai.map((f, i) => foodRow(f, `data-ai="${i}"`)).join("") + "</div>";
    else if (SH.ai) ai = `<p class="note">${esc(SH.ai)}</p>`;
    const canAI = store.mode === "cloud" && (SH.q || "").trim().length > 1 && SH.ai !== "loading";
    html = sheetWrap("Agregar a " + mealLabel(SH.meal),
      `<div class="searchrow"><input id="q" type="search" placeholder="Busca un alimento o producto" value="${esc(SH.q || "")}" autocomplete="off" enterkeyhint="search"><button class="iconbtn" id="scanBtn" aria-label="Escanear código de barras"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/></svg></button></div>
       <div class="lbl">Tu catálogo</div><div class="res">${rows}</div>
       ${(SH.q || "").trim().length >= 3 ? '<div class="lbl">Productos (Open Food Facts)</div>' + off : ""}
       ${ai}
       <div class="stack" style="margin-top:14px;gap:10px">${canAI ? `<button class="ghost" id="askAI">Buscar “${esc(SH.q.trim())}” con Claude</button>` : ""}<button class="ghost" id="newFood">Crear alimento a mano</button></div>`);
  } else if (SH.type === "scan") {
    html = sheetWrap("Escanear código",
      `<div class="scanbox"><video id="scanVideo" playsinline muted autoplay></video><span class="scanline"></span></div>
       <p class="note">${esc(SH.msg || "Apunta la cámara al código de barras del empaque.")}</p>
       <div class="searchrow"><input id="barcode" inputmode="numeric" placeholder="O escribe el código" value="${esc(SH.code || "")}"><button class="iconbtn" id="lookupCode" aria-label="Buscar código">→</button></div>`);
  } else if (SH.type === "qty") {
    const f = SH.food, g = SH.mode === "u" ? SH.qty * f.g : SH.qty, k = (f.k * g) / 100;
    html = sheetWrap(SH.edit ? "Editar porción" : "Agregar a " + mealLabel(SH.meal),
      `<div class="foodhead"><span style="font-size:40px">${esc(f.emoji || "🍽️")}</span><div><div style="font-weight:800;font-size:18px">${esc(f.name)}</div>${f.brand ? `<div class="muted" style="font-size:13px">${esc(f.brand)}</div>` : ""}<div class="muted" style="font-size:13px">Por 100 g: ${fmt(f.k)} kcal · ${fmt(f.p, 1)} P · ${fmt(f.c, 1)} C · ${fmt(f.f, 1)} G</div></div></div>
       <div class="seg"><button data-mode="u" aria-pressed="${SH.mode === "u"}">${esc(f.unit)} (${fmt(f.g)} g)</button><button data-mode="g" aria-pressed="${SH.mode === "g"}">gramos</button></div>
       <label class="lbl" for="qty">Cantidad</label><input id="qty" type="text" inputmode="decimal" value="${esc(SH.qtyRaw)}">
       <div class="preview num"><div><b>${fmt(k)}</b><span>kcal</span></div><div><b>${fmt((f.p * g) / 100, 1)}</b><span>Prot</span></div><div><b>${fmt((f.c * g) / 100, 1)}</b><span>Carbs</span></div><div><b>${fmt((f.f * g) / 100, 1)}</b><span>Grasas</span></div></div>
       <button class="cta" id="saveQty" ${g > 0 ? "" : "disabled"}>${SH.edit ? "Guardar" : "Agregar · " + fmt(g) + " g"}</button>
       ${SH.edit ? `<button class="danger" id="rmItem">${SH.confirmRm ? "Toca otra vez para quitarlo" : "Quitar de " + mealLabel(SH.meal)}</button>` : ""}`);
  } else if (SH.type === "newfood") {
    const v = SH.v, inp = (id, ph, val, lab) => `<input id="${id}" inputmode="decimal" placeholder="${ph}" value="${esc(val)}" aria-label="${lab}">`;
    html = sheetWrap("Nuevo alimento",
      `<label class="lbl" for="nf_name">Nombre</label><input id="nf_name" value="${esc(v.name)}" placeholder="Ej. Burrito de machaca">
       <div class="lbl">Por 100 g</div><div class="row4">${inp("nf_k", "kcal", v.k, "kcal por 100 g")}${inp("nf_p", "Prot", v.p, "Proteína")}${inp("nf_c", "Carbs", v.c, "Carbohidratos")}${inp("nf_f", "Grasa", v.f, "Grasa")}</div>
       <div class="lbl">Opcional, por 100 g</div><div class="row4">${inp("nf_su", "Azúcar", v.su, "Azúcares g")}${inp("nf_fi", "Fibra", v.fi, "Fibra g")}${inp("nf_na", "Sodio mg", v.na, "Sodio mg")}${inp("nf_sf", "Saturada", v.sf, "Grasa saturada g")}</div>
       <div class="row2"><div><label class="lbl" for="nf_u">Porción</label><input id="nf_u" value="${esc(v.unit)}" placeholder="pieza"></div><div><label class="lbl" for="nf_g">Gramos por porción</label><input id="nf_g" inputmode="decimal" value="${esc(v.g)}" placeholder="100"></div></div>
       <p class="note">Copia los datos de la etiqueta. Si viene por porción, divide entre los gramos de la porción y multiplica por 100.</p>
       <button class="cta" id="saveNF">Guardar y continuar</button>`);
  } else if (SH.type === "weight") {
    html = sheetWrap("Registrar peso",
      `<div class="row2"><div><label class="lbl" for="w_date">Fecha</label><input id="w_date" type="date" value="${SH.date}" max="${todayStr()}"></div><div><label class="lbl" for="w_kg">Peso (kg)</label><input id="w_kg" inputmode="decimal" value="${esc(SH.kg)}" placeholder="0.0"></div></div>
       <p class="note">Pésate a la misma hora, de preferencia en ayunas. Lo que cuenta es la tendencia, no un día suelto.</p>
       <button class="cta" id="saveW">Guardar</button>${st().weights[SH.date] ? `<button class="danger" id="rmW">${SH.confirmRm ? "Toca otra vez para borrar" : "Borrar este registro"}</button>` : ""}`);
  } else if (SH.type === "settings") {
    const v = SH.v, auto = autoTargets(v);
    const opt = (arr, cur) => arr.map(([val, l]) => `<option value="${val}"${String(cur) === String(val) ? " selected" : ""}>${esc(l)}</option>`).join("");
    html = sheetWrap("Tus datos y metas",
      `<div class="row2"><div><label class="lbl" for="s_sex">Sexo</label><select id="s_sex">${opt([["m", "Hombre"], ["f", "Mujer"]], v.sex)}</select></div><div><label class="lbl" for="s_age">Edad</label><input id="s_age" inputmode="numeric" value="${esc(v.age ?? "")}"></div></div>
       <div class="row2"><div><label class="lbl" for="s_h">Estatura (cm)</label><input id="s_h" inputmode="decimal" value="${esc(v.heightCm ?? "")}" placeholder="175"></div><div><label class="lbl" for="s_w">Peso actual (kg)</label><input id="s_w" inputmode="decimal" value="${esc(v.weightKg ?? "")}"></div></div>
       <label class="lbl" for="s_act">Actividad</label><select id="s_act">${opt(ACT, v.activity)}</select>
       <div class="row2"><div><label class="lbl" for="s_goal">Objetivo</label><select id="s_goal">${opt([["perder", "Perder grasa"], ["mantener", "Mantener"], ["ganar", "Ganar masa"]], v.goal)}</select></div><div><label class="lbl" for="s_gw">Peso meta (kg)</label><input id="s_gw" inputmode="decimal" value="${esc(v.goalWeightKg ?? "")}"></div></div>
       ${v.goal !== "mantener" ? `<label class="lbl" for="s_rate">Ritmo</label><select id="s_rate">${opt([[0.25, "0.25 kg por semana"], [0.5, "0.5 kg por semana"], [0.75, "0.75 kg por semana"], [1, "1 kg por semana"]], v.rate)}</select>` : ""}
       <div class="lbl" style="margin-top:18px">Meta calculada</div>
       ${auto ? `<div class="preview num" style="margin-top:0"><div><b>${fmt(auto.kcal)}</b><span>kcal</span></div><div><b>${auto.p}</b><span>Prot g</span></div><div><b>${auto.c}</b><span>Carbs g</span></div><div><b>${auto.f}</b><span>Grasas g</span></div></div><p class="note">Gasto estimado ${fmt(auto.tdee)} kcal (Mifflin-St Jeor × actividad). Proteína 1.5 g por kg ${v.goal === "perder" ? "de tu peso meta" : "de tu peso"}, grasa 27.5% y el resto en carbohidratos.${v.goal === "perder" && v.rate > auto.rate ? " Ritmo ajustado a " + fmt(auto.rate, 2) + " kg/semana (máx. 1% de tu peso)." : ""}</p>` : '<p class="note">Llena edad, estatura y peso para calcularla.</p>'}
       <div class="check-sw"><span>Usar metas propias (ej. las de tu nutriólogo)</span><button class="sw" id="s_manual" role="switch" aria-checked="${!!v.manual}" aria-label="Usar metas propias"></button></div>
       ${v.manual ? `<div class="row4" style="margin-top:10px"><input id="s_k" inputmode="numeric" value="${esc(v.kcal ?? "")}" aria-label="kcal" placeholder="kcal"><input id="s_p" inputmode="numeric" value="${esc(v.p ?? "")}" aria-label="Proteína g" placeholder="Prot"><input id="s_c" inputmode="numeric" value="${esc(v.c ?? "")}" aria-label="Carbs g" placeholder="Carbs"><input id="s_f" inputmode="numeric" value="${esc(v.f ?? "")}" aria-label="Grasas g" placeholder="Grasa"></div>` : ""}
       <label class="lbl" for="s_water">Meta de agua (ml, vacío = automática)</label><input id="s_water" inputmode="numeric" value="${esc(v.waterMl ?? "")}" placeholder="${waterGoal()}">
       <button class="cta" id="saveS">Guardar</button>
       <div class="lbl" style="margin-top:22px">Tus datos</div>
       <div class="row2"><button class="ghost" id="exportData">Descargar respaldo</button><label class="ghost filebtn" for="importFile">Importar respaldo</label></div>
       <input id="importFile" type="file" accept="application/json,.json" hidden>
       ${store.mode === "cloud" ? '<button class="danger" id="signOut">Cerrar sesión</button>' : ""}`);
  } else if (SH.type === "gen") {
    const busy = SH.status === "loading";
    if (SH.status === "done") {
      let pv = "";
      SH.result.forEach((day) => {
        let tk = 0, tp = 0; Object.values(day.meals).forEach((l) => l.forEach((it) => { const v = itemVals(it); tk += v.k; tp += v.p; }));
        const d = getDay(day.date);
        pv += `<details class="pv-day"><summary><span>${DOW3[(parseD(day.date).getDay() + 6) % 7]} ${parseD(day.date).getDate()}</span><span class="num">${fmt(tk)} kcal · ${fmt(tp)} g prot</span></summary>`;
        MEALS.forEach(([m, l]) => {
          const list = day.meals[m]; if (!list) return;
          pv += `<div class="pv-meal"><b>${l}${(d.meals?.[m] || []).length ? " · ya tiene algo, no se toca" : ""}</b>${list.map((it) => `<div><span>${esc(it.emoji)} ${esc(it.name)}</span><span class="muted num">${fmt(it.grams)} g · ${fmt(itemVals(it).k)} kcal</span></div>`).join("")}</div>`;
        });
        pv += "</details>";
      });
      html = sheetWrap("Tu plan de la semana", `<p class="note" style="margin-top:0">Meta: ${fmt(T.kcal)} kcal y ${T.p} g de proteína al día. Toca un día para ver qué toca.</p>${pv}<button class="cta" id="applyPlan">Agregar al plan</button><button class="ghost" id="regen" style="margin-top:10px">Generar otro</button>`);
    } else {
      const days = weekDays();
      html = sheetWrap("Armar mi semana",
        `<div class="lbl" style="margin-top:0">Días</div><div class="chips">${days.map((s, i) => `<button class="chip" data-gd="${s}" aria-pressed="${SH.days.includes(s)}" ${busy ? "disabled" : ""}>${DOW3[i]} ${parseD(s).getDate()}</button>`).join("")}</div>
         <div class="lbl">Comidas</div><div class="chips">${MEALS.map(([m, l]) => `<button class="chip" data-gm="${m}" aria-pressed="${SH.meals.includes(m)}" ${busy ? "disabled" : ""}>${l}</button>`).join("")}</div>
         <label class="lbl" for="g_prefs">Preferencias</label><textarea id="g_prefs" placeholder="Ej. no me gusta el pescado, desayuno rápido entre semana, los domingos como fuera" ${busy ? "disabled" : ""}>${esc(SH.prefs)}</textarea>
         <p class="note">Claude reparte ${fmt(T.kcal)} kcal al día con tus macros y solo llena comidas vacías. Tarda alrededor de un minuto.</p>
         ${SH.status === "error" ? `<p class="note" style="color:var(--bad)">${esc(SH.err)}</p>` : ""}
         ${busy ? '<button class="cta" disabled><span class="spin dark"></span>Armando tu semana…</button><button class="ghost" id="stopGen" style="margin-top:10px">Detener</button>' : '<button class="cta" id="runGen">Armar plan</button>'}`);
    }
  } else if (SH.type === "copy") {
    const days = weekDays(), src = dayAll(SH.from);
    html = sheetWrap("Copiar un día",
      `<div class="lbl" style="margin-top:0">Copiar desde</div><div class="chips">${days.map((s, i) => `<button class="chip" data-cf="${s}" aria-pressed="${SH.from === s}">${DOW3[i]} ${parseD(s).getDate()}</button>`).join("")}</div>
       <div class="lbl">Hacia</div><div class="chips">${days.map((s, i) => (s === SH.from ? "" : `<button class="chip" data-ct="${s}" aria-pressed="${SH.to.includes(s)}">${DOW3[i]} ${parseD(s).getDate()}</button>`)).join("")}</div>
       <p class="note">${src.n ? `Se copian ${src.n} alimentos (${fmt(src.k)} kcal) como pendientes. Las comidas que ya tengan algo en el día destino no se tocan.` : "Ese día está vacío, elige otro."}</p>
       <button class="cta" id="runCopy" ${src.n && SH.to.length ? "" : "disabled"}>Copiar</button>`);
  } else if (SH.type === "newpass") {
    html = sheetWrap("Nueva contraseña", `<label class="lbl" for="np">Escribe tu nueva contraseña</label><input id="np" type="password" autocomplete="new-password" minlength="8"><button class="cta" id="saveNP">Guardar</button>`);
  }

  root.innerHTML = html;
  if (keep) { const el = $(keep); if (el && el.tagName !== "BUTTON") { el.focus(); try { if (el.type === "text" || el.type === "search") el.setSelectionRange(el.value.length, el.value.length); } catch {} } }
  if (SH.type === "scan" && !scanCtl) startScan();
}

/* ============ Búsquedas ============ */
function scheduleOFF() {
  clearTimeout(offTimer); offCtl && offCtl.abort();
  const q = (SH.q || "").trim();
  if (q.length < 3) { SH.off = null; return; }
  SH.off = "loading";
  const my = SH;
  offTimer = setTimeout(async () => {
    if (SH !== my) return;
    offCtl = new AbortController();
    try { const r = await searchProducts(q, offCtl.signal); if (SH === my && my.q.trim() === q) { my.off = r; drawSheet(); } }
    catch (e) { if (e.name !== "AbortError" && SH === my) { my.off = "error"; drawSheet(); } }
  }, 900);
}
async function askClaude() {
  const my = SH, q = my.q.trim(); if (!q) return;
  my.ai = "loading"; drawSheet();
  try {
    const r = await store.callApi("food-search", { q });
    if (SH !== my) return;
    my.ai = r.foods && r.foods.length ? r.foods : "Claude no encontró nada con ese nombre. Prueba con otras palabras o créalo a mano.";
  } catch (e) { if (SH === my) my.ai = e.message; }
  if (SH === my) drawSheet();
}

/* ============ Escáner ============ */
async function startScan() {
  const my = SH;
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    if (SH !== my) return;
    const reader = new BrowserMultiFormatReader();
    scanCtl = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, $("scanVideo"), (result) => {
      if (result && SH === my) { stopScan(); lookupBarcode(result.getText()); }
    });
  } catch (e) {
    if (SH === my) { my.msg = "No se pudo abrir la cámara. Revisa el permiso o escribe el código."; scanCtl = "failed"; drawSheet(); }
  }
}
function stopScan() { if (scanCtl && scanCtl.stop) { try { scanCtl.stop(); } catch {} } scanCtl = null; }
async function lookupBarcode(code) {
  const my = SH; my.code = code; my.msg = "Buscando " + code + "…"; scanCtl = scanCtl || "busy"; drawSheet();
  try {
    const f = await productByBarcode(code);
    if (SH !== my) return;
    if (f) { const saved = store.saveFood(f); openQty(saved, my.meal); }
    else { my.msg = "Ese código no está en Open Food Facts. Créalo a mano con la etiqueta."; drawSheet(); }
  } catch { if (SH === my) { my.msg = "No se pudo consultar el código. Revisa tu conexión."; drawSheet(); } }
}

/* ============ Plan semanal ============ */
async function generatePlan() {
  const g = SH, T = targets();
  if (!g.days.length || !g.meals.length) { toast("Elige al menos un día y una comida"); return; }
  g.status = "loading"; drawSheet();
  const p = st().profile;
  if (p && (p.planPrefs || "") !== g.prefs) store.saveProfile({ ...p, planPrefs: g.prefs });
  const catalog = allFoods().map((f) => `${f.name}|${f.k},${f.p},${f.c},${f.f}`).join("\n");
  genCtl = new AbortController();
  try {
    const r = await Promise.race([
      store.callApi("plan", { targets: T, days: g.days, meals: g.meals, prefs: g.prefs, catalog }),
      new Promise((_, rej) => genCtl.signal.addEventListener("abort", () => rej(Object.assign(new Error("cancel"), { cancel: true })))),
    ]);
    const byName = {}; allFoods().forEach((f) => (byName[norm(f.name)] = f));
    const out = (r.days || []).map((d) => {
      const meals = {};
      Object.entries(d.meals || {}).forEach(([m, list]) => {
        meals[m] = list.map((x) => {
          const cf = byName[norm(x.name)];
          return { fid: cf ? cf.id : null, name: x.name, emoji: cf ? cf.emoji : x.emoji, per100: cf ? { k: cf.k, p: cf.p, c: cf.c, f: cf.f, su: cf.su ?? null, fi: cf.fi ?? null, na: cf.na ?? null, sf: cf.sf ?? null } : { k: x.k, p: x.p, c: x.c, f: x.f }, unit: cf ? cf.unit : "porción", unitG: cf ? cf.g : x.grams, grams: x.grams, mode: "g", qty: x.grams, qtyLabel: "", eaten: false };
        });
      });
      return { date: d.date, meals };
    }).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (SH !== g) return;
    g.status = "done"; g.result = out;
  } catch (e) {
    if (SH !== g) return;
    if (e.cancel) g.status = null; else { g.status = "error"; g.err = e.message; }
  }
  drawSheet();
}
function applyPlan() {
  let filled = 0, skipped = 0;
  SH.result.forEach((day) => {
    const d = ensureDay(day.date); let changed = false;
    Object.entries(day.meals).forEach(([m, list]) => { if ((d.meals[m] || []).length) { skipped++; return; } d.meals[m] = list; filled++; changed = true; });
    if (changed) store.saveDay(day.date);
  });
  closeSheet(); render(); toast("Plan listo: " + filled + " comidas" + (skipped ? " · " + skipped + " ya tenían algo" : ""));
}

/* ============ Acciones ============ */
function openQty(food, meal, edit) {
  let mode = "u", qty = 1;
  if (edit) { const it = getDay(U.sel).meals[meal][edit.i]; if (it.mode === "u" && it.qty) qty = it.qty; else { mode = "g"; qty = it.grams; } }
  openSheet({ type: "qty", food, meal, mode, qty, qtyRaw: String(qty), edit });
}
function foodFromItem(it) { const x = it.per100 || {}; return { id: it.fid, name: it.name, brand: it.brand, emoji: it.emoji, k: x.k, p: x.p, c: x.c, f: x.f, su: x.su, fi: x.fi, na: x.na, sf: x.sf, unit: it.unit || "porción", g: it.unitG || 100 }; }
function readSettings() {
  const v = { ...SH.v }, g = (id) => $(id);
  if (g("s_sex")) v.sex = g("s_sex").value;
  if (g("s_age")) v.age = num(g("s_age").value) || null;
  if (g("s_h")) v.heightCm = num(g("s_h").value) || null;
  if (g("s_w")) v.weightKg = num(g("s_w").value) || null;
  if (g("s_act")) v.activity = num(g("s_act").value);
  if (g("s_goal")) v.goal = g("s_goal").value;
  if (g("s_gw")) v.goalWeightKg = num(g("s_gw").value) || null;
  if (g("s_rate")) v.rate = num(g("s_rate").value);
  if (g("s_water")) v.waterMl = Math.round(num(g("s_water").value)) || null;
  ["k", "p", "c", "f"].forEach((x) => { const el = g("s_" + x); if (el) v[x === "k" ? "kcal" : x] = Math.round(num(el.value)) || null; });
  return v;
}
function saveWeight(date, kg) {
  store.saveWeight(date, kg);
  const latest = Object.keys(st().weights).sort().pop(), p = st().profile;
  if (p && latest === date && p.weightKg !== kg) store.saveProfile({ ...p, weightKg: kg });
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("button") || e.target;
  const ds = t.dataset || {};
  if (t.id === "tabPlan") { U.tab = "plan"; render(); return; }
  if (t.id === "tabWeek") { U.tab = "week"; render(); return; }
  if (t.id === "tabProg") { U.tab = "prog"; render(); return; }
  if (ds.day) { U.sel = ds.day; render(); return; }
  if (ds.wk) { U.weekOf = addDays(U.weekOf, +ds.wk); U.sel = addDays(U.sel, +ds.wk); render(); return; }
  if (ds.goday) { U.sel = ds.goday; U.tab = "plan"; render(); scrollTo(0, 0); return; }
  if (ds.tog) { const [m, i] = ds.tog.split(":"); const d = ensureDay(U.sel), it = d.meals[m][+i]; it.eaten = it.eaten === false; store.saveDay(U.sel); render(); return; }
  if (ds.add) { openSheet({ type: "search", meal: ds.add, q: "" }); setTimeout(() => $("q")?.focus(), 50); return; }
  if (ds.edit) { const [m, i] = ds.edit.split(":"); openQty(foodFromItem(getDay(U.sel).meals[m][+i]), m, { i: +i }); return; }
  if (t.id === "waterPlus" || t.id === "waterMinus") { const d = ensureDay(U.sel); d.water = Math.max(0, (d.water || 0) + (t.id === "waterPlus" ? GLASS : -GLASS)); store.saveDay(U.sel); render(); return; }
  if (t.id === "settingsBtn") { openSheet({ type: "settings", v: { sex: "m", activity: 1.2, goal: "perder", rate: 0.5, ...(st().profile || {}) } }); return; }
  if (t.id === "logWeight") { const last = Object.values(st().weights).sort((a, b) => (a.date < b.date ? -1 : 1)).pop(); openSheet({ type: "weight", date: todayStr(), kg: st().weights[todayStr()]?.kg ?? last?.kg ?? st().profile?.weightKg ?? "" }); return; }
  if (ds.w) { openSheet({ type: "weight", date: ds.w, kg: st().weights[ds.w].kg }); return; }
  if (t.id === "genWeek") { const t0 = todayStr(); let days = weekDays().filter((s) => s >= t0 && !dayAll(s).n); if (!days.length) days = weekDays().filter((s) => s >= t0); openSheet({ type: "gen", days, meals: ["desayuno", "comida", "cena", "snack1"], prefs: st().profile?.planPrefs || "", status: null }); return; }
  if (t.id === "copyDay") { openSheet({ type: "copy", from: weekDays().includes(U.sel) ? U.sel : weekDays()[0], to: [] }); return; }

  // Autenticación
  if (t.id === "a_signup" || t.id === "a_forgot") {
    const email = $("a_email").value.trim(), pass = $("a_pass").value;
    if (!email) { U.authMsg = "Escribe tu correo."; return renderAuth(); }
    U.authBusy = true; renderAuth(); $("a_email").value = email;
    try {
      if (t.id === "a_forgot") { await store.resetPassword(email); U.authMsg = "Te mandamos un correo para cambiar tu contraseña."; }
      else { if (pass.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres."); const r = await store.signUp(email, pass); U.authMsg = r.session ? "" : "Cuenta creada. Revisa tu correo para confirmarla y luego entra."; }
    } catch (err) { U.authMsg = authError(err); }
    U.authBusy = false; if (!U.session) { renderAuth(); $("a_email").value = email; }
    return;
  }

  if (!SH) return;
  if (t.id === "scrim" || t.hasAttribute?.("data-close")) { closeSheet(); return; }
  if (ds.pick) { const f = allFoods().find((x) => x.id === ds.pick); if (f) openQty(f, SH.meal); return; }
  if (ds.off) { const f = SH.off[+ds.off]; openQty(store.saveFood(f), SH.meal); return; }
  if (ds.ai) { const f = SH.ai[+ds.ai]; openQty(store.saveFood({ ...f, src: "ia" }), SH.meal); return; }
  if (t.id === "askAI") { askClaude(); return; }
  if (t.id === "scanBtn") { openSheet({ type: "scan", meal: SH.meal }); return; }
  if (t.id === "lookupCode") { const c = $("barcode").value.trim(); if (c) { stopScan(); lookupBarcode(c); } return; }
  if (t.id === "newFood") { openSheet({ type: "newfood", meal: SH.meal, v: { name: SH.q || "", k: "", p: "", c: "", f: "", su: "", fi: "", na: "", sf: "", unit: "porción", g: "100" } }); return; }
  if (ds.mode && SH.type === "qty") { const f = SH.food, cur = SH.mode === "u" ? SH.qty * f.g : SH.qty; SH.mode = ds.mode; SH.qty = SH.mode === "u" ? Math.round((cur / f.g) * 4) / 4 || 1 : Math.round(cur); SH.qtyRaw = String(SH.qty); drawSheet(); return; }
  if (t.id === "saveQty") {
    const f = SH.food, g = Math.round((SH.mode === "u" ? SH.qty * f.g : SH.qty) * 10) / 10; if (!(g > 0)) return;
    const item = { fid: f.id || null, name: f.name, brand: f.brand || "", emoji: f.emoji || "🍽️", per100: { k: f.k, p: f.p, c: f.c, f: f.f, su: f.su ?? null, fi: f.fi ?? null, na: f.na ?? null, sf: f.sf ?? null }, unit: f.unit, unitG: f.g, grams: g, mode: SH.mode, qty: SH.qty, qtyLabel: SH.mode === "u" ? fmt(SH.qty, 2) + " " + f.unit : "", eaten: U.sel <= todayStr() };
    const d = ensureDay(U.sel); d.meals[SH.meal] = d.meals[SH.meal] || [];
    if (SH.edit) { item.eaten = d.meals[SH.meal][SH.edit.i].eaten; d.meals[SH.meal][SH.edit.i] = item; } else d.meals[SH.meal].push(item);
    store.saveDay(U.sel); const was = SH.edit; closeSheet(); render(); toast(was ? "Guardado" : "Agregado"); return;
  }
  if (t.id === "rmItem") { if (!SH.confirmRm) { SH.confirmRm = true; drawSheet(); return; } ensureDay(U.sel).meals[SH.meal].splice(SH.edit.i, 1); store.saveDay(U.sel); closeSheet(); render(); toast("Quitado"); return; }
  if (t.id === "saveNF") {
    const g = (id) => $(id).value, opt = (id) => (g(id).trim() === "" ? null : num(g(id)));
    const f = { name: g("nf_name").trim(), emoji: "🍽️", k: num(g("nf_k")), p: num(g("nf_p")), c: num(g("nf_c")), f: num(g("nf_f")), su: opt("nf_su"), fi: opt("nf_fi"), na: opt("nf_na"), sf: opt("nf_sf"), unit: g("nf_u").trim() || "porción", g: num(g("nf_g")) || 100, src: "mio" };
    if (!f.name) { toast("Ponle nombre al alimento"); return; }
    if (!f.k && (f.p || f.c || f.f)) f.k = Math.round(f.p * 4 + f.c * 4 + f.f * 9);
    openQty(store.saveFood(f), SH.meal); return;
  }
  if (t.id === "saveW") { const date = $("w_date").value || todayStr(), kg = Math.round(num($("w_kg").value) * 10) / 10; if (!(kg > 20 && kg < 400)) { toast("Revisa el peso"); return; } saveWeight(date, kg); closeSheet(); render(); toast("Peso guardado"); return; }
  if (t.id === "rmW") { if (!SH.confirmRm) { SH.confirmRm = true; drawSheet(); return; } store.deleteWeight(SH.date); closeSheet(); render(); toast("Registro borrado"); return; }
  if (t.id === "s_manual") { SH.v = readSettings(); SH.v.manual = !SH.v.manual; if (SH.v.manual && !SH.v.kcal) { const a = autoTargets(SH.v) || targets(); Object.assign(SH.v, { kcal: a.kcal, p: a.p, c: a.c, f: a.f }); } drawSheet(); return; }
  if (t.id === "saveS") { const v = readSettings(); if (v.manual && !(v.kcal > 800)) { toast("Revisa tus kcal"); return; } store.saveProfile(v); closeSheet(); render(); toast("Metas guardadas"); return; }
  if (t.id === "exportData") { const blob = new Blob([JSON.stringify(store.exportBackup(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "fitcpu-datos-" + todayStr() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return; }
  if (t.id === "signOut") { await store.signOut(); U.session = null; closeSheet(); render(); return; }
  if (ds.gd) { const s = ds.gd; SH.days = SH.days.includes(s) ? SH.days.filter((x) => x !== s) : [...SH.days, s].sort(); drawSheet(); return; }
  if (ds.gm) { const m = ds.gm; SH.meals = SH.meals.includes(m) ? SH.meals.filter((x) => x !== m) : MEALS.map((x) => x[0]).filter((x) => x === m || SH.meals.includes(x)); drawSheet(); return; }
  if (t.id === "runGen") { generatePlan(); return; }
  if (t.id === "stopGen") { genCtl && genCtl.abort(); return; }
  if (t.id === "regen") { SH.status = null; SH.result = null; drawSheet(); return; }
  if (t.id === "applyPlan") { applyPlan(); return; }
  if (ds.cf) { SH.from = ds.cf; SH.to = SH.to.filter((x) => x !== SH.from); drawSheet(); return; }
  if (ds.ct) { const s = ds.ct; SH.to = SH.to.includes(s) ? SH.to.filter((x) => x !== s) : [...SH.to, s]; drawSheet(); return; }
  if (t.id === "runCopy") {
    const src = getDay(SH.from); let filled = 0, skipped = 0;
    SH.to.forEach((s) => {
      const d = ensureDay(s); let ch = false;
      MEALS.forEach(([m]) => { const list = src.meals?.[m] || []; if (!list.length) return; if ((d.meals[m] || []).length) { skipped++; return; } d.meals[m] = JSON.parse(JSON.stringify(list)).map((it) => ({ ...it, eaten: false })); filled++; ch = true; });
      if (ch) store.saveDay(s);
    });
    closeSheet(); render(); toast("Copiado: " + filled + " comidas" + (skipped ? " · " + skipped + " ya tenían algo" : "")); return;
  }
  if (t.id === "saveNP") { const v = $("np").value; if (v.length < 8) { toast("Mínimo 8 caracteres"); return; } try { await store.updatePassword(v); closeSheet(); toast("Contraseña actualizada"); } catch (err) { toast(authError(err)); } return; }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "authForm") return;
  e.preventDefault();
  const email = $("a_email").value.trim(), pass = $("a_pass").value;
  if (!email || !pass) { U.authMsg = "Escribe tu correo y contraseña."; renderAuth(); $("a_email").value = email; return; }
  U.authBusy = true; U.authMsg = ""; renderAuth(); $("a_email").value = email;
  try { await store.signIn(email, pass); } catch (err) { U.authMsg = authError(err); U.authBusy = false; renderAuth(); $("a_email").value = email; }
});
function authError(err) {
  const m = String(err && err.message || "");
  if (/invalid login/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/not confirmed/i.test(m)) return "Confirma tu correo antes de entrar (revisa tu bandeja).";
  if (/already registered/i.test(m)) return "Ese correo ya tiene cuenta. Entra o recupera tu contraseña.";
  if (/rate limit/i.test(m)) return "Demasiados intentos. Espera unos minutos.";
  return m || "Algo salió mal. Intenta de nuevo.";
}

let noteTimer = null;
document.addEventListener("input", (e) => {
  const id = e.target.id;
  if (id === "dayNote") { const d = ensureDay(U.sel); d.note = e.target.value; clearTimeout(noteTimer); const day = U.sel; noteTimer = setTimeout(() => store.saveDay(day), 800); return; }
  if (!SH) return;
  if (id === "q") { SH.q = e.target.value; SH.ai = null; scheduleOFF(); drawSheet(); return; }
  if (id === "qty") { SH.qtyRaw = e.target.value; SH.qty = num(e.target.value); drawSheet(); return; }
  if (id === "barcode") { SH.code = e.target.value; return; }
  if (id === "g_prefs") { SH.prefs = e.target.value; return; }
  if (SH.type === "settings" && id.startsWith("s_") && e.target.tagName === "INPUT") { SH.v = readSettings(); drawSheet(); return; }
  if (SH.type === "newfood" && id.startsWith("nf_")) { const k = id.slice(3); SH.v[k === "u" ? "unit" : k] = e.target.value; return; }
  if (SH.type === "weight") { if (id === "w_kg") SH.kg = e.target.value; if (id === "w_date") { SH.date = e.target.value; SH.confirmRm = false; if (st().weights[SH.date]) SH.kg = st().weights[SH.date].kg; drawSheet(); } }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "importFile" && e.target.files[0]) {
    try { const n = await store.importBackup(JSON.parse(await e.target.files[0].text())); closeSheet(); render(); toast("Importado: " + n + " registros"); }
    catch { toast("Ese archivo no es un respaldo de FitCpu"); }
    return;
  }
  if (SH && SH.type === "settings" && e.target.tagName === "SELECT") { SH.v = readSettings(); drawSheet(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && SH) closeSheet();
  if (e.key === "Enter" && e.target.id === "q" && SH && SH.q.trim().length > 1 && store.mode === "cloud") { e.preventDefault(); askClaude(); }
  if (e.key === "Enter" && e.target.id === "barcode") { e.preventDefault(); $("lookupCode").click(); }
});

/* ============ Arranque ============ */
async function boot(session) {
  U.session = session;
  if (store.mode === "cloud" && !session) { render(); return; }
  await store.load(session?.user?.id, () => render());
  render();
}
(async () => {
  if (store.mode === "cloud") {
    store.supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { openSheet({ type: "newpass" }); }
      if ((session?.user?.id || null) !== (U.session?.user?.id || null)) boot(session);
    });
    boot(await store.getSession());
  } else boot(null);
  // Cambio de día con la app abierta
  document.addEventListener("visibilitychange", () => { if (!document.hidden && U.sel !== todayStr() && U.lastToday && U.lastToday !== todayStr()) { U.sel = U.weekOf = todayStr(); render(); } U.lastToday = todayStr(); });
  U.lastToday = todayStr();
  if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
