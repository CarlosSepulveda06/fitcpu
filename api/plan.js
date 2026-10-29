import { wrap, claudeJSON, num, str, httpError } from "./_lib.js";

const MEAL_KEYS = ["desayuno", "comida", "cena", "snack1", "snack2"];
const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// POST /api/plan  { targets, days: ["YYYY-MM-DD"], meals: ["desayuno",...], prefs, catalog }
//   -> { days: [{ date, meals: { desayuno: [{ name, emoji, grams, k, p, c, f }] } }] }
export default wrap(async (body) => {
  const T = body.targets || {};
  const kcal = Math.round(num(T.kcal));
  if (kcal < 1000 || kcal > 6000) throw httpError(400, "Revisa tu meta de calorías.");

  const days = (Array.isArray(body.days) ? body.days : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 7);
  const meals = (Array.isArray(body.meals) ? body.meals : []).filter((m) => MEAL_KEYS.includes(m));
  if (!days.length || !meals.length) throw httpError(400, "Elige al menos un día y una comida.");

  const prefs = str(body.prefs, 600).trim();
  const catalog = str(body.catalog, 12000);
  const dayList = days.map((d) => `${d} (${DOW[new Date(d + "T12:00:00").getDay()]})`).join(", ");

  const prompt =
    `Eres nutriólogo en México. Arma un plan de comidas.\n` +
    `Meta diaria: ${kcal} kcal, ${Math.round(num(T.p))} g proteína, ${Math.round(num(T.c))} g carbohidratos, ${Math.round(num(T.f))} g grasa. ` +
    `Cada día debe quedar dentro de ±5% de las kcal y con al menos ${Math.round(num(T.p)) - 10} g de proteína.` +
    (meals.length < 4 ? " Solo se planean estas comidas, así que reparte la meta completa entre ellas." : "") + "\n" +
    `Días: ${dayList}\n` +
    `Comidas por día (usa exactamente estas claves): ${meals.join(", ")}\n` +
    `Preferencias del usuario: ${prefs ? `"${prefs}"` : "ninguna"}\n` +
    `Comida casera realista y fácil de conseguir en México, variada entre días (se vale repetir desayunos), 1 a 4 alimentos por comida, porciones en gramos redondeados. ` +
    `Prefiere alimentos de esta lista (nombre|kcal,proteína,carbs,grasa por 100 g) y copia su nombre y valores exactos; si usas otro, da valores típicos:\n${catalog}\n\n` +
    `Responde SOLO JSON con esta forma, k,p,c,f por 100 g:\n` +
    `{"days":[{"date":"YYYY-MM-DD","meals":{"desayuno":[{"name":"Huevo","emoji":"🥚","grams":100,"k":143,"p":12.6,"c":0.7,"f":9.5}]}}]}`;

  const out = await claudeJSON({
    model: process.env.CLAUDE_MODEL_PLAN || "claude-sonnet-5-5",
    prompt,
    maxTokens: 12000,
  });

  const result = (out && Array.isArray(out.days) ? out.days : [])
    .filter((d) => days.includes(d.date))
    .map((d) => {
      const m = {};
      meals.forEach((key) => {
        const list = (d.meals && Array.isArray(d.meals[key]) ? d.meals[key] : [])
          .map((x) => ({
            name: str(x.name, 80), emoji: str(x.emoji || "🍽️", 4),
            grams: Math.round(num(x.grams)),
            k: num(x.k), p: num(x.p), c: num(x.c), f: num(x.f),
          }))
          .filter((x) => x.name && x.grams > 0);
        if (list.length) m[key] = list;
      });
      return { date: d.date, meals: m };
    });

  if (!result.length) throw httpError(502, "La respuesta salió incompleta. Prueba con menos días.");
  return { days: result };
});
