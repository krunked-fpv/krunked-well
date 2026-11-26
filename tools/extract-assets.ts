import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import type { AssetManifest, SpriteRect } from '../src/contracts/index.js';
import {
  extractPalettes,
  parseAudoChunk,
  parseDataWin,
  resolveSourceDir,
  type AudoBlob,
  type SpriteBbox,
  type TextureEntry,
} from './oracle-dump.js';

// ============================================================================
// Krunked Well — Read-Only Asset Extractor (Textures, Audio, Manifest)
// Zero extra npm dependencies. Pure-TypeScript BZip2 + GM QOI + PNG encoder.
// Strictly read-only on the source game directory. Outputs ONLY to
// <cwd>/.krunked-well-assets/ (gitignored).
// ============================================================================

export interface ExtractedFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  boundW: number;
  boundH: number;
  sheetId: number;
}

export interface ExtractedSpriteRect extends SpriteRect {
  sheetId: number;
  texturePage: string;
  canvasW: number;
  canvasH: number;
  targetX: number;
  targetY: number;
  bbox: SpriteBbox;
  frameRects: ExtractedFrameRect[];
}

export interface ExtractedAssetManifest extends AssetManifest {
  texturePages: string[];
  sprites: Record<string, ExtractedSpriteRect>;
}

// ============================================================================
// Pure-TypeScript BZip2 Decompressor (for GMS 2022.5+ '2zoq' Texture Pages)
// ============================================================================

function decompressBzip2(input: Buffer): Buffer {
  let bytePos = 0;
  let bitBuf = 0;
  let bitCount = 0;

  const readBits = (n: number): number => {
    while (bitCount < n) {
      if (bytePos >= input.length) {
        throw new Error('Unexpected EOF in bzip2 stream');
      }
      bitBuf = (bitBuf << 8) | input.readUInt8(bytePos++);
      bitCount += 8;
    }
    bitCount -= n;
    return (bitBuf >>> bitCount) & ((1 << n) - 1);
  };

  const readBit = (): number => {
    if (bitCount === 0) {
      if (bytePos >= input.length) {
        throw new Error('Unexpected EOF in bzip2 stream');
      }
      bitBuf = input.readUInt8(bytePos++);
      bitCount = 8;
    }
    bitCount--;
    return (bitBuf >>> bitCount) & 1;
  };

  if (readBits(8) !== 0x42 || readBits(8) !== 0x5a || readBits(8) !== 0x68) {
    throw new Error('Invalid bzip2 stream magic');
  }
  const blockSize100k = readBits(8) - 0x30;
  if (blockSize100k < 1 || blockSize100k > 9) {
    throw new Error(`Invalid bzip2 block size: ${blockSize100k}`);
  }
  const maxBlockSize = blockSize100k * 100_000;
  const outChunks: Buffer[] = [];

  for (;;) {
    const h1 = readBits(24);
    const h2 = readBits(24);
    if (h1 === 0x177245 && h2 === 0x385090) {
      break; // End of stream
    }
    if (h1 !== 0x314159 || h2 !== 0x265359) {
      throw new Error(`Invalid bzip2 block header: 0x${h1.toString(16)} 0x${h2.toString(16)}`);
    }

    // Skip 32-bit block CRC
    readBits(16);
    readBits(16);
    if (readBit() !== 0) {
      throw new Error('Randomised bzip2 blocks are not supported');
    }
    const origPtr = readBits(24);

    // Build symbol map
    const inUse16 = readBits(16);
    const seqToUnseq: number[] = [];
    for (let i = 0; i < 16; i++) {
      if ((inUse16 & (1 << (15 - i))) !== 0) {
        const sub = readBits(16);
        for (let j = 0; j < 16; j++) {
          if ((sub & (1 << (15 - j))) !== 0) {
            seqToUnseq.push(i * 16 + j);
          }
        }
      }
    }
    const alphaSize = seqToUnseq.length + 2;
    const eob = seqToUnseq.length + 1;

    const nGroups = readBits(3);
    const nSelectors = readBits(15);

    const selectorMtf = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i++) {
      let j = 0;
      while (readBit() === 1) j++;
      selectorMtf[i] = j;
    }

    // Undo MTF on selectors
    const pos = new Uint8Array(nGroups);
    for (let v = 0; v < nGroups; v++) pos[v] = v;
    const selector = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i++) {
      let v = selectorMtf[i] ?? 0;
      const tmp = pos[v] ?? 0;
      while (v > 0) {
        pos[v] = pos[v - 1] ?? 0;
        v--;
      }
      pos[0] = tmp;
      selector[i] = tmp;
    }

    // Build canonical Huffman decoding tables
    const limit: Int32Array[] = [];
    const base: Int32Array[] = [];
    const perm: Int32Array[] = [];
    const minLens = new Int32Array(nGroups);

    for (let t = 0; t < nGroups; t++) {
      const len = new Int32Array(alphaSize);
      let curr = readBits(5);
      let minLen = 23;
      let maxLen = 0;
      for (let i = 0; i < alphaSize; i++) {
        while (readBit() === 1) {
          curr += readBit() === 0 ? 1 : -1;
        }
        len[i] = curr;
        if (curr < minLen) minLen = curr;
        if (curr > maxLen) maxLen = curr;
      }
      minLens[t] = minLen;

      const lim = new Int32Array(24);
      const bas = new Int32Array(24);
      const prm = new Int32Array(alphaSize);

      let pp = 0;
      for (let i = minLen; i <= maxLen; i++) {
        for (let j = 0; j < alphaSize; j++) {
          if (len[j] === i) prm[pp++] = j;
        }
      }
      for (let i = 0; i < alphaSize; i++) {
        const li = (len[i] ?? 0) + 1;
        bas[li] = (bas[li] ?? 0) + 1;
      }
      for (let i = 1; i < 24; i++) {
        bas[i] = (bas[i] ?? 0) + (bas[i - 1] ?? 0);
      }
      let vec = 0;
      for (let i = minLen; i <= maxLen; i++) {
        vec += (bas[i + 1] ?? 0) - (bas[i] ?? 0);
        lim[i] = vec - 1;
        vec <<= 1;
      }
      for (let i = minLen + 1; i <= maxLen; i++) {
        bas[i] = (((lim[i - 1] ?? 0) + 1) << 1) - (bas[i] ?? 0);
      }
      limit.push(lim);
      base.push(bas);
      perm.push(prm);
    }

    // Decode Huffman + MTF + RLE2 into BWT table
    const mtf = new Uint8Array(256);
    for (let i = 0; i < 256; i++) mtf[i] = i;

    const cftab = new Int32Array(256);
    const tt = new Uint32Array(maxBlockSize + 10);
    let nblock = 0;

    let groupNo = -1;
    let groupPos = 0;
    let gMinLen = 0;
    let gLimit = limit[0] ?? new Int32Array(24);
    let gBase = base[0] ?? new Int32Array(24);
    let gPerm = perm[0] ?? new Int32Array(alphaSize);

    const nextSym = (): number => {
      if (groupPos === 0) {
        groupNo++;
        groupPos = 50;
        const gSel = selector[groupNo] ?? 0;
        gMinLen = minLens[gSel] ?? 0;
        gLimit = limit[gSel] ?? gLimit;
        gBase = base[gSel] ?? gBase;
        gPerm = perm[gSel] ?? gPerm;
      }
      groupPos--;
      let zn = gMinLen;
      let zvec = readBits(zn);
      while (zvec > (gLimit[zn] ?? 0)) {
        zn++;
        zvec = (zvec << 1) | readBit();
      }
      return gPerm[zvec - (gBase[zn] ?? 0)] ?? 0;
    };

    let sym = nextSym();
    while (sym !== eob) {
      if (sym === 0 || sym === 1) {
        let runLen = 0;
        let shift = 0;
        while (sym === 0 || sym === 1) {
          runLen += (sym + 1) << shift;
          shift++;
          sym = nextSym();
        }
        const uc = seqToUnseq[mtf[0] ?? 0] ?? 0;
        cftab[uc] = (cftab[uc] ?? 0) + runLen;
        while (runLen-- > 0) {
          tt[nblock++] = uc;
        }
      } else {
        const idx = sym - 1;
        const tmp = mtf[idx] ?? 0;
        for (let k = idx; k > 0; k--) {
          mtf[k] = mtf[k - 1] ?? 0;
        }
        mtf[0] = tmp;
        const uc = seqToUnseq[tmp] ?? 0;
        cftab[uc] = (cftab[uc] ?? 0) + 1;
        tt[nblock++] = uc;
        sym = nextSym();
      }
    }

    // Inverse Burrows-Wheeler Transform
    const cumul = new Int32Array(257);
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      cumul[i] = sum;
      sum += cftab[i] ?? 0;
    }
    for (let i = 0; i < nblock; i++) {
      const uc = (tt[i] ?? 0) & 0xff;
      const dst = cumul[uc] ?? 0;
      tt[dst] = (tt[dst] ?? 0) | (i << 8);
      cumul[uc] = dst + 1;
    }

    // Undo RLE1
    const blockOut: number[] = [];
    let tPos = (tt[origPtr] ?? 0) >>> 8;
    let count = 0;
    let prev = -1;
    let run = 0;
    while (count < nblock) {
      const entry = tt[tPos] ?? 0;
      const ch = entry & 0xff;
      tPos = entry >>> 8;
      count++;
      if (run === 4) {
        for (let r = 0; r < ch; r++) blockOut.push(prev);
        prev = -1;
        run = 0;
      } else {
        blockOut.push(ch);
        if (ch === prev) {
          run++;
        } else {
          prev = ch;
          run = 1;
        }
      }
    }
    outChunks.push(Buffer.from(blockOut));
  }

  return Buffer.concat(outChunks);
}

// ============================================================================
// Pure-TypeScript GM Custom QOI ('fioq') Decoder -> Raw RGBA
// ============================================================================

function decodeGmQoi(qoi: Buffer): { width: number; height: number; rgba: Uint8Array } {
  const magic = qoi.toString('ascii', 0, 4);
  if (magic !== 'fioq') {
    throw new Error(`Expected GM QOI 'fioq' header, got '${magic}'`);
  }
  const width = qoi.readUInt16LE(4);
  const height = qoi.readUInt16LE(6);
  const dataLen = qoi.readUInt32LE(8);
  const rgba = new Uint8Array(width * height * 4);
  const index = new Uint8Array(64 * 4);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let run = 0;
  let pos = 12;
  const end = Math.min(qoi.length, 12 + dataLen);
  const totalPixels = width * height;

  for (let px = 0; px < totalPixels; px++) {
    if (run > 0) {
      run--;
    } else if (pos < end) {
      const b1 = qoi.readUInt8(pos++);
      if ((b1 & 0xc0) === 0x00) {
        const i4 = (b1 & 0x3f) * 4;
        r = index[i4] ?? 0;
        g = index[i4 + 1] ?? 0;
        b = index[i4 + 2] ?? 0;
        a = index[i4 + 3] ?? 0;
      } else if ((b1 & 0xe0) === 0x40) {
        run = b1 & 0x1f;
      } else if ((b1 & 0xe0) === 0x60) {
        const b2 = qoi.readUInt8(pos++);
        run = (((b1 & 0x1f) << 8) | b2) + 32;
      } else if ((b1 & 0xc0) === 0x80) {
        r = (r + ((b1 >> 4) & 3) - 2) & 0xff;
        g = (g + ((b1 >> 2) & 3) - 2) & 0xff;
        b = (b + (b1 & 3) - 2) & 0xff;
      } else if ((b1 & 0xe0) === 0xc0) {
        const b2 = qoi.readUInt8(pos++);
        r = (r + (b1 & 0x1f) - 16) & 0xff;
        g = (g + ((b2 >> 4) & 0x0f) - 8) & 0xff;
        b = (b + (b2 & 0x0f) - 8) & 0xff;
      } else if ((b1 & 0xf0) === 0xe0) {
        const b2 = qoi.readUInt8(pos++);
        const b3 = qoi.readUInt8(pos++);
        const merged = (b1 << 16) | (b2 << 8) | b3;
        r = (r + ((merged >> 15) & 0x1f) - 16) & 0xff;
        g = (g + ((merged >> 10) & 0x1f) - 16) & 0xff;
        b = (b + ((merged >> 5) & 0x1f) - 16) & 0xff;
        a = (a + (merged & 0x1f) - 16) & 0xff;
      } else {
        if ((b1 & 8) !== 0) r = qoi.readUInt8(pos++);
        if ((b1 & 4) !== 0) g = qoi.readUInt8(pos++);
        if ((b1 & 2) !== 0) b = qoi.readUInt8(pos++);
        if ((b1 & 1) !== 0) a = qoi.readUInt8(pos++);
      }
      const h4 = ((r ^ g ^ b ^ a) & 0x3f) * 4;
      index[h4] = r;
      index[h4 + 1] = g;
      index[h4 + 2] = b;
      index[h4 + 3] = a;
    }

    const o = px * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
  }

  return { width, height, rgba };
}

// ============================================================================
// Pure-TypeScript PNG Encoder (using Node built-in zlib)
// ============================================================================

const CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC32_TABLE[(c ^ buf.readUInt8(i)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // deflate
  ihdr.writeUInt8(0, 11); // standard filter
  ihdr.writeUInt8(0, 12); // no interlace

  const rowStride = width * 4;
  const raw = Buffer.allocUnsafe(height * (1 + rowStride));
  for (let y = 0; y < height; y++) {
    const dstOff = y * (1 + rowStride);
    raw.writeUInt8(0, dstOff); // Filter type 0 (None)
    const srcOff = y * rowStride;
    raw.set(rgba.subarray(srcOff, srcOff + rowStride), dstOff + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function extractTextureToPng(dataWinBuf: Buffer, tex: TextureEntry): Buffer {
  const blob = dataWinBuf.subarray(tex.dataOffset, tex.dataOffset + tex.dataLength);
  if (tex.format === 'png') {
    return Buffer.from(blob);
  }
  if (tex.format === 'bz2-qoi') {
    const qoiBuf = decompressBzip2(blob.subarray(12));
    const { width, height, rgba } = decodeGmQoi(qoiBuf);
    return encodePngRgba(width, height, rgba);
  }
  if (tex.format === 'qoi') {
    const { width, height, rgba } = decodeGmQoi(blob);
    return encodePngRgba(width, height, rgba);
  }
  throw new Error(`Unsupported TXTR[${tex.index}] format: ${tex.format}`);
}

// ============================================================================
// Main Asset Extractor
// ============================================================================

export function extractAllAssets(sourceDir: string, outDir: string): ExtractedAssetManifest {
  const dataWinPath = path.join(sourceDir, 'data.win');
  const buf = fs.readFileSync(dataWinPath);
  const parsed = parseDataWin(buf);

  const texDir = path.join(outDir, 'textures');
  const audioDir = path.join(outDir, 'audio');
  fs.mkdirSync(texDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  // 1. Extract all TXTR texture pages as PNGs
  const texturePages: string[] = [];
  for (const tex of parsed.textures) {
    const pngBuf = extractTextureToPng(buf, tex);
    const relPath = `textures/txtr_${tex.index}.png`;
    fs.writeFileSync(path.join(outDir, relPath), pngBuf);
    texturePages.push(relPath);
  }

  // 2. Load AUDO blobs from data.win (group 0) and audiogroup1..6.dat
  const audioGroupBlobs = new Map<number, AudoBlob[]>();
  audioGroupBlobs.set(0, parsed.audoBlobs);

  for (let g = 1; g < parsed.audioGroups.length; g++) {
    const agPath = path.join(sourceDir, `audiogroup${g}.dat`);
    if (fs.existsSync(agPath)) {
      const agBuf = fs.readFileSync(agPath);
      audioGroupBlobs.set(g, parseAudoChunk(agBuf));
    }
  }

  // Build case-insensitive lookup of loose files in sourceDir (strictly read-only)
  const looseFilesByLower = new Map<string, string>();
  for (const entry of fs.readdirSync(sourceDir)) {
    looseFilesByLower.set(entry.toLowerCase(), path.join(sourceDir, entry));
  }

  // 3. Extract all sounds referenced by SOND + loose .ogg files
  const audioManifest: Record<string, string> = {};
  const copiedLoose = new Set<string>();

  for (const sound of parsed.sounds) {
    if (sound.audioId >= 0) {
      const groupBlobs = audioGroupBlobs.get(sound.groupId);
      const blob = groupBlobs?.[sound.audioId];
      if (!blob) continue;
      const ext = blob.format === 'ogg' ? 'ogg' : 'wav';
      const relPath = `audio/${sound.name}.${ext}`;
      fs.writeFileSync(path.join(outDir, relPath), blob.data);
      audioManifest[sound.name] = relPath;
    } else if (sound.file.length > 0) {
      const candidate = looseFilesByLower.get(sound.file.toLowerCase());
      if (candidate && fs.existsSync(candidate)) {
        const ext = path.extname(candidate).toLowerCase().replace(/^\./, '') || 'ogg';
        const relPath = `audio/${sound.name}.${ext}`;
        fs.copyFileSync(candidate, path.join(outDir, relPath));
        audioManifest[sound.name] = relPath;
        copiedLoose.add(sound.file.toLowerCase());
      }
    }
  }

  // Ensure any remaining loose .ogg files (e.g., amb1.ogg, sfxbossfirsthit.ogg, sfxfalling.ogg) are also copied
  for (const [lowerName, fullPath] of looseFilesByLower.entries()) {
    if (!lowerName.endsWith('.ogg') || copiedLoose.has(lowerName)) continue;
    const baseName = path.basename(fullPath, path.extname(fullPath));
    const relPath = `audio/${baseName}.ogg`;
    fs.copyFileSync(fullPath, path.join(outDir, relPath));
    if (!(baseName in audioManifest)) {
      audioManifest[baseName] = relPath;
    }
  }

  // 4. Build sprite manifest matching AssetManifest / SpriteRect contract
  const spritesManifest: Record<string, ExtractedSpriteRect> = {};
  for (const spr of parsed.sprites) {
    const f0 = spr.frames[0];
    if (!f0) continue;
    const f1 = spr.frames[1];
    const frameStrideX =
      f1 && f1.sheetId === f0.sheetId && f1.sourceY === f0.sourceY
        ? Math.max(0, f1.sourceX - f0.sourceX)
        : 0;
    const sheetId = f0.sheetId;
    const texturePage = texturePages[sheetId] ?? `textures/txtr_${sheetId}.png`;

    spritesManifest[spr.name] = {
      id: spr.name,
      x: f0.sourceX,
      y: f0.sourceY,
      w: f0.sourceW,
      h: f0.sourceH,
      originX: spr.originX,
      originY: spr.originY,
      frames: spr.frames.length,
      frameStrideX,
      sheetId,
      texturePage,
      canvasW: spr.width,
      canvasH: spr.height,
      targetX: f0.targetX,
      targetY: f0.targetY,
      bbox: spr.bbox,
      frameRects: spr.frames.map((fr) => ({
        x: fr.sourceX,
        y: fr.sourceY,
        w: fr.sourceW,
        h: fr.sourceH,
        targetX: fr.targetX,
        targetY: fr.targetY,
        targetW: fr.targetW,
        targetH: fr.targetH,
        boundW: fr.boundW,
        boundH: fr.boundH,
        sheetId: fr.sheetId,
      })),
    };
  }

  const palettes = extractPalettes(parsed);
  const primaryAtlas =
    spritesManifest['sprPlayerIdle']?.texturePage ?? texturePages[texturePages.length - 1] ?? 'textures/txtr_0.png';

  const manifest: ExtractedAssetManifest = {
    packName: 'krunked-well-extracted',
    version: 1,
    sourceType: 'custom',
    atlasImageUrl: primaryAtlas,
    texturePages,
    sprites: spritesManifest,
    audio: audioManifest,
    paletteCount: palettes.length,
  };

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  return manifest;
}

function runExtractCli(): void {
  const strict = process.argv.includes('--strict') || process.env.KRUNKED_REQUIRE_SOURCE === '1';
  const sourceDir = resolveSourceDir();
  const dataWinPath = path.join(sourceDir, 'data.win');

  if (!fs.existsSync(dataWinPath)) {
    console.warn(
      `[extract-assets] Source data.win not found at "${sourceDir}". Set KRUNKED_SOURCE_DIR to extract optional local assets. Skipping cleanly.`,
    );
    if (strict) {
      process.exitCode = 1;
    }
    return;
  }

  const outDir = path.resolve(process.cwd(), '.krunked-well-assets');
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = extractAllAssets(sourceDir, outDir);
  console.log(
    `[extract-assets] Wrote ${path.join(outDir, 'manifest.json')} | ` +
      `textures=${manifest.texturePages.length} sprites=${Object.keys(manifest.sprites).length} ` +
      `audio=${Object.keys(manifest.audio).length} palettes=${manifest.paletteCount}`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runExtractCli();
}
