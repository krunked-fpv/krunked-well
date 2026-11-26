import type { AssetManifest, SpriteRect } from '../contracts/index.ts';

const IDB_NAME = 'krunked_well_custom_pack_v1';
const IDB_STORE = 'files';

export interface LoadedCustomPack {
  source: 'dev-middleware' | 'indexeddb';
  manifest: AssetManifest;
  atlasCanvas: HTMLCanvasElement;
  audioFetcher: (logicalId: string) => Promise<ArrayBuffer | null>;
}

interface RawCustomManifest {
  packName?: string;
  version?: number;
  textures?: Array<{ index: number; path: string; width?: number; height?: number }>;
  sprites?: Record<
    string,
    {
      id?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      originX?: number;
      originY?: number;
      frames?: number;
      frameStrideX?: number;
      texturePage?: number;
      tpagIndex?: number;
      framesMeta?: Array<{
        texturePage?: number;
        srcX: number;
        srcY: number;
        srcW: number;
        srcH: number;
      }>;
    }
  >;
  audio?: Record<string, string>;
  paletteCount?: number;
}

function openPackDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function normalizePackRelativePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Composites texture pages into a single atlas canvas and maps sprite rects
 * (falling back cleanly to built-in sprites for any logical ID absent in the custom pack).
 */
function buildCompositeAtlas(
  raw: RawCustomManifest,
  pageImages: Map<number, HTMLImageElement>,
  builtinCanvas: HTMLCanvasElement,
  builtinManifest: AssetManifest,
): { canvas: HTMLCanvasElement; manifest: AssetManifest } {
  const page0 = pageImages.get(0);
  const page1 = pageImages.get(1);

  const canvas = document.createElement('canvas');
  const p0W = page0 ? page0.naturalWidth : 0;
  const p0H = page0 ? page0.naturalHeight : 0;
  const p1W = page1 ? page1.naturalWidth : 0;
  const p1H = page1 ? page1.naturalHeight : 0;

  const builtW = builtinCanvas.width;
  const builtH = builtinCanvas.height;

  // Stack built-in atlas at (0,0) as guaranteed baseline, then custom pages beside/below it
  // so every logical sprite ID has valid coordinates with zero missing draws!
  const customWidth = Math.max(p0W, p1W);
  const totalW = Math.max(builtW, builtW + customWidth);
  const totalH = Math.max(builtH, p0H + p1H);

  canvas.width = Math.max(1, totalW);
  canvas.height = Math.max(1, totalH);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(builtinCanvas, 0, 0);
    if (page0) {
      ctx.drawImage(page0, builtW, 0);
    }
    if (page1) {
      ctx.drawImage(page1, builtW, p0H);
    }
  }

  // Start with all built-in sprite rects so nothing can ever be blank
  const sprites: Record<string, SpriteRect> = {};
  for (const [id, rect] of Object.entries(builtinManifest.sprites)) {
    sprites[id] = { ...rect };
  }

  // Overlay any custom sprites whose texture page was loaded
  const rawSprites = raw.sprites ?? {};
  for (const [id, entry] of Object.entries(rawSprites)) {
    const pageIdx = entry.texturePage ?? entry.framesMeta?.[0]?.texturePage ?? 0;
    if (!pageImages.has(pageIdx)) continue;
    const offsetX = builtW;
    const offsetY = pageIdx === 1 ? p0H : 0;
    sprites[id] = {
      id,
      x: offsetX + (entry.x ?? 0),
      y: offsetY + (entry.y ?? 0),
      w: Math.max(1, entry.w ?? 16),
      h: Math.max(1, entry.h ?? 16),
      originX: entry.originX ?? Math.floor((entry.w ?? 16) / 2),
      originY: entry.originY ?? Math.floor((entry.h ?? 16) / 2),
      frames: Math.max(1, entry.frames ?? 1),
      frameStrideX: entry.frameStrideX ?? entry.w ?? 16,
    };
  }

  const audio: Record<string, string> = {};
  if (raw.audio) {
    for (const [k, v] of Object.entries(raw.audio)) {
      audio[k] = normalizePackRelativePath(v);
    }
  }

  return {
    canvas,
    manifest: {
      packName: raw.packName ?? 'Owned Custom Pack',
      version: raw.version ?? 1,
      sourceType: 'custom',
      sprites,
      audio,
      paletteCount: raw.paletteCount ?? 38,
    },
  };
}

export async function tryLoadDevMiddlewarePack(
  builtinCanvas: HTMLCanvasElement,
  builtinManifest: AssetManifest,
): Promise<LoadedCustomPack | null> {
  if (!import.meta.env?.DEV || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/custom-pack/manifest.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawCustomManifest;
    const pageImages = new Map<number, HTMLImageElement>();

    const texList = raw.textures ?? [
      { index: 0, path: 'textures/txtr_0.png' },
      { index: 1, path: 'textures/txtr_1.png' },
    ];
    for (const tex of texList) {
      const rel = normalizePackRelativePath(tex.path);
      try {
        const imgRes = await fetch(`/custom-pack/${rel}`, { cache: 'no-store' });
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          pageImages.set(tex.index, await blobToImage(blob));
        }
      } catch {
        // Optional page missing
      }
    }

    if (pageImages.size === 0) return null;
    const { canvas, manifest } = buildCompositeAtlas(raw, pageImages, builtinCanvas, builtinManifest);

    const audioCache = new Map<string, ArrayBuffer | null>();
    const audioFetcher = async (logicalId: string): Promise<ArrayBuffer | null> => {
      if (audioCache.has(logicalId)) {
        return audioCache.get(logicalId) ?? null;
      }
      const rel = manifest.audio[logicalId];
      if (!rel) {
        audioCache.set(logicalId, null);
        return null;
      }
      try {
        const audioRes = await fetch(`/custom-pack/${normalizePackRelativePath(rel)}`);
        if (!audioRes.ok) {
          audioCache.set(logicalId, null);
          return null;
        }
        const buf = await audioRes.arrayBuffer();
        audioCache.set(logicalId, buf);
        return buf;
      } catch {
        audioCache.set(logicalId, null);
        return null;
      }
    };

    return {
      source: 'dev-middleware',
      manifest,
      atlasCanvas: canvas,
      audioFetcher,
    };
  } catch {
    return null;
  }
}

export async function tryLoadIndexedDbPack(
  builtinCanvas: HTMLCanvasElement,
  builtinManifest: AssetManifest,
): Promise<LoadedCustomPack | null> {
  const db = await openPackDb();
  if (!db) return null;
  try {
    const manifestText = await idbGet<string>(db, 'manifest.json');
    if (!manifestText) return null;
    const raw = JSON.parse(manifestText) as RawCustomManifest;
    const pageImages = new Map<number, HTMLImageElement>();

    const texList = raw.textures ?? [
      { index: 0, path: 'textures/txtr_0.png' },
      { index: 1, path: 'textures/txtr_1.png' },
    ];
    for (const tex of texList) {
      const rel = normalizePackRelativePath(tex.path);
      const blob = await idbGet<Blob>(db, rel);
      if (blob) {
        pageImages.set(tex.index, await blobToImage(blob));
      }
    }
    if (pageImages.size === 0) return null;

    const { canvas, manifest } = buildCompositeAtlas(raw, pageImages, builtinCanvas, builtinManifest);
    const audioFetcher = async (logicalId: string): Promise<ArrayBuffer | null> => {
      const rel = manifest.audio[logicalId];
      if (!rel) return null;
      const blob = await idbGet<Blob>(db, normalizePackRelativePath(rel));
      return blob ? blob.arrayBuffer() : null;
    };

    return {
      source: 'indexeddb',
      manifest,
      atlasCanvas: canvas,
      audioFetcher,
    };
  } catch {
    return null;
  }
}

export async function importCustomPackFiles(
  files: FileList | readonly File[],
  builtinCanvas: HTMLCanvasElement,
  builtinManifest: AssetManifest,
): Promise<LoadedCustomPack | null> {
  const fileMap = new Map<string, File>();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f) continue;
    const rawRel =
      ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/');
    const parts = rawRel.split('/');
    // Strip leading folder name (e.g. ".krunked-well-assets/manifest.json" -> "manifest.json")
    const normalized = parts.length > 1 ? parts.slice(1).join('/') : rawRel;
    fileMap.set(normalized, f);
  }

  const manifestFile = fileMap.get('manifest.json');
  if (!manifestFile) {
    return null;
  }

  const manifestText = await manifestFile.text();
  const raw = JSON.parse(manifestText) as RawCustomManifest;

  const db = await openPackDb();
  if (db) {
    await idbClear(db);
    await idbPut(db, 'manifest.json', manifestText);
    for (const [rel, f] of fileMap.entries()) {
      if (rel === 'manifest.json') continue;
      if (rel.endsWith('.png') || rel.endsWith('.ogg') || rel.endsWith('.wav')) {
        await idbPut(db, rel, f);
      }
    }
  }

  const pageImages = new Map<number, HTMLImageElement>();
  const texList = raw.textures ?? [
    { index: 0, path: 'textures/txtr_0.png' },
    { index: 1, path: 'textures/txtr_1.png' },
  ];
  for (const tex of texList) {
    const rel = normalizePackRelativePath(tex.path);
    const f = fileMap.get(rel);
    if (f) {
      pageImages.set(tex.index, await blobToImage(f));
    }
  }

  if (pageImages.size === 0) return null;
  const { canvas, manifest } = buildCompositeAtlas(raw, pageImages, builtinCanvas, builtinManifest);

  const audioFetcher = async (logicalId: string): Promise<ArrayBuffer | null> => {
    const rel = manifest.audio[logicalId];
    if (!rel) return null;
    const f = fileMap.get(normalizePackRelativePath(rel));
    return f ? f.arrayBuffer() : null;
  };

  return {
    source: 'indexeddb',
    manifest,
    atlasCanvas: canvas,
    audioFetcher,
  };
}

export function promptFolderPicker(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;

    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener('change', () => {
      if (settled) return;
      settled = true;
      const files = input.files;
      cleanup();
      resolve(files && files.length > 0 ? files : null);
    });

    input.addEventListener('cancel', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    });

    input.click();
  });
}
