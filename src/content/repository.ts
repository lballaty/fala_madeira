// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/content/repository.ts
// Description: Content data-access layer (docs/CONTENT-ARCHITECTURE.md §10). Loads
//   Situations/Tracks/ContentPacks with the resolution chain: (1) in-memory, (2) platform
//   StorageAdapter KV cache with sha256 checksum verification (canonicalPackPayload via
//   crypto.subtle — schema.ts keeps hashing out of the platform-neutral module), (3) network
//   (published rows of public.content_packs; the `payload` jsonb is the authoritative pack
//   JSON), (4) bundled defaults (src/content/bundled.ts). Version-aware: refresh() compares
//   cached pack versions/checksums against the server and replaces the cache write-then-swap
//   (pack payload keys first, the index key last as the commit point — a torn write is caught
//   by the next load's checksum verification, discarded, and refetched). Corrupted cache →
//   discard, WARN, refetch. Every failure logs through src/lib/logger with correlation IDs and
//   falls down the chain — never a silent failure, never a hardcoded URL. Content is data:
//   engines and path policies read from here, never from hardcoded lessons in components.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { platform } from '../platform';
import {
  ContentPack,
  Situation,
  Track,
  PracticalLevel,
  CONTENT_SCHEMA_VERSION,
  canonicalPackPayload,
  validateContentPack,
} from './schema';
import { BUNDLED_PACKS } from './bundled';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Where the currently loaded content came from (last rung reached in the chain). */
export type ContentSource = 'none' | 'bundled' | 'cache' | 'network';

export interface SituationFilter {
  /** Only situations belonging to this track (declared on either side of the m:n). */
  trackId?: string;
  /** Only situations at this practical level (0–5). */
  level?: PracticalLevel;
  /** Only situations shipped by this pack. */
  packId?: string;
  /** Only this one situation (EN-7: the finest download unit — one situation at a time). */
  situationId?: string;
}

export interface ContentRefreshResult {
  /** True when the server was reached and the cache/memory now reflect it. */
  refreshed: boolean;
  /** Pack ids fetched because they were new or their version/checksum changed. */
  updated: string[];
  /** Pack ids dropped because they are no longer published on the server. */
  removed: string[];
  /** Pack ids already cached at the server's version. */
  unchanged: string[];
}

export interface ContentPackVersion {
  id: string;
  version: string;
  /** sha256 hex of canonicalPackPayload(pack); null when hashing is unavailable. */
  checksum: string | null;
}

export interface ContentVersionInfo {
  schemaVersion: string;
  source: ContentSource;
  packs: ContentPackVersion[];
}

// ---------------------------------------------------------------------------
// Cache layout (platform.storage KV)
// ---------------------------------------------------------------------------

// content:index          → CachedIndex (the commit point: only packs listed here are trusted)
// content:pack:<packId>  → ContentPack JSON (authoritative payload, verified via checksum)
const INDEX_KEY = 'content:index';
const PACK_KEY_PREFIX = 'content:pack:';

interface CachedPackMeta {
  id: string;
  version: string;
  /** Checksum computed at cache-write time; null when crypto.subtle was unavailable. */
  checksum: string | null;
}

interface CachedIndex {
  schema_version: string;
  cached_at: string;
  packs: CachedPackMeta[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

let checksumUnavailableLogged = false;

/**
 * Browser-safe sha256 hex over the canonical pack payload. Returns null when
 * crypto.subtle is unavailable (non-secure context) — callers treat null as
 * "verification skipped", never as a mismatch.
 */
const packChecksum = async (pack: ContentPack): Promise<string | null> => {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    if (!checksumUnavailableLogged) {
      checksumUnavailableLogged = true;
      logger.debug('CONTENT_CHECKSUM_UNAVAILABLE', 'crypto.subtle unavailable — pack checksum verification skipped', {
        category: 'DATA_PROCESSING',
      });
    }
    return null;
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalPackPayload(pack)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Minimal structural guard for values read back from the KV cache. */
const looksLikePack = (value: unknown): value is ContentPack => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.version === 'string' && Array.isArray(v.situations);
};

const looksLikeIndex = (value: unknown): value is CachedIndex => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Array.isArray((value as Record<string, unknown>).packs);
};

// Row shape of public.content_packs as selected below (payload is authoritative).
interface ContentPackRow {
  id: string;
  version: string;
  schema_version: string | null;
  checksum: string | null;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// In-memory state (rung 1)
// ---------------------------------------------------------------------------

let packsById = new Map<string, ContentPack>();
let situationsById = new Map<string, Situation>();
let tracksById = new Map<string, Track>();
let source: ContentSource = 'none';

let loadPromise: Promise<void> | null = null;
let refreshPromise: Promise<ContentRefreshResult> | null = null;

/** Rebuild the derived situation/track indices from a set of packs (first id wins). */
const setMemory = (packs: ContentPack[], newSource: ContentSource, correlationId: string): void => {
  const nextPacks = new Map<string, ContentPack>();
  const nextSituations = new Map<string, Situation>();
  const nextTracks = new Map<string, Track>();

  for (const pack of packs) {
    if (nextPacks.has(pack.id)) {
      logger.warn('CONTENT_DUPLICATE_ID', `duplicate pack id "${pack.id}" — keeping first occurrence`, {
        category: 'DATA_PROCESSING',
        correlationId,
        details: { packId: pack.id },
      });
      continue;
    }
    nextPacks.set(pack.id, pack);
    for (const situation of pack.situations) {
      if (nextSituations.has(situation.id)) {
        logger.warn('CONTENT_DUPLICATE_ID', `duplicate situation id "${situation.id}" across packs — keeping first occurrence`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { situationId: situation.id, packId: pack.id },
        });
        continue;
      }
      nextSituations.set(situation.id, situation);
    }
    for (const track of pack.tracks ?? []) {
      if (nextTracks.has(track.id)) {
        logger.warn('CONTENT_DUPLICATE_ID', `duplicate track id "${track.id}" across packs — keeping first occurrence`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { trackId: track.id, packId: pack.id },
        });
        continue;
      }
      nextTracks.set(track.id, track);
    }
  }

  packsById = nextPacks;
  situationsById = nextSituations;
  tracksById = nextTracks;
  source = newSource;
};

/** Bundled packs fill in beneath higher rungs: only ids not already loaded are added. */
const mergeBundled = (packs: ContentPack[]): ContentPack[] => {
  const present = new Set(packs.map((p) => p.id));
  return [...packs, ...BUNDLED_PACKS.filter((p) => !present.has(p.id))];
};

// ---------------------------------------------------------------------------
// Rung 2: StorageAdapter cache
// ---------------------------------------------------------------------------

interface CacheLoadResult {
  packs: ContentPack[];
  /** True when any cached pack was discarded (corrupt/missing) — triggers a refetch. */
  degraded: boolean;
}

const loadFromCache = async (correlationId: string): Promise<CacheLoadResult> => {
  const result: CacheLoadResult = { packs: [], degraded: false };
  let index: CachedIndex;
  try {
    const raw = await platform.storage.get<unknown>(INDEX_KEY);
    if (!looksLikeIndex(raw)) return result; // no cache yet (or unreadable shape) — not an error
    index = raw;
  } catch (error) {
    logger.warn('CONTENT_CACHE_READ_FAILED', 'could not read the content cache index — falling through to network', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    return result;
  }

  for (const meta of index.packs) {
    try {
      const raw = await platform.storage.get<unknown>(PACK_KEY_PREFIX + meta.id);
      if (!looksLikePack(raw)) {
        result.degraded = true;
        logger.warn('CONTENT_CACHE_CORRUPT', `cached pack "${meta.id}" is missing or malformed — discarding`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { packId: meta.id },
        });
        await platform.storage.delete(PACK_KEY_PREFIX + meta.id);
        continue;
      }
      // Integrity: the index records the checksum computed at write time; a
      // mismatch means the payload was corrupted (or a torn write-then-swap).
      if (meta.checksum) {
        const computed = await packChecksum(raw);
        if (computed !== null && computed !== meta.checksum) {
          result.degraded = true;
          logger.warn('CONTENT_CACHE_CORRUPT', `cached pack "${meta.id}" failed checksum verification — discarding and refetching`, {
            category: 'DATA_PROCESSING',
            correlationId,
            details: { packId: meta.id, expected: meta.checksum, computed },
          });
          await platform.storage.delete(PACK_KEY_PREFIX + meta.id);
          continue;
        }
      }
      result.packs.push(raw);
    } catch (error) {
      result.degraded = true;
      logger.warn('CONTENT_CACHE_READ_FAILED', `could not read cached pack "${meta.id}" — skipping`, {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
        details: { packId: meta.id },
      });
    }
  }
  return result;
};

/**
 * Write-then-swap cache update: pack payload keys first, the index key last as
 * the commit point. A crash between the two leaves a payload whose checksum no
 * longer matches the (old) index entry — the next load discards and refetches.
 */
const writeCache = async (packs: ContentPack[], correlationId: string): Promise<void> => {
  try {
    const metas: CachedPackMeta[] = [];
    for (const pack of packs) {
      const checksum = await packChecksum(pack);
      await platform.storage.set(PACK_KEY_PREFIX + pack.id, pack);
      metas.push({ id: pack.id, version: pack.version, checksum });
    }
    const index: CachedIndex = {
      schema_version: CONTENT_SCHEMA_VERSION,
      cached_at: new Date().toISOString(),
      packs: metas,
    };
    await platform.storage.set(INDEX_KEY, index); // commit point
    // Garbage-collect payload keys no longer referenced by the index.
    const live = new Set(metas.map((m) => PACK_KEY_PREFIX + m.id));
    for (const key of await platform.storage.keys(PACK_KEY_PREFIX)) {
      if (!live.has(key)) await platform.storage.delete(key);
    }
  } catch (error) {
    // Cache persistence is best-effort: memory already holds the packs.
    logger.warn('CONTENT_CACHE_WRITE_FAILED', 'could not persist content packs to the cache — content stays memory-only this session', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
  }
};

// ---------------------------------------------------------------------------
// Rung 3: network (published content_packs; payload jsonb is authoritative)
// ---------------------------------------------------------------------------

const fetchFromNetwork = async (correlationId: string): Promise<ContentPack[] | null> => {
  const supabase = getSupabase();
  if (!supabase) {
    // Missing config fails loudly (never a hardcoded fallback URL) but the
    // chain continues to bundled content so the app stays usable.
    logger.warn('CONTENT_SUPABASE_UNCONFIGURED', 'Supabase client unavailable (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — content network fetch skipped', {
      category: 'DATA_PROCESSING',
      correlationId,
    });
    return null;
  }

  try {
    // RLS already restricts anonymous reads to published packs; the explicit
    // filter keeps admin sessions from pulling drafts into the runtime cache.
    const { data, error } = await supabase
      .from('content_packs')
      .select('id, version, schema_version, checksum, payload')
      .eq('status', 'published');
    if (error) throw error;

    const packs: ContentPack[] = [];
    for (const row of (data ?? []) as ContentPackRow[]) {
      if (!looksLikePack(row.payload)) {
        logger.warn('CONTENT_PACK_INVALID', `published pack "${row.id}" has no usable payload — skipping`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { packId: row.id },
        });
        continue;
      }
      const pack = row.payload;
      if (pack.id !== row.id) {
        logger.warn('CONTENT_PACK_INVALID', `pack payload id "${pack.id}" does not match row id "${row.id}" — skipping`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { rowId: row.id, payloadId: pack.id },
        });
        continue;
      }
      const validation = validateContentPack(pack);
      if (!validation.valid) {
        logger.error('CONTENT_PACK_INVALID', `published pack "${row.id}" failed schema validation — skipping`, {
          category: 'DATA_PROCESSING',
          correlationId,
          details: { packId: row.id, errors: validation.errors.slice(0, 10) },
        });
        continue;
      }
      // Publish-time checksum is advisory here (the cache verifies against its
      // own write-time checksum); a mismatch signals a broken publish pipeline.
      if (row.checksum) {
        const computed = await packChecksum(pack);
        if (computed !== null && computed !== row.checksum) {
          logger.warn('CONTENT_PACK_CHECKSUM_MISMATCH', `published pack "${row.id}" payload does not match its declared checksum`, {
            category: 'DATA_PROCESSING',
            correlationId,
            details: { packId: row.id, declared: row.checksum, computed },
          });
        }
      }
      packs.push(pack);
    }
    return packs;
  } catch (error) {
    logger.warn('CONTENT_NETWORK_FETCH_FAILED', 'could not fetch content packs from the server — falling back down the chain', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    return null;
  }
};

// ---------------------------------------------------------------------------
// Load + refresh orchestration
// ---------------------------------------------------------------------------

const load = async (correlationId: string): Promise<void> => {
  // Rung 2: cache (fast, offline-capable).
  const cached = await loadFromCache(correlationId);
  if (cached.packs.length > 0) {
    setMemory(mergeBundled(cached.packs), 'cache', correlationId);
    logger.info('CONTENT_LOADED', `content loaded from cache (${cached.packs.length} pack(s))`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { source: 'cache', packIds: cached.packs.map((p) => p.id), degraded: cached.degraded },
    });
    if (cached.degraded) {
      // Some cached packs were corrupt — refetch in the background (§10). EN-27 P2: log a failure
      // of that background refresh instead of swallowing it (the user is on degraded/corrupt cached
      // content until the next successful refresh — that should be visible to ops).
      void refreshInternal(correlationId).catch((error: unknown) => {
        logger.warn('CONTENT_REFRESH_BACKGROUND_FAILED', 'background refresh of degraded cache failed — staying on cached content', {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
        });
      });
    }
    return;
  }

  // Rung 3: network.
  const fetched = await fetchFromNetwork(correlationId);
  if (fetched && fetched.length > 0) {
    setMemory(mergeBundled(fetched), 'network', correlationId);
    await writeCache(fetched, correlationId);
    logger.info('CONTENT_LOADED', `content loaded from network (${fetched.length} pack(s))`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { source: 'network', packIds: fetched.map((p) => p.id) },
    });
    return;
  }

  // Rung 4: bundled defaults.
  if (BUNDLED_PACKS.length > 0) {
    setMemory(BUNDLED_PACKS, 'bundled', correlationId);
    logger.warn('CONTENT_FALLBACK_BUNDLED', `cache and network unavailable — serving ${BUNDLED_PACKS.length} bundled pack(s)`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { packIds: BUNDLED_PACKS.map((p) => p.id) },
    });
    return;
  }

  setMemory([], 'none', correlationId);
  logger.warn('CONTENT_EMPTY', 'no content available from cache, network, or bundle — repository is empty', {
    category: 'DATA_PROCESSING',
    correlationId,
  });
};

const ensureLoaded = (): Promise<void> => {
  if (source !== 'none') return Promise.resolve();
  if (!loadPromise) {
    const correlationId = newCorrelationId();
    loadPromise = load(correlationId).finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
};

const refreshInternal = async (correlationId: string): Promise<ContentRefreshResult> => {
  const fetched = await fetchFromNetwork(correlationId);
  if (fetched === null) {
    // Network unreachable/unconfigured (already logged) — current content stands.
    return { refreshed: false, updated: [], removed: [], unchanged: [] };
  }

  // Version awareness: diff the server set against the cached index.
  let cachedMetas: CachedPackMeta[] = [];
  try {
    const raw = await platform.storage.get<unknown>(INDEX_KEY);
    if (looksLikeIndex(raw)) cachedMetas = raw.packs;
  } catch (error) {
    logger.warn('CONTENT_CACHE_READ_FAILED', 'could not read the content cache index during refresh — treating all server packs as updated', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
  }
  const cachedById = new Map(cachedMetas.map((m) => [m.id, m]));
  const serverIds = new Set(fetched.map((p) => p.id));

  const updated: string[] = [];
  const unchanged: string[] = [];
  for (const pack of fetched) {
    const prior = cachedById.get(pack.id);
    if (!prior || prior.version !== pack.version) {
      updated.push(pack.id);
      continue;
    }
    // Same version — confirm content identity via checksum when available.
    const checksum = prior.checksum === null ? null : await packChecksum(pack);
    if (checksum !== null && prior.checksum !== null && checksum !== prior.checksum) updated.push(pack.id);
    else unchanged.push(pack.id);
  }
  const removed = cachedMetas.filter((m) => !serverIds.has(m.id)).map((m) => m.id);

  // Atomic replace: writeCache writes payload keys first, swaps the index last,
  // then garbage-collects keys the new index no longer references.
  setMemory(mergeBundled(fetched), 'network', correlationId);
  await writeCache(fetched, correlationId);

  logger.info('CONTENT_REFRESHED', `content refreshed from server (${updated.length} updated, ${removed.length} removed, ${unchanged.length} unchanged)`, {
    category: 'DATA_PROCESSING',
    correlationId,
    details: { updated, removed, unchanged },
  });
  return { refreshed: true, updated, removed, unchanged };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const contentRepository = {
  /** All loaded packs (server copies win over bundled ones with the same id). */
  async listPacks(): Promise<ContentPack[]> {
    await ensureLoaded();
    return [...packsById.values()];
  },

  async getPack(id: string): Promise<ContentPack | null> {
    await ensureLoaded();
    return packsById.get(id) ?? null;
  },

  /**
   * Situations across all loaded packs, optionally filtered (filters AND
   * together). With a trackId filter, results follow the track's curation
   * order (soft ordering — never a hard gate, §5).
   */
  async listSituations(filter?: SituationFilter): Promise<Situation[]> {
    await ensureLoaded();
    const track = filter?.trackId ? (tracksById.get(filter.trackId) ?? null) : null;
    const trackSituationIds = track ? new Set(track.situations) : null;

    let results = [...situationsById.values()];
    if (filter?.trackId) {
      const trackId = filter.trackId;
      results = results.filter((s) => s.tracks.includes(trackId) || trackSituationIds?.has(s.id) === true);
    }
    if (filter?.level !== undefined) {
      results = results.filter((s) => s.level === filter.level);
    }
    if (filter?.situationId) {
      results = results.filter((s) => s.id === filter.situationId);
    }
    if (filter?.packId) {
      const pack = packsById.get(filter.packId);
      const packSituationIds = new Set((pack?.situations ?? []).map((s) => s.id));
      results = results.filter((s) => packSituationIds.has(s.id));
    }
    if (track) {
      const order = new Map(track.situations.map((id, i) => [id, i]));
      results.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return results;
  },

  async getSituation(id: string): Promise<Situation | null> {
    await ensureLoaded();
    return situationsById.get(id) ?? null;
  },

  async listTracks(): Promise<Track[]> {
    await ensureLoaded();
    return [...tracksById.values()];
  },

  async getTrack(id: string): Promise<Track | null> {
    await ensureLoaded();
    return tracksById.get(id) ?? null;
  },

  /**
   * Fetch the published pack set from the server and update memory + cache
   * (write-then-swap). Safe to call any time; when the network is unreachable
   * the currently loaded content stands and `refreshed` is false.
   */
  refresh(): Promise<ContentRefreshResult> {
    if (!refreshPromise) {
      const correlationId = newCorrelationId();
      refreshPromise = refreshInternal(correlationId).finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  },

  /** Schema version + per-pack version/checksum of what is currently loaded. */
  async getContentVersion(): Promise<ContentVersionInfo> {
    await ensureLoaded();
    const packs: ContentPackVersion[] = [];
    for (const pack of packsById.values()) {
      packs.push({
        id: pack.id,
        version: pack.version,
        checksum: pack.checksum ?? (await packChecksum(pack)),
      });
    }
    return { schemaVersion: CONTENT_SCHEMA_VERSION, source, packs };
  },

  /** Source of the currently loaded content (diagnostics / offline UI labels). */
  getSource(): ContentSource {
    return source;
  },
};
