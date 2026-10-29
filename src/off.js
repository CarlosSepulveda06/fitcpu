// Open Food Facts: base abierta de productos empacados (https://openfoodfacts.org).
// Devuelve alimentos normalizados con nutrientes por 100 g.

const FIELDS = [
  "code", "product_name", "product_name_es", "brands", "quantity",
  "serving_quantity", "nutriments",
].join(",");

function normalize(p) {
  const n = p.nutriments || {};
  const val = (k) => {
    const v = parseFloat(n[k]);
    return Number.isFinite(v) ? v : null;
  };
  let kcal = val("energy-kcal_100g");
  if (kcal == null && val("energy_100g") != null) kcal = val("energy_100g") / 4.184;
  const name = (p.product_name_es || p.product_name || "").trim();
  if (!name || kcal == null) return null;
  const sodium = val("sodium_100g");
  const serving = parseFloat(p.serving_quantity);
  return {
    id: "off" + p.code,
    name: name.slice(0, 80),
    brand: (p.brands || "").split(",")[0].trim().slice(0, 40),
    emoji: "🛒",
    k: Math.round(kcal),
    p: val("proteins_100g") ?? 0,
    c: val("carbohydrates_100g") ?? 0,
    f: val("fat_100g") ?? 0,
    su: val("sugars_100g"),
    fi: val("fiber_100g"),
    na: sodium == null ? null : Math.round(sodium * 1000),
    sf: val("saturated-fat_100g"),
    unit: Number.isFinite(serving) && serving > 0 ? "porción" : "100 g",
    g: Number.isFinite(serving) && serving > 0 ? Math.round(serving) : 100,
    src: "off",
    code: p.code,
  };
}

export async function searchProducts(q, signal) {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.search = new URLSearchParams({
    search_terms: q, search_simple: "1", action: "process", json: "1",
    page_size: "20", fields: FIELDS, lc: "es", cc: "mx",
  }).toString();
  const r = await fetch(url, { signal });
  if (r.status === 429) throw new Error("rate");
  if (!r.ok) throw new Error("http");
  const data = await r.json();
  return (data.products || []).map(normalize).filter(Boolean).slice(0, 15);
}

export async function productByBarcode(code, signal) {
  const clean = String(code).replace(/\D/g, "");
  if (clean.length < 6) return null;
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${FIELDS}`, { signal });
  if (!r.ok) return null;
  const data = await r.json();
  return data.status === 1 && data.product ? normalize({ ...data.product, code: clean }) : null;
}
