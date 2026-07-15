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
  if (
    /\blondon\b/.test(bag) ||
    /greater london/.test(bag) ||
    /city of london/.test(bag)
  ) {
    return true;
  }
  // London boroughs sometimes returned as city without "London" in the string.
  return /^(ealing|harrow|brent|barnet|enfield|haringey|hackney|islington|camden|westminster|kensington|chelsea|wandsworth|lambeth|southwark|lewisham|greenwich|bexley|havering|redbridge|walthamstow|waltham forest|newham|tower hamlets|merton|kingston|richmond|sutton|hillingdon|hounslow|bromley|croydon|city of westminster|hammersmith|fulham)$/i
    .test(city.trim());
}

/** Approx. Greater London bounding box (WGS84). */
function isGreaterLondonCoords(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat >= 51.28 && lat <= 51.7 && lng >= -0.55 && lng <= 0.35;
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
  let region = clean(raw.region, 80);
  let city = clean(raw.city, 80);
  const lat = typeof raw.lat === "number" && Number.isFinite(raw.lat) ? raw.lat : null;
  const lng = typeof raw.lng === "number" && Number.isFinite(raw.lng) ? raw.lng : null;

  const uk = isUkCountry(countryCode, countryName);
  const otherUk = uk && isOtherUkNation(region);
  let london =
    uk &&
    !otherUk &&
    (isLondonCity(city, region) || isGreaterLondonCoords(lat, lng));
  if (london) {
    if (!city || !/\blondon\b/i.test(city)) {
      // Keep borough name when useful, still mark London.
      if (city && !/^london$/i.test(city)) {
        /* keep city */
      } else {
        city = "London";
      }
      if (!region) region = "Greater London";
    }
  }
  const england =
    uk && !otherUk && (london || isEnglandRegion(region) || (!region && !city));

  let bucket: ParentGeo["bucket"] = "outside";
  if (london) bucket = "london";
  else if (england) bucket = "england";

  let label = "";
  if (bucket === "london") {
    label =
      city && !/^london$/i.test(city) ? `${city}, London` : "London, England";
  } else if (bucket === "england") {
    label = [city, region || "England"].filter(Boolean).join(", ");
    if (!label) label = "England";
  } else {
    label = [city, region, countryName || countryCode].filter(Boolean).join(", ") || "Unknown";
  }

  let mapLat = lat;
  let mapLng = lng;
  if (bucket === "london") {
    if (mapLat != null && mapLng != null && isGreaterLondonCoords(mapLat, mapLng)) {
      // Soften to ~300–400 m so CEO map shows the area (Latimer vs Brentford) without exact home pin.
      mapLat = Math.round(mapLat * 300) / 300;
      mapLng = Math.round(mapLng * 300) / 300;
    } else {
      mapLat = 51.5074;
      mapLng = -0.1278;
    }
  } else if (bucket === "england") {
    if (mapLat != null && mapLng != null) {
      mapLat = Math.round(mapLat * 200) / 200;
      mapLng = Math.round(mapLng * 200) / 200;
    } else {
      mapLat = 52.5;
      mapLng = -1.5;
    }
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

function geoFromCfHeaders(req: Request): ParentGeo | null {
  const cfCountry = clean(req.headers.get("cf-ipcountry"), 8);
  const cfCity = clean(req.headers.get("cf-ipcity"), 80);
  const cfRegion = clean(
    req.headers.get("cf-region") || req.headers.get("cf-region-code"),
    80,
  );
  const cfLat = Number(req.headers.get("cf-iplatitude") || "");
  const cfLng = Number(req.headers.get("cf-iplongitude") || "");
  if (!cfCountry || cfCountry === "XX" || cfCountry === "T1") return null;
  return classifyParentGeo({
    countryCode: cfCountry,
    countryName: cfCountry,
    region: cfRegion,
    city: cfCity,
    lat: Number.isFinite(cfLat) ? cfLat : null,
    lng: Number.isFinite(cfLng) ? cfLng : null,
  });
}

/** Prefer London / richer IP city over CF — UK CF city labels are often wrong. */
function pickBestGeo(fromCf: ParentGeo | null, fromIp: ParentGeo | null): ParentGeo | null {
  if (!fromCf) return fromIp;
  if (!fromIp) return fromCf;
  if (fromIp.bucket === "london") return fromIp;
  if (fromCf.bucket === "london") return fromCf;
  if (fromIp.city) return fromIp;
  return fromCf;
}

export async function lookupParentGeoFromRequest(req: Request, ip: string): Promise<ParentGeo | null> {
  const fromCf = geoFromCfHeaders(req);
  const cleanIp = String(ip || "").trim();
  if (!cleanIp || cleanIp === "127.0.0.1" || cleanIp === "::1") {
    return fromCf;
  }
  const fromIp = await lookupIpGeo(cleanIp);
  return pickBestGeo(fromCf, fromIp);
}

/** Accept a browser-side geo hint (preferred over server IP lookup when valid). */
export function geoFromClientHint(raw: unknown): ParentGeo | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const countryCode = clean(h.country_code || h.countryCode, 8);
  const countryName = clean(h.country || h.country_name || h.countryName, 80);
  const region = clean(h.region || h.regionName, 80);
  const city = clean(h.city, 80);
  const lat = typeof h.latitude === "number" ? h.latitude : Number(h.latitude ?? h.lat);
  const lng = typeof h.longitude === "number" ? h.longitude : Number(h.longitude ?? h.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (!countryCode && !countryName && !city && !hasCoords) return null;
  return classifyParentGeo({
    countryCode,
    countryName: countryName || countryCode,
    region,
    city,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
  });
}

/** Local area labels club staff recognise (stronger than generic OSM suburb names). */
const LONDON_AREA_OVERRIDES: Array<{
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}> = [
  // Latimer Road / North Kensington (W10) — often mis-labelled Brentford by ISP GeoIP.
  { name: "Latimer", minLat: 51.507, maxLat: 51.521, minLng: -0.232, maxLng: -0.205 },
];

function londonAreaOverride(lat: number, lng: number): string | null {
  for (const a of LONDON_AREA_OVERRIDES) {
    if (lat >= a.minLat && lat <= a.maxLat && lng >= a.minLng && lng <= a.maxLng) {
      return a.name;
    }
  }
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<{
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
} | null> {
  const localArea = londonAreaOverride(lat, lng);
  // zoom 17 ≈ neighbourhood / suburb, not borough or whole London.
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&zoom=17&addressdetails=1`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ClubSensationalPortal/1.0 (parent-presence-geo)",
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      if (localArea) {
        return {
          countryCode: "GB",
          countryName: "United Kingdom",
          region: "Greater London",
          city: localArea,
        };
      }
      return null;
    }
    const j = await res.json() as Record<string, unknown>;
    const addr = (j.address && typeof j.address === "object"
      ? j.address
      : {}) as Record<string, unknown>;
    const road = clean(addr.road, 80);
    const display = clean(j.display_name, 200);

    function isGenericLondonPlace(name: string): boolean {
      const n = name.toLowerCase();
      return (
        !n ||
        n === "london" ||
        n === "greater london" ||
        /^london borough of\b/.test(n) ||
        /^royal borough of\b/.test(n) ||
        /^city of westminster$/.test(n) ||
        /^city of london$/.test(n)
      );
    }

    // Prefer neighbourhood / suburb over ISP town (Brentford) or "Greater London".
    const candidates = [
      localArea || "",
      /latimer/i.test(road) || /latimer/i.test(display) ? "Latimer" : "",
      clean(addr.neighbourhood, 80),
      clean(addr.suburb, 80),
      clean(addr.quarter, 80),
      clean(addr.residential, 80),
      clean(addr.village, 80),
      clean(addr.hamlet, 80),
      clean(addr.locality, 80),
      clean(addr.town, 80),
      clean(addr.municipality, 80),
      clean(addr.city, 80),
      clean(addr.borough, 80),
      clean(addr.city_district, 80),
    ].filter(Boolean);

    let city = "";
    for (const c of candidates) {
      if (!isGenericLondonPlace(c)) {
        city = c;
        break;
      }
    }
    if (!city) city = localArea || "London";

    const region =
      [
        clean(addr.suburb, 80),
        clean(addr.city_district, 80),
        clean(addr.borough, 80),
        clean(addr.county, 80),
        clean(addr.state, 80),
      ].find((x) => x && !isGenericLondonPlace(x) && x.toLowerCase() !== city.toLowerCase()) ||
      "Greater London";
    const countryCode = clean(addr.country_code, 8).toUpperCase() || "GB";
    const countryName = clean(addr.country, 80) || "United Kingdom";
    if (!city && !region && !countryCode && !countryName) return null;
    return { countryCode, countryName, region: clean(region, 80), city };
  } catch {
    if (localArea) {
      return {
        countryCode: "GB",
        countryName: "United Kingdom",
        region: "Greater London",
        city: localArea,
      };
    }
    return null;
  }
}

/** Prefer device GPS hints; always reverse-geocode device coords for neighbourhood labels. */
export async function resolveClientHint(raw: unknown): Promise<ParentGeo | null> {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  const source = clean(h.source, 40).toLowerCase();
  const isDevice = source === "device-geo" || source === "browser-geo";
  const lat = typeof h.latitude === "number" ? h.latitude : Number(h.latitude ?? h.lat);
  const lng = typeof h.longitude === "number" ? h.longitude : Number(h.longitude ?? h.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  let countryCode = clean(h.country_code || h.countryCode, 8);
  let countryName = clean(h.country || h.country_name || h.countryName, 80);
  let region = clean(h.region || h.regionName, 80);
  let city = clean(h.city, 80);

  if (isDevice && hasCoords) {
    const rev = await reverseGeocode(lat, lng);
    if (rev) {
      // Device GPS wins: don't keep ISP names (Brentford) when reverse gives Latimer.
      city = rev.city || city;
      region = rev.region || region;
      countryCode = rev.countryCode || countryCode || "GB";
      countryName = rev.countryName || countryName || "United Kingdom";
    } else if (isGreaterLondonCoords(lat, lng)) {
      city = city && !/^london$/i.test(city) ? city : "London";
      region = region || "Greater London";
      countryCode = countryCode || "GB";
      countryName = countryName || "United Kingdom";
    }
  }

  if (!countryCode && !countryName && !city && !hasCoords) return null;
  return classifyParentGeo({
    countryCode,
    countryName: countryName || countryCode,
    region,
    city,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
  });
}

export async function resolveParentGeo(
  req: Request,
  ip: string,
  clientHint?: unknown,
): Promise<ParentGeo | null> {
  const fromHint = await resolveClientHint(clientHint);
  if (fromHint) return fromHint;
  return lookupParentGeoFromRequest(req, ip);
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
