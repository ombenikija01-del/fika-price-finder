// GET /api/search?q=headphones&country=TZ
// Fetches live Google Shopping results for a country via SerpApi,
// converts prices into that country's currency, and returns a clean list.
import { COUNTRY_CURRENCY, normalize } from "./_lib.js";

let rateCache = { at: 0, data: null };

async function getRates() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (rateCache.data && Date.now() - rateCache.at < SIX_HOURS) return rateCache.data;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const j = await r.json();
    if (j && j.rates) {
      rateCache = { at: Date.now(), data: { rates: j.rates, updated: j.time_last_update_utc || null } };
    }
  } catch (e) { /* keep the old rates if the refresh fails */ }
  return rateCache.data;
}

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const country = String(req.query.country || "US").trim().toUpperCase();

  if (!q) return res.status(400).json({ error: "Type a product to search for." });
  if (!COUNTRY_CURRENCY[country]) return res.status(400).json({ error: "That country isn't supported yet." });

  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(500).json({ error: "The search key is missing. Add SERPAPI_KEY in the hosting settings." });

  const params = new URLSearchParams({
    engine: "google_shopping", q, gl: country.toLowerCase(), hl: "en", api_key: key
  });

  let serp;
  try {
    const r = await fetch("https://serpapi.com/search.json?" + params.toString());
    serp = await r.json();
    if (!r.ok || serp.error) {
      const msg = serp && serp.error ? serp.error : "Search service returned " + r.status;
      const quota = /run out|limit|plan/i.test(msg);
      return res.status(quota ? 429 : 502).json({
        error: quota ? "This month's free searches are used up." : "The search service had a problem: " + msg
      });
    }
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach the search service. Try again in a minute." });
  }

  const rates = await getRates();
  const { currency, results } = normalize(serp, country, rates && rates.rates);

  // Let Vercel's CDN reuse the same search for an hour, saving monthly quota.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({
    query: q, country, currency,
    ratesUpdated: rates ? rates.updated : null,
    ratesAvailable: !!rates,
    count: results.length,
    results
  });
}
