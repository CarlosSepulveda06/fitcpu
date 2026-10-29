import { wrap, claudeJSON, num, str, httpError } from "./_lib.js";

// POST /api/food-search  { q }  ->  { foods: [...] }  (valores por 100 g)
export default wrap(async (body) => {
  const q = str(body.q, 120).trim();
  if (q.length < 2) throw httpError(400, "Escribe qué alimento buscas.");

  const prompt =
    `Eres una tabla de composición de alimentos (estilo USDA / SMAE México). El usuario busca: "${q}".\n` +
    `Responde SOLO un arreglo JSON con 1 a 5 alimentos que coincidan (variantes útiles: crudo/cocido, con/sin, marcas comunes en México si aplica). Cada objeto:\n` +
    `{"name": nombre corto en español, "emoji": un emoji, "k": kcal por 100 g, "p": proteína g, "c": carbohidratos g, "f": grasa g, ` +
    `"su": azúcares g, "fi": fibra g, "na": sodio mg, "sf": grasa saturada g, "unit": porción habitual sin número (ej. "pieza","taza","taco"), "g": gramos de esa porción}\n` +
    `Todos los nutrientes por 100 g. Valores típicos y realistas; k debe ser aprox. 4p+4c+9f.\n` +
    `Ejemplo: [{"name":"Taco de asada","emoji":"🌮","k":215,"p":13,"c":17,"f":10,"su":1,"fi":2,"na":380,"sf":3.5,"unit":"taco","g":90}]`;

  const out = await claudeJSON({
    model: process.env.CLAUDE_MODEL_FAST || "claude-haiku-5-5",
    prompt,
    maxTokens: 1200,
  });

  const foods = (Array.isArray(out) ? out : []).slice(0, 5).map((x) => ({
    name: str(x.name, 80),
    emoji: str(x.emoji || "🍽️", 4),
    k: num(x.k), p: num(x.p), c: num(x.c), f: num(x.f),
    su: num(x.su), fi: num(x.fi), na: num(x.na), sf: num(x.sf),
    unit: str(x.unit || "porción", 20),
    g: num(x.g) || 100,
  })).filter((x) => x.name && x.k >= 0);

  return { foods };
});
