/**
 * Coarse GeoIP for parent portal sessions — never store raw IP.
 * Prefer Cloudflare headers when present; else ipwho.is (ipapi.co is often rate-limited).
 */

export type ParentGeo = {
  country: string;
  region: string;
  city: string;
  bucket: "london" | "england" | "outside";
  lat: number | null;
  lng: number | null;
  label: string;
};

function clean(v: unknown, max = 80): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isUkCountry(code: string, name: string): boolean {
  const c = code.toUpperCase();
  const n = name.toLowerCase();
  return c === "GB" || c === "UK" || n === "united kingdom" || n === "great britain";
}

function isOtherUkNation(region: string): boolean {
  const r = region.toLowerCase();
  return /scotland|wales|northern ireland|\bcymru\b|\balba\b/.test(r);
}

function isEnglandRegion(region: string): boolean {
  const r = region.toLowerCase();
  if (!r || isOtherUkNation(r)) return false;
  if (r === "england") return true;
  return (
    /\bengland\b/.test(r) ||
    /greater london|london|essex|kent|surrey|hertfordshire|berkshire|buckinghamshire|middlesex|hampshire|sussex|oxfordshire|cambridgeshire|bedfordshire|norfolk|suffolk|devon|cornwall|somerset|dorset|wiltshire|gloucestershire|bristol|birmingham|manchester|liverpool|leeds|sheffield|newcastle|nottingham|leicester|coventry|reading|luton|slough|croydon|ealing|harrow|brent|barnet|enfield|haringey|hackney|islington|camden|westminster|kensington|chelsea|wandsworth|lambeth|southwark|lewisham|greenwich|bexley|havering|redbridge|waltham|newham|tower hamlets|merton|kingston|richmond|sutton|hillingdon|hounslow|bromley/.test(
      r,
    )
  );
}

function isLondonCity(city: string, region: string): boolean {
  const bag = `${city} ${region}`.toLowerCase();
  return (
    /\blondon\b/.test(bag) ||
    /greater london/.test(bag) ||
    /city of london/.test(bag)
  );
}

export function classifyParentGeo(raw: {
  countryCode?: string;
  countryName?: string;
  region?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
}): ParentGeo {
  const countryCode = clean(raw.countryCode, 8);
  const countryName = clean(raw.countryName, 80) || countryCode;
  const region = clean(raw.region, 80);
  const city = clean(raw.city, 80);
  const lat = typeof raw.lat === "number" && Number.isFinite(raw.lat) ? raw.lat : null;
  const lng = typeof raw.lng === "number" && Number.isFinite(raw.lng) ? raw.lng : null;

  const uk = isUkCountry(countryCode, countryName);
  const otherUk = uk && isOtherUkNation(region);
  const london = uk && !otherUk && isLondonCity(city, region);
  const england =
    uk && !otherUk && (london || isEnglandRegion(region) || (!region && !city));

  let bucket: ParentGeo["bucket"] = "outside";
  if (london) bucket = "london";
  else if (england) bucket = "england";

  let label = "";
  if (bucket === "london") {
    label = city && !/^london$/i.test(city) ? `${city}, London` : "London, England";
  } else if (bucket === "england") {
    label = [city, region || "England"].filter(Boolean).join(", ");
    if (!label) label = "England";
  } else {
    label = [city, region, countryName || countryCode].filter(Boolean).join(", ") || "Unknown";
  }

  let mapLat = lat;
  let mapLng = lng;
  if (bucket === "london" && (mapLat == null || mapLng == null)) {
    mapLat = 51.5074;
    mapLng = -0.1278;
  } else if (bucket === "england" && (mapLat == null || mapLng == null)) {
    mapLat = 52.5;
    mapLng = -1.5;
  } else if (bucket === "outside") {
    mapLat = null;
    mapLng = null;
  }

  return {
    country: countryName || countryCode,
    region,
    city,
    bucket,
    lat: mapLat,
    lng: mapLng,
    label,
  };
}

async function fetchJson(url: string, ms = 2500): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function lookupIpGeo(ip: string): Promise<ParentGeo | null> {
  // Primary: ipwho.is (HTTPS, no key for light use).
  const who = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (who && who.success !== false && !who.error) {
    return classifyParentGeo({
      countryCode: clean(who.country_code, 8),
      countryName: clean(who.country, 80),
      region: clean(who.region, 80),
      city: clean(who.city, 80),
      lat: typeof who.latitude === "number" ? who.latitude : Number(who.latitude),
      lng: typeof who.longitude === "number" ? who.longitude : Number(who.longitude),
    });
  }

  // Fallback: ipapi.co (often rate-limited from shared Edge IPs).
  const api = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  if (api && !api.error) {
    return classifyParentGeo({
      countryCode: clean(api.country_code, 8),
      countryName: clean(api.country_name, 80),
      region: clean(api.region, 80),
      city: clean(api.city, 80),
      lat: typeof api.latitude === "number" ? api.latitude : Number(api.latitude),
      lng: typeof api.longitude === "number" ? api.longitude : Number(api.longitude),
    });
  }

  return null;
}

export async function lookupParentGeoFromRequest(req: Request, ip: string): Promise<ParentGeo | null> {
  const cfCountry = clean(req.headers.get("cf-ipcountry"), 8);
  const cfCity = clean(req.headers.get("cf-ipcity"), 80);
  const cfRegion = clean(
    req.headers.get("cf-region") || req.headers.get("cf-region-code"),
    80,
  );
  const cfLat = Number(req.headers.get("cf-iplatitude") || "");
  const cfLng = Number(req.headers.get("cf-iplongitude") || "");

  if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") {
    return classifyParentGeo({
      countryCode: cfCountry,
      countryName: cfCountry,
      region: cfRegion,
      city: cfCity,
      lat: Number.isFinite(cfLat) ? cfLat : null,
      lng: Number.isFinite(cfLng) ? cfLng : null,
    });
  }

  const cleanIp = String(ip || "").trim();
  if (!cleanIp || cleanIp === "127.0.0.1" || cleanIp === "::1") return null;
  return lookupIpGeo(cleanIp);
}

export function parentGeoToDbFields(geo: ParentGeo): Record<string, unknown> {
  return {
    geo_country: geo.country || null,
    geo_region: geo.region || null,
    geo_city: geo.city || null,
    geo_bucket: geo.bucket,
    geo_lat: geo.lat,
    geo_lng: geo.lng,
    geo_label: geo.label,
  };
}
