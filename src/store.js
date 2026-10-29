// Capa de datos. En la nube usa Supabase (tablas con RLS por usuario);
// sin variables de Supabase funciona en "modo local" guardando en el navegador.
import { createClient } from "@supabase/supabase-js";

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = URL_ && KEY_ ? createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const mode = supabase ? "cloud" : "local";

const LOCAL_KEY = "fitcpu:local:v1";
const cacheKey = (uid) => "fitcpu:cache:" + uid;

function emptyState() {
  return { profile: null, days: {}, weights: {}, foods: {} };
}

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let uid = null;
let state = emptyState();
const queues = {};
let onError = () => {};

export function setErrorHandler(fn) { onError = fn; }

function persistLocal() {
  writeLS(uid ? cacheKey(uid) : LOCAL_KEY, state);
}

function enqueue(key, fn) {
  persistLocal();
  if (!supabase || !uid) return Promise.resolve();
  queues[key] = (queues[key] || Promise.resolve()).then(fn).then((r) => {
    if (r && r.error) throw r.error;
  }).catch((e) => { console.warn(e); onError(e); });
  return queues[key];
}

// ---------- Sesión ----------
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuth(cb) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_ev, session) => cb(session));
}
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  if (error) throw error;
  return data;
}
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
export async function signOut() {
  if (uid) try { localStorage.removeItem(cacheKey(uid)); } catch {}
  uid = null;
  state = emptyState();
  if (supabase) await supabase.auth.signOut();
}

// ---------- Carga ----------
// Devuelve el estado guardado en el navegador al instante; luego llama `fresh` con lo de la nube.
export async function load(userId, fresh) {
  uid = userId || null;
  if (!supabase || !uid) {
    state = { ...emptyState(), ...(readLS(LOCAL_KEY) || {}) };
    return state;
  }
  state = { ...emptyState(), ...(readLS(cacheKey(uid)) || {}) };
  refresh().then(fresh).catch((e) => { console.warn(e); onError(e); });
  return state;
}

async function refresh() {
  const since = new Date(); since.setDate(since.getDate() - 400);
  const sinceStr = since.toISOString().slice(0, 10);
  const [p, d, w, f] = await Promise.all([
    supabase.from("profiles").select("data").maybeSingle(),
    supabase.from("days").select("date,meals,water_ml,note").gte("date", sinceStr),
    supabase.from("weights").select("date,kg"),
    supabase.from("foods").select("id,data"),
  ]);
  for (const r of [p, d, w, f]) if (r.error) throw r.error;
  const next = emptyState();
  next.profile = p.data ? p.data.data : null;
  (d.data || []).forEach((r) => { next.days[r.date] = { date: r.date, meals: r.meals || {}, water: r.water_ml || 0, note: r.note || "" }; });
  (w.data || []).forEach((r) => { next.weights[r.date] = { date: r.date, kg: Number(r.kg) }; });
  (f.data || []).forEach((r) => { next.foods[r.id] = { ...r.data, id: r.id }; });
  state = next;
  persistLocal();
  return state;
}

export function getState() { return state; }

// ---------- Escrituras ----------
export function saveDay(date) {
  const d = state.days[date] || { date, meals: {}, water: 0, note: "" };
  const row = { date, meals: d.meals || {}, water_ml: Math.round(d.water || 0), note: d.note || "", updated_at: new Date().toISOString() };
  return enqueue("day:" + date, () => supabase.from("days").upsert(row, { onConflict: "user_id,date" }));
}
export function saveProfile(p) {
  state.profile = p;
  return enqueue("profile", () => supabase.from("profiles").upsert({ data: p, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
}
export function saveWeight(date, kg) {
  state.weights[date] = { date, kg };
  return enqueue("w:" + date, () => supabase.from("weights").upsert({ date, kg, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" }));
}
export function deleteWeight(date) {
  delete state.weights[date];
  return enqueue("w:" + date, () => supabase.from("weights").delete().eq("date", date));
}
export function saveFood(food) {
  const id = food.id || "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const data = { ...food, id };
  state.foods[id] = data;
  enqueue("food:" + id, () => supabase.from("foods").upsert({ id, data, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" }));
  return data;
}

// Importa un respaldo { profile, days, weights, foods } (solo agrega o reemplaza, nunca borra).
export async function importBackup(b) {
  if (!b || typeof b !== "object") throw new Error("Archivo no válido");
  let n = 0;
  if (b.profile) { saveProfile(b.profile); n++; }
  Object.values(b.days || {}).forEach((d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return;
    state.days[d.date] = { date: d.date, meals: d.meals || {}, water: d.water || 0, note: d.note || "" };
    saveDay(d.date); n++;
  });
  Object.values(b.weights || {}).forEach((w) => { if (w.date && w.kg) { saveWeight(w.date, Number(w.kg)); n++; } });
  Object.values(b.foods || {}).forEach((f) => { if (f.name) { saveFood(f); n++; } });
  await Promise.all(Object.values(queues));
  return n;
}

export function exportBackup() {
  return JSON.parse(JSON.stringify(state));
}

// ---------- Funciones con Claude (servidor) ----------
export async function callApi(path, body) {
  const session = await getSession();
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(session ? { authorization: "Bearer " + session.access_token } : {}) },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || "No se pudo completar. Intenta de nuevo.");
  return data;
}
