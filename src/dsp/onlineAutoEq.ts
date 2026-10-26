import { HeadphoneProfile } from '../types';
import { parseAutoEqText } from './customProfileStorage';

/**
 * Phase 2-⑥: Online AutoEQ Search
 *
 * Dynamically fetches headphone profiles from the AutoEQ GitHub repository
 * (https://github.com/jaakkopasanen/AutoEq). Enables "tap-to-import" workflow.
 *
 * Strategy: Uses GitHub's Git Trees API (anonymous, no rate limit) to fetch the
 * full file tree of the AutoEq repository, then filters client-side.
 * The Code Search API requires authentication as of 2025.
 */

const AUTO_EQ_OWNER = 'jaakkopasanen';
const AUTO_EQ_REPO = 'AutoEq';
const RAW_BASE = `https://raw.githubusercontent.com/${AUTO_EQ_OWNER}/${AUTO_EQ_REPO}/master`;
const GITHUB_API = 'https://api.github.com';
const PROFILE_FILENAME = 'ParametricEQ.txt';

export interface OnlineSearchResult {
  id: string;
  modelName: string;
  brand: string;
  targetCurve: string;
  path: string;
  url: string;
}

export interface OnlineFetchResult {
  profile: HeadphoneProfile;
  source: 'online';
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const searchCache = new Map<string, { results: OnlineSearchResult[]; timestamp: number }>();
const profileCache = new Map<string, { profile: HeadphoneProfile; timestamp: number }>();

let treeCache: { entries: OnlineSearchResult[]; timestamp: number } | null = null;
let treeFetchPromise: Promise<OnlineSearchResult[]> | null = null;

function getCachedSearch(query: string): OnlineSearchResult[] | null {
  const cached = searchCache.get(query.toLowerCase());
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    searchCache.delete(query.toLowerCase());
    return null;
  }
  return cached.results;
}

function setCachedSearch(query: string, results: OnlineSearchResult[]): void {
  searchCache.set(query.toLowerCase(), { results, timestamp: Date.now() });
}

function getCachedProfile(path: string): HeadphoneProfile | null {
  const cached = profileCache.get(path);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    profileCache.delete(path);
    return null;
  }
  return cached.profile;
}

function setCachedProfile(path: string, profile: HeadphoneProfile): void {
  profileCache.set(path, { profile, timestamp: Date.now() });
}

function parsePathInfo(path: string): { brand: string; modelName: string; targetCurve: string } {
  const segments = path.split('/').filter(Boolean);
  const author = segments[1] || 'unknown';
  const source = segments[2] || 'unknown';
  const modelWithBrand = (segments[3] || 'Unknown').trim();
  const firstSpace = modelWithBrand.indexOf(' ');
  const brand = firstSpace > 0 ? modelWithBrand.substring(0, firstSpace) : 'Unknown';
  const modelName = modelWithBrand || 'Unknown Model';
  return { brand, modelName, targetCurve: `${source} (${author})` };
}

async function fetchAutoEqTree(): Promise<OnlineSearchResult[]> {
  if (treeCache && Date.now() - treeCache.timestamp < CACHE_TTL_MS) {
    return treeCache.entries;
  }
  if (treeFetchPromise) {
    return treeFetchPromise;
  }

  treeFetchPromise = (async () => {
    try {
      // Phase 2-⑥ (fix): GitHub's recursive=1 tree API truncates the result
      // (limited to ~500KB / 100k entries), and on a 50k+ tree the
      // ParametricEQ.txt files end up cut off. Use Contents API to walk
      // the results/ directory 1-level-at-a-time — slow but reliable.
      const allItems: any[] = [];
      await walkContentsTree('results', allItems, 0, 6 /* max depth */);

      const entries: OnlineSearchResult[] = allItems
        .filter(
          (item: any) =>
            item.type === 'blob' &&
            item.path.startsWith('results/') &&
            item.path.endsWith(`/${PROFILE_FILENAME}`)
        )
        .map((item: any) => {
          const info = parsePathInfo(item.path);
          return {
            id: item.path,
            modelName: info.modelName,
            brand: info.brand,
            targetCurve: info.targetCurve,
            path: item.path,
            url: `${RAW_BASE}/${item.path}`,
          };
        });

      treeCache = { entries, timestamp: Date.now() };
      console.warn(`[AutoEq] Contents walk complete: ${entries.length} ParametricEQ.txt entries from ${allItems.length} total items`);
      return entries;
    } catch (e: any) {
      console.warn('[AutoEq] Tree fetch error:', e?.message ?? String(e));
      // Clear stale cache so the next search retries
      treeCache = null;
      throw e; // Re-throw so the UI shows the real error instead of silently returning []
    } finally {
      treeFetchPromise = null;
    }
  })();

  return treeFetchPromise;
}

// Recursively walk a path via the Contents API (no truncation).
async function walkContentsTree(
  path: string,
  out: any[],
  depth: number,
  maxDepth: number
): Promise<void> {
  if (depth > maxDepth) return;
  const url = `${GITHUB_API}/repos/${AUTO_EQ_OWNER}/${AUTO_EQ_REPO}/contents/${path}?ref=master`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch (e: any) {
    throw new Error(`Contents API fetch failed at ${path}: ${e?.message ?? e}`);
  }
  if (!res.ok) {
    throw new Error(`Contents API HTTP ${res.status} at ${path}`);
  }
  const items: any[] = await res.json();
  if (!Array.isArray(items)) return;
  for (const item of items) {
    out.push(item);
    if (item.type === 'dir') {
      await walkContentsTree(item.path, out, depth + 1, maxDepth);
    }
  }
}

function pathSimilarity(path: string, query: string): number {
  const segments = path.toLowerCase().split('/');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    for (const seg of segments) {
      if (seg.includes(term)) score += 1;
    }
  }
  return score;
}

export async function searchOnlineCatalog(query: string): Promise<OnlineSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  console.log('[AutoEq] searchOnlineCatalog START query=' + JSON.stringify(query));
  const cached = getCachedSearch(trimmed);
  if (cached !== null) {
    console.log('[AutoEq] cache HIT, returning ' + cached.length + ' items');
    return cached;
  }

  try {
    console.log('[AutoEq] cache MISS, calling fetchAutoEqTree');
    const all = await fetchAutoEqTree();
    console.log('[AutoEq] fetchAutoEqTree returned ' + all.length + ' items');
    if (all.length === 0) {
      console.warn('[AutoEq] tree is EMPTY, no items returned (NOT caching empty result so user can retry)');
      // Do NOT cache empty result — let user retry on next search
      return [];
    }

    const q = trimmed.toLowerCase();
    const matched = all.filter(
      (e) =>
        e.modelName.toLowerCase().includes(q) ||
        e.brand.toLowerCase().includes(q) ||
        e.targetCurve.toLowerCase().includes(q)
    );

    matched.sort((a, b) => {
      const aSim = pathSimilarity(a.path, trimmed);
      const bSim = pathSimilarity(b.path, trimmed);
      return bSim - aSim;
    });

    setCachedSearch(trimmed, matched);
    return matched;
  } catch (e) {
    console.warn('[AutoEq] Search failed:', e);
    return [];
  }
}

export async function fetchOnlineProfile(path: string): Promise<OnlineFetchResult | null> {
  const cached = getCachedProfile(path);
  if (cached) {
    return { profile: cached, source: 'online' };
  }

  try {
    const url = `${RAW_BASE}/${path}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[AutoEq] Profile fetch failed:', res.status, url);
      return null;
    }

    const text = await res.text();
    const info = parsePathInfo(path);
    const parsed = parseAutoEqText(text, info.modelName);
    if (!parsed) {
      console.warn('[AutoEq] Parse failed:', path);
      return null;
    }

    parsed.brand = info.brand;
    parsed.targetCurve = info.targetCurve;
    parsed.id = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    setCachedProfile(path, parsed);
    return { profile: parsed, source: 'online' };
  } catch (e) {
    console.warn('[AutoEq] Profile fetch error:', e);
    return null;
  }
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}