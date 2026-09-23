// GET /api/search?q=headphones&country=TZ
// Fetches live Google Shopping results via SerpApi, converts prices into the
// buyer's currency, and returns a clean list. If Google Shopping doesn't cover
// the buyer's country, it falls back to international (US) results and says so.
import { COUNTRY_CURRENCY, normalize } from "./_lib.js";

const FALLBACK = "US";
// Countries SerpApi's Google Shopping has rejected. Tanzania is known; others are learned as they fail.
const UNSUPPORTED = new Set(["TZ"]);
let rateCache = { at: 0, data: null };

async function getRates() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (rateCache.data && Date.now() - rateCache.at < SIX_HOURS) return rateCache.data;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const j = await r.json();
    if (j && j.rates) rateCache = { at: Date.now(), data: { rates: j.rates, updated: j.time_last_update_utc || null } };
  } catch (e) { /* keep the old rates if the refresh fails */ }
  return rateCache.data;
}

// Three ways to ask SerpApi for shopping results. If one comes back empty, try the next.
const ENGINES = [
  { name: "google_shopping", extra: {} },
  { name: "google_shopping_light", extra: {} },
  { name: "google", extra: { tbm: "shop" } }
];
const NO_RESULTS = /hasn't returned any results|no results/i;

async function callSerp(engine, q, gl, key) {
  const params = new URLSearchParams({ engine: engine.name, q, gl: gl.toLowerCase(), hl: "en", api_key: key, ...engine.extra });
  if (gl === FALLBACK) params.set("location", "United States");
  const r = await fetch("https://serpapi.com/search.json?" + params.toString());
  const j = await r.json();
  if (!r.ok || j.error) {
    const msg = j && j.error ? j.error : "Search service returned " + r.status;
    const err = new Error(msg);
    err.unsupported = /unsupported/i.test(msg) && /gl|country/i.test(msg);
    err.quota = /run out|limit|plan|credits/i.test(msg);
    err.empty = NO_RESULTS.test(msg);
    throw err;
  }
  const n = (j.shopping_results || []).length + (j.inline_shopping_results || []).length;
  if (!n) { const err = new Error("No results"); err.empty = true; throw err; }
  j._engine = engine.name;
  return j;
}

async function shoppingSearch(q, gl, key) {
  let last;
  for (const engine of ENGINES) {
    try { return await callSerp(engine, q, gl, key); }
    catch (e) { last = e; if (!e.empty) throw e; }
  }
  return { shopping_results: [], _engine: "none", _empty: true, _msg: last && last.message };
}

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const country = String(req.query.country || "US").trim().toUpperCase();

  if (!q) return res.status(400).json({ error: "Type a product to search for." });
  if (!COUNTRY_CURRENCY[country]) return res.status(400).json({ error: "That country isn't supported yet." });

  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(500).json({ error: "The search key is missing. Add SERPAPI_KEY in the hosting settings." });

  let source = UNSUPPORTED.has(country) ? FALLBACK : country;
  let serp;
  try {
    try {
      serp = await shoppingSearch(q, source, key);
    } catch (e) {
      if (!e.unsupported || source === FALLBACK) throw e;
      UNSUPPORTED.add(country);
      source = FALLBACK;
      serp = await shoppingSearch(q, source, key);
    }
  } catch (e) {
    if (e.quota) return res.status(429).json({ error: "This month's free searches are used up." });
    return res.status(502).json({ error: e.message ? "The search service had a problem: " + e.message : "Couldn't reach the search service. Try again in a minute." });
  }

  const rates = await getRates();
  const { currency, results } = normalize(serp, country, rates && rates.rates, source);

  res.setHeader("Cache-Control", results.length ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store");
  return res.status(200).json({
    query: q, country, currency,
    sourceCountry: source,
    engine: serp._engine || null,
    fallback: source !== country,
    ratesUpdated: rates ? rates.updated : null,
    ratesAvailable: !!rates,
    count: results.length,
    results
  });
}
