// Shared helpers for the Fika search API.

// Country -> currency (ISO 4217).
const CUR_RAW = "AD:EUR AE:AED AF:AFN AG:XCD AL:ALL AM:AMD AO:AOA AR:ARS AT:EUR AU:AUD AZ:AZN BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BN:BND BO:BOB BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CV:CVE CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GH:GHS GM:GMD GN:GNF GQ:XAF GR:EUR GT:GTQ GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IN:INR IQ:IQD IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KM:KMF KN:XCD KR:KRW KW:KWD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MR:MRU MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NE:XOF NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NZ:NZD OM:OMR PA:PAB PE:PEN PG:PGK PH:PHP PK:PKR PL:PLN PT:EUR PY:PYG QA:QAR RO:RON RS:RSD RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SZ:SZL TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VA:EUR VN:VND VU:VUV WS:WST YE:YER ZA:ZAR ZM:ZMW ZW:USD";
export const COUNTRY_CURRENCY = Object.fromEntries(CUR_RAW.split(" ").map(p => p.split(":")));

const DOLLAR_CURRENCIES = new Set(["USD","CAD","AUD","NZD","SGD","HKD","TWD","MXN","BSD","BBD","BZD","JMD","TTD","XCD","FJD","LRD","NAD","GYD","SRD","SBD","BND"]);

// Longest tokens first so "KSh" wins over "R", "GH₵" over "₵", etc.
const SYMBOLS = [
  ["GH₵","GHS"],["KSh","KES"],["TSh","TZS"],["USh","UGX"],["RWF","RWF"],["E£","EGP"],["CA$","CAD"],["A$","AUD"],
  ["NZ$","NZD"],["HK$","HKD"],["S$","SGD"],["R$","BRL"],["MX$","MXN"],["US$","USD"],["zł","PLN"],["Kč","CZK"],
  ["RM","MYR"],["Rp","IDR"],["₹","INR"],["₦","NGN"],["£","GBP"],["€","EUR"],["₱","PHP"],["₩","KRW"],["₺","TRY"],
  ["₫","VND"],["฿","THB"],["₪","ILS"],["₴","UAH"],["₸","KZT"],["CHF","CHF"],["AED","AED"],["SAR","SAR"],["R","ZAR"]
];

// Work out which currency a Google Shopping price string is in.
export function detectCurrency(priceStr, country) {
  const local = COUNTRY_CURRENCY[country] || "USD";
  if (!priceStr) return local;
  const s = String(priceStr);
  const code = s.match(/\b([A-Z]{3})\b/);
  if (code && code[1] !== "FREE") return code[1];
  for (const [sym, cur] of SYMBOLS) {
    if (sym === "R" ? /(^|\s)R\s?\d/.test(s) : s.includes(sym)) return cur;
  }
  if (s.includes("¥")) return country === "CN" ? "CNY" : "JPY";
  if (s.includes("kr")) return ["SE","NO","DK","IS"].includes(country) ? local : "SEK";
  if (s.includes("$")) return DOLLAR_CURRENCIES.has(local) ? local : "USD";
  return local;
}

// Pull a delivery cost out of text such as "$10 delivery" or "Free delivery".
export function parseDelivery(text) {
  if (!text) return { text: "", cost: null };
  const t = String(text);
  if (/free/i.test(t)) return { text: t, cost: 0 };
  const m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return { text: t, cost: m ? parseFloat(m[1]) : null };
}

// Convert between currencies using USD-based rates ({USD:1, TZS:2600, ...}).
export function convert(amount, from, to, rates) {
  if (amount == null || !rates) return null;
  if (from === to) return amount;
  const a = rates[from], b = rates[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}

// Turn a SerpApi Google Shopping response into the app's result list.
export function normalize(serp, country, rates) {
  const local = COUNTRY_CURRENCY[country] || "USD";
  const items = [...(serp.shopping_results || []), ...(serp.inline_shopping_results || [])];
  const seen = new Set();
  const out = [];
  for (const r of items) {
    const price = typeof r.extracted_price === "number" ? r.extracted_price : null;
    if (price == null) continue;
    const key = (r.source || "") + "|" + (r.title || "") + "|" + price;
    if (seen.has(key)) continue;
    seen.add(key);
    const cur = detectCurrency(r.price, country);
    const del = parseDelivery(r.delivery);
    const deliveryLocal = del.cost == null ? null : convert(del.cost, cur, local, rates);
    out.push({
      title: r.title || "Untitled product",
      store: r.source || "Unknown store",
      price, currency: cur, priceText: r.price || "",
      priceLocal: convert(price, cur, local, rates),
      delivery: del.text, deliveryLocal,
      international: cur !== local,
      link: r.product_link || r.link || null,
      thumbnail: r.thumbnail || null,
      rating: r.rating || null, reviews: r.reviews || null
    });
  }
  return { currency: local, results: out };
}
