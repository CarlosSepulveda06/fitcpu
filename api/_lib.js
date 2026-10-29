// Utilidades compartidas por las funciones de servidor (Vercel).
// Los archivos que empiezan con "_" no se publican como rutas.

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// Verifica el token de sesión de Supabase y que el correo esté permitido.
export async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !anon) throw httpError(401, "Inicia sesión para usar esta función.");

  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw httpError(401, "Tu sesión expiró. Vuelve a entrar.");
  const user = await r.json();

  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email || "").toLowerCase())) {
    throw httpError(403, "Tu cuenta no tiene acceso a las funciones con Claude.");
  }
  return user;
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

// Llama a la API de Anthropic y devuelve el primer valor JSON de la respuesta.
export async function claudeJSON({ model, prompt, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw httpError(503, "Falta configurar la llave de Claude en el servidor.");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (r.status === 429) throw httpError(429, "Demasiadas solicitudes. Espera un momento.");
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("Anthropic error", r.status, detail.slice(0, 500));
    throw httpError(502, "Claude no respondió. Intenta de nuevo.");
  }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJSON(text);
}

export function parseJSON(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const start = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch {} }
  throw httpError(502, "La respuesta de Claude salió incompleta. Intenta de nuevo.");
}

export function wrap(handler) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "Usa POST." });
    try {
      await requireUser(req);
      const body = await readBody(req);
      send(res, 200, await handler(body));
    } catch (e) {
      send(res, e.status || 500, { error: e.status ? e.message : "Error inesperado." });
      if (!e.status) console.error(e);
    }
  };
}

export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const str = (v, max) => String(v ?? "").slice(0, max);
