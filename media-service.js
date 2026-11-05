const DB_NAME = 'birdnetcafe-media';
const DB_VERSION = 1;
const STORE_NAME = 'species-media';
const POSITIVE_CACHE_TTL = 90 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 9000;
const memoryCache = new Map();

function openMediaDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  const database = await openMediaDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      database.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      database.close();
      resolve(null);
    };
  });
}

async function writeCache(entry) {
  memoryCache.set(entry.key, entry);
  const database = await openMediaDatabase();
  if (!database) return;

  await new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(entry);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
  database.close();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeScientificName(value) {
  const words = normalizeName(value).replace(/\s*\([^)]*\)\s*/g, ' ').split(' ');
  if (words.length < 2) return normalizeName(value);
  return words.slice(0, 2).join(' ');
}

function isReusableLicense(code) {
  const normalized = String(code || '').toLowerCase().replace(/_/g, '-');
  return Boolean(normalized) && !normalized.includes('-nd') && (
    normalized === 'cc0' ||
    normalized === 'public-domain' ||
    normalized.startsWith('cc-by')
  );
}

function licenseUrl(code) {
  const normalized = String(code || '').toLowerCase().replace(/_/g, '-');
  if (normalized === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  if (normalized === 'public-domain') return 'https://creativecommons.org/publicdomain/mark/1.0/';
  const match = normalized.match(/^cc-(by(?:-nc)?(?:-sa)?)$/);
  return match ? `https://creativecommons.org/licenses/${match[1]}/4.0/` : null;
}

function licenseLabel(code) {
  return String(code || '').toUpperCase().replace(/-/g, ' ');
}

function buildCredit({ attribution, licenseCode, sourcePage, provider }) {
  return {
    attribution: normalizeName(attribution) || provider,
    licenseCode,
    licenseLabel: licenseLabel(licenseCode),
    licenseUrl: licenseUrl(licenseCode),
    provider,
    sourcePage,
  };
}

async function findTaxon(scientificName, commonName) {
  const query = normalizeScientificName(scientificName) || normalizeName(commonName);
  if (!query) return null;
  const url = new URL('https://api.inaturalist.org/v1/taxa/autocomplete');
  url.searchParams.set('q', query);
  url.searchParams.set('rank', 'species');
  url.searchParams.set('per_page', '8');
  const payload = await fetchJson(url);
  const target = query.toLowerCase();
  const birds = (payload.results || []).filter(result => result.iconic_taxon_name === 'Aves');
  return birds.find(result => String(result.name).toLowerCase() === target) || birds[0] || null;
}

function imageFromTaxon(taxon) {
  const photo = taxon?.default_photo;
  if (!photo || !photo.medium_url || !isReusableLicense(photo.license_code)) return null;
  const sourcePage = `https://www.inaturalist.org/taxa/${taxon.id}`;
  return {
    url: photo.medium_url,
    credit: buildCredit({
      attribution: photo.attribution,
      licenseCode: photo.license_code,
      sourcePage,
      provider: 'iNaturalist',
    }),
  };
}

function commonsLicenseCode(metadata) {
  const label = normalizeName(metadata?.LicenseShortName?.value).toLowerCase();
  if (label.includes('public domain')) return 'public-domain';
  if (label.includes('cc0')) return 'cc0';
  const match = label.match(/cc\s+(by(?:-nc)?(?:-sa)?)/i);
  return match ? `cc-${match[1].toLowerCase()}` : '';
}

async function findCommonsImage(scientificName) {
  if (!scientificName) return null;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', `"${scientificName}"`);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '12');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime|extmetadata');
  url.searchParams.set('iiurlwidth', '600');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const payload = await fetchJson(url);
  const pages = Object.values(payload.query?.pages || {});
  const target = scientificName.toLowerCase();
  const candidates = pages
    .map(page => ({ page, info: page.imageinfo?.[0] }))
    .filter(({ info }) => info?.mime?.startsWith('image/'))
    .map(candidate => {
      const metadata = candidate.info.extmetadata || {};
      const code = commonsLicenseCode(metadata);
      const title = String(candidate.page.title || '').toLowerCase();
      return { ...candidate, code, score: title.includes(target) ? 2 : 0 };
    })
    .filter(candidate => isReusableLicense(candidate.code))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  if (!selected) return null;
  const metadata = selected.info.extmetadata || {};
  return {
    url: selected.info.thumburl || selected.info.url,
    credit: buildCredit({
      attribution: metadata.Artist?.value?.replace(/<[^>]*>/g, '') || selected.page.title,
      licenseCode: selected.code,
      sourcePage: selected.info.descriptionurl,
      provider: 'Wikimedia Commons',
    }),
  };
}

function distanceInKm(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const radians = value => value * Math.PI / 180;
  const earthRadius = 6371;
  const dLat = radians(second.lat - first.lat);
  const dLng = radians(second.lng - first.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function soundScore(sound, observation, location) {
  const fileUrl = String(sound.file_url || '').toLowerCase();
  let score = fileUrl.includes('.mp3') ? 8 : fileUrl.includes('.m4a') ? 6 : fileUrl.includes('.ogg') ? 5 : 1;
  if (observation.quality_grade === 'research') score += 4;
  if (observation.captive === false) score += 2;
  const coordinates = observation.geojson?.coordinates;
  if (coordinates && location) {
    const distance = distanceInKm(location, { lat: coordinates[1], lng: coordinates[0] });
    score += Math.max(0, 8 - Math.log2(distance + 1));
  }
  return score;
}

async function findSound(taxon, location) {
  if (!taxon?.id) return null;
  const url = new URL('https://api.inaturalist.org/v1/observations');
  url.searchParams.set('taxon_id', taxon.id);
  url.searchParams.set('sounds', 'true');
  url.searchParams.set('quality_grade', 'research');
  url.searchParams.set('per_page', '30');
  url.searchParams.set('order_by', 'votes');
  url.searchParams.set('order', 'desc');
  const payload = await fetchJson(url);
  const candidates = [];

  for (const observation of payload.results || []) {
    for (const sound of observation.sounds || []) {
      if (!sound.file_url || !isReusableLicense(sound.license_code)) continue;
      candidates.push({ observation, sound, score: soundScore(sound, observation, location) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    url: selected.sound.file_url,
    credit: buildCredit({
      attribution: selected.sound.attribution,
      licenseCode: selected.sound.license_code,
      sourcePage: selected.observation.uri,
      provider: 'iNaturalist',
    }),
  };
}

export async function getSpeciesMedia({ scientificName, commonName, latitude, longitude }) {
  const normalizedScientific = normalizeScientificName(scientificName);
  const normalizedCommon = normalizeName(commonName);
  const key = (normalizedScientific || normalizedCommon).toLowerCase();
  if (!key) return { image: null, audio: null };

  const cached = await readCache(key);
  if (cached) {
    const ttl = cached.image || cached.audio ? POSITIVE_CACHE_TTL : NEGATIVE_CACHE_TTL;
    if (Date.now() - cached.fetchedAt < ttl) return cached;
  }

  const location = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { lat: latitude, lng: longitude }
    : null;
  const taxon = await findTaxon(normalizedScientific, normalizedCommon);
  const canonicalName = taxon?.name || normalizedScientific;
  let image = imageFromTaxon(taxon);
  if (!image && canonicalName) image = await findCommonsImage(canonicalName);
  const audio = await findSound(taxon, location);
  const entry = {
    key,
    scientificName: canonicalName || normalizedScientific,
    image,
    audio,
    fetchedAt: Date.now(),
  };
  await writeCache(entry);
  return entry;
}
