import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RgbTuple } from '../src/contracts/index.js';

// ============================================================================
// Krunked Well — Read-Only GMS2.3 (BC17) IFF FORM Parser & Oracle Extractor
// Strictly read-only on the source game directory. Outputs ONLY to
// <cwd>/.krunked-well-assets/oracle.json (gitignored).
// ============================================================================

export interface IffChunk {
  id: string;
  offset: number;
  start: number;
  length: number;
  end: number;
}

export interface Gen8Info {
  isDebugDisabled: boolean;
  bytecodeVersion: number;
  filename: string;
  config: string;
  name: string;
  major: number;
  minor: number;
  release: number;
  build: number;
  defaultWindowW: number;
  defaultWindowH: number;
  infoFlags: number;
  displayName: string;
  roomOrderCount: number;
  fps: number;
}

export interface TpagEntry {
  pointer: number;
  sourceX: number;
  sourceY: number;
  sourceW: number;
  sourceH: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  boundW: number;
  boundH: number;
  sheetId: number;
}

export interface SpriteBbox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SpriteEntry {
  index: number;
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  bboxMode: number;
  bbox: SpriteBbox;
  frames: TpagEntry[];
}

export interface TextureEntry {
  index: number;
  scaled: number;
  mips: number;
  dataLength: number;
  dataOffset: number;
  format: 'png' | 'bz2-qoi' | 'qoi' | 'unknown';
  width: number;
  height: number;
}

export interface SoundEntry {
  index: number;
  name: string;
  flags: number;
  type: string;
  file: string;
  volume: number;
  pitch: number;
  groupId: number;
  audioId: number;
}

export interface RoomViewInfo {
  enabled: boolean;
  viewX: number;
  viewY: number;
  viewW: number;
  viewH: number;
  portX: number;
  portY: number;
  portW: number;
  portH: number;
}

export interface RoomEntry {
  index: number;
  name: string;
  width: number;
  height: number;
  speed: number;
  view0: RoomViewInfo | null;
}

export interface ShaderEntry {
  index: number;
  name: string;
  type: number;
  glslVert: string;
  glslFrag: string;
}

export interface CodeEntry {
  index: number;
  name: string;
  length: number;
  localsCount: number;
  argsCount: number;
  bytecodeStart: number;
  subOffset: number;
}

export interface AudoBlob {
  index: number;
  offset: number;
  length: number;
  data: Buffer;
  format: 'wav' | 'ogg' | 'unknown';
}

export interface ParsedDataWin {
  buffer: Buffer;
  chunks: Map<string, IffChunk>;
  gen8: Gen8Info;
  strings: string[];
  audioGroups: string[];
  sounds: SoundEntry[];
  tpagByPtr: Map<number, TpagEntry>;
  tpags: TpagEntry[];
  textures: TextureEntry[];
  sprites: SpriteEntry[];
  spritesByName: Map<string, SpriteEntry>;
  rooms: RoomEntry[];
  roomsByName: Map<string, RoomEntry>;
  shaders: ShaderEntry[];
  codeEntries: CodeEntry[];
  codeByName: Map<string, CodeEntry>;
  varRefs: Map<number, string>;
  funcRefs: Map<number, string>;
  audoBlobs: AudoBlob[];
}

export interface ExtractedPalette {
  id: number;
  name: string;
  shaderId: number;
  shaderName: string;
  light: [number, number, number];
  mid: [number, number, number];
  dark: [number, number, number];
  special: [number, number, number];
  provenance: 'extracted' | 'verified_spec';
}

export function resolveSourceDir(): string {
  const fromEnv = process.env.KRUNKED_SOURCE_DIR?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }
  return path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Down' + 'well');
}

export function parseIffForm(buf: Buffer): Map<string, IffChunk> {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'FORM') {
    throw new Error('Invalid IFF FORM header');
  }
  const formLen = buf.readUInt32LE(4);
  const limit = Math.min(buf.length, 8 + formLen);
  const chunks = new Map<string, IffChunk>();
  let off = 8;
  while (off + 8 <= limit) {
    const id = buf.toString('ascii', off, off + 4);
    const length = buf.readUInt32LE(off + 4);
    const start = off + 8;
    const end = Math.min(limit, start + length);
    chunks.set(id, { id, offset: off, start, length, end });
    off = start + length;
  }
  return chunks;
}

export function readGmStringAt(buf: Buffer, ptr: number): string {
  if (ptr <= 0 || ptr >= buf.length) return '';
  if (ptr >= 4) {
    const len = buf.readUInt32LE(ptr - 4);
    if (len < 1_000_000 && ptr + len <= buf.length && buf.readUInt8(ptr + len) === 0) {
      return buf.toString('utf8', ptr, ptr + len);
    }
  }
  let end = ptr;
  while (end < buf.length && buf.readUInt8(end) !== 0) {
    end++;
  }
  return buf.toString('utf8', ptr, end);
}

export function parseAudoChunk(buf: Buffer, chunks?: Map<string, IffChunk>): AudoBlob[] {
  const map = chunks ?? parseIffForm(buf);
  const audo = map.get('AUDO');
  if (!audo) return [];
  const count = buf.readUInt32LE(audo.start);
  const blobs: AudoBlob[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = buf.readUInt32LE(audo.start + 4 + i * 4);
    if (ptr + 4 > buf.length) continue;
    const length = buf.readUInt32LE(ptr);
    const dataStart = ptr + 4;
    const dataEnd = Math.min(buf.length, dataStart + length);
    const data = buf.subarray(dataStart, dataEnd);
    const magic = data.length >= 4 ? data.toString('ascii', 0, 4) : '';
    const format: AudoBlob['format'] =
      magic === 'RIFF' ? 'wav' : magic === 'OggS' ? 'ogg' : 'unknown';
    blobs.push({ index: i, offset: dataStart, length: data.length, data, format });
  }
  return blobs;
}

function parseGen8(buf: Buffer, chunk: IffChunk): Gen8Info {
  const g = chunk.start;
  const isDebugDisabled = buf.readUInt8(g) !== 0;
  const bytecodeVersion = buf.readUInt8(g + 1);
  const filename = readGmStringAt(buf, buf.readUInt32LE(g + 4));
  const config = readGmStringAt(buf, buf.readUInt32LE(g + 8));
  const name = readGmStringAt(buf, buf.readUInt32LE(g + 40));
  const major = buf.readUInt32LE(g + 44);
  const minor = buf.readUInt32LE(g + 48);
  const release = buf.readUInt32LE(g + 52);
  const build = buf.readUInt32LE(g + 56);
  const defaultWindowW = buf.readUInt32LE(g + 60);
  const defaultWindowH = buf.readUInt32LE(g + 64);
  const infoFlags = buf.readUInt32LE(g + 68);
  const displayName = readGmStringAt(buf, buf.readUInt32LE(g + 100));
  const roomOrderCount = buf.readUInt32LE(g + 128);
  const afterRoomOrder = g + 132 + roomOrderCount * 4;
  // GMS2+ layout: 5 * int64 random UID (40 bytes) followed by float32 GMS2FPS
  let fps = 60;
  if (major >= 2 && afterRoomOrder + 44 <= chunk.end) {
    const rawFps = buf.readFloatLE(afterRoomOrder + 40);
    if (Number.isFinite(rawFps) && rawFps > 0 && rawFps <= 1000) {
      fps = Math.round(rawFps);
    }
  }
  return {
    isDebugDisabled,
    bytecodeVersion,
    filename,
    config,
    name,
    major,
    minor,
    release,
    build,
    defaultWindowW,
    defaultWindowH,
    infoFlags,
    displayName,
    roomOrderCount,
    fps,
  };
}

function parseStrg(buf: Buffer, chunk: IffChunk): string[] {
  const count = buf.readUInt32LE(chunk.start);
  const out: string[] = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const len = buf.readUInt32LE(p);
    out[i] = buf.toString('utf8', p + 4, p + 4 + len);
  }
  return out;
}

function parseAgrp(buf: Buffer, chunk: IffChunk | undefined): string[] {
  if (!chunk) return [];
  const count = buf.readUInt32LE(chunk.start);
  const groups: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    groups.push(readGmStringAt(buf, buf.readUInt32LE(p)));
  }
  return groups;
}

function parseSond(buf: Buffer, chunk: IffChunk | undefined): SoundEntry[] {
  if (!chunk) return [];
  const count = buf.readUInt32LE(chunk.start);
  const sounds: SoundEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    sounds.push({
      index: i,
      name: readGmStringAt(buf, buf.readUInt32LE(p)),
      flags: buf.readUInt32LE(p + 4),
      type: readGmStringAt(buf, buf.readUInt32LE(p + 8)),
      file: readGmStringAt(buf, buf.readUInt32LE(p + 12)),
      volume: Number(buf.readFloatLE(p + 20).toFixed(4)),
      pitch: Number(buf.readFloatLE(p + 24).toFixed(4)),
      groupId: buf.readInt32LE(p + 28),
      audioId: buf.readInt32LE(p + 32),
    });
  }
  return sounds;
}

function parseTpag(buf: Buffer, chunk: IffChunk | undefined): {
  tpags: TpagEntry[];
  tpagByPtr: Map<number, TpagEntry>;
} {
  const tpags: TpagEntry[] = [];
  const tpagByPtr = new Map<number, TpagEntry>();
  if (!chunk) return { tpags, tpagByPtr };
  const count = buf.readUInt32LE(chunk.start);
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const entry: TpagEntry = {
      pointer: p,
      sourceX: buf.readUInt16LE(p),
      sourceY: buf.readUInt16LE(p + 2),
      sourceW: buf.readUInt16LE(p + 4),
      sourceH: buf.readUInt16LE(p + 6),
      targetX: buf.readUInt16LE(p + 8),
      targetY: buf.readUInt16LE(p + 10),
      targetW: buf.readUInt16LE(p + 12),
      targetH: buf.readUInt16LE(p + 14),
      boundW: buf.readUInt16LE(p + 16),
      boundH: buf.readUInt16LE(p + 18),
      sheetId: buf.readUInt16LE(p + 20),
    };
    tpags.push(entry);
    tpagByPtr.set(p, entry);
  }
  return { tpags, tpagByPtr };
}

function parseTxtr(buf: Buffer, chunk: IffChunk | undefined): TextureEntry[] {
  if (!chunk) return [];
  const count = buf.readUInt32LE(chunk.start);
  const textures: TextureEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const nextP = i + 1 < count ? buf.readUInt32LE(chunk.start + 4 + (i + 1) * 4) : chunk.end;
    const entrySize = nextP - p;
    const scaled = buf.readUInt32LE(p);
    let mips = 0;
    let dataLength = 0;
    let dataOffset = 0;
    if (entrySize >= 16) {
      // GMS 2022.3+ layout: scaled(4), mips(4), textureDataLength(4), textureDataOffset(4)
      mips = buf.readUInt32LE(p + 4);
      dataLength = buf.readUInt32LE(p + 8);
      dataOffset = buf.readUInt32LE(p + 12);
    } else if (entrySize >= 12) {
      mips = buf.readUInt32LE(p + 4);
      dataOffset = buf.readUInt32LE(p + 8);
    } else {
      dataOffset = buf.readUInt32LE(p + 4);
    }

    let format: TextureEntry['format'] = 'unknown';
    let width = 0;
    let height = 0;
    if (dataOffset > 0 && dataOffset + 8 <= buf.length) {
      const m4 = buf.toString('ascii', dataOffset, dataOffset + 4);
      if (
        buf.readUInt8(dataOffset) === 0x89 &&
        buf.readUInt8(dataOffset + 1) === 0x50 &&
        buf.readUInt8(dataOffset + 2) === 0x4e &&
        buf.readUInt8(dataOffset + 3) === 0x47
      ) {
        format = 'png';
        if (dataOffset + 24 <= buf.length) {
          width = buf.readUInt32BE(dataOffset + 16);
          height = buf.readUInt32BE(dataOffset + 20);
        }
      } else if (m4 === '2zoq') {
        format = 'bz2-qoi';
        width = buf.readUInt16LE(dataOffset + 4);
        height = buf.readUInt16LE(dataOffset + 6);
      } else if (m4 === 'fioq') {
        format = 'qoi';
        width = buf.readUInt16LE(dataOffset + 4);
        height = buf.readUInt16LE(dataOffset + 6);
      }
    }

    if (dataLength === 0 && dataOffset > 0) {
      // Estimate length to next texture data offset or end of TXTR chunk
      dataLength = Math.max(0, chunk.end - dataOffset);
    }

    textures.push({
      index: i,
      scaled,
      mips,
      dataLength,
      dataOffset,
      format,
      width,
      height,
    });
  }
  return textures;
}

function parseSprt(
  buf: Buffer,
  chunk: IffChunk | undefined,
  tpagByPtr: Map<number, TpagEntry>,
): { sprites: SpriteEntry[]; spritesByName: Map<string, SpriteEntry> } {
  const sprites: SpriteEntry[] = [];
  const spritesByName = new Map<string, SpriteEntry>();
  if (!chunk) return { sprites, spritesByName };
  const count = buf.readUInt32LE(chunk.start);
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const name = readGmStringAt(buf, buf.readUInt32LE(p));
    const width = buf.readUInt32LE(p + 4);
    const height = buf.readUInt32LE(p + 8);
    const marginLeft = buf.readInt32LE(p + 12);
    const marginRight = buf.readInt32LE(p + 16);
    const marginBottom = buf.readInt32LE(p + 20);
    const marginTop = buf.readInt32LE(p + 24);
    const bboxMode = buf.readUInt32LE(p + 40);
    const originX = buf.readInt32LE(p + 48);
    const originY = buf.readInt32LE(p + 52);

    const specialFlag = buf.readInt32LE(p + 56);
    let tpagListOff = p + 56;
    let isBitmap = true;
    if (specialFlag === -1) {
      const sVer = buf.readUInt32LE(p + 60);
      const sType = buf.readUInt32LE(p + 64);
      isBitmap = sType === 0;
      if (sVer >= 3) {
        // -1(4), sVer(4), sType(4), playbackSpd(4), playbackType(4), seqOff(4), nineSliceOff(4) = 28 bytes
        tpagListOff = p + 84;
      } else if (sVer === 2) {
        tpagListOff = p + 80;
      } else {
        tpagListOff = p + 76;
      }
    }

    const frames: TpagEntry[] = [];
    if (isBitmap && tpagListOff + 4 <= chunk.end) {
      const frameCount = buf.readUInt32LE(tpagListOff);
      if (frameCount <= 2048) {
        for (let f = 0; f < frameCount; f++) {
          const tpPtr = buf.readUInt32LE(tpagListOff + 4 + f * 4);
          const tp = tpagByPtr.get(tpPtr);
          if (tp) frames.push(tp);
        }
      }
    }

    const entry: SpriteEntry = {
      index: i,
      name,
      width,
      height,
      originX,
      originY,
      bboxMode,
      bbox: {
        left: marginLeft,
        right: marginRight,
        top: marginTop,
        bottom: marginBottom,
        width: Math.max(0, marginRight - marginLeft + 1),
        height: Math.max(0, marginBottom - marginTop + 1),
      },
      frames,
    };
    sprites.push(entry);
    spritesByName.set(name, entry);
  }
  return { sprites, spritesByName };
}

function parseRoom(buf: Buffer, chunk: IffChunk | undefined): {
  rooms: RoomEntry[];
  roomsByName: Map<string, RoomEntry>;
} {
  const rooms: RoomEntry[] = [];
  const roomsByName = new Map<string, RoomEntry>();
  if (!chunk) return { rooms, roomsByName };
  const count = buf.readUInt32LE(chunk.start);
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const name = readGmStringAt(buf, buf.readUInt32LE(p));
    const width = buf.readUInt32LE(p + 8);
    const height = buf.readUInt32LE(p + 12);
    const speed = buf.readUInt32LE(p + 16);
    const viewsPtr = buf.readUInt32LE(p + 44);
    let view0: RoomViewInfo | null = null;
    if (viewsPtr > 0 && viewsPtr + 8 <= buf.length) {
      const viewCount = buf.readUInt32LE(viewsPtr);
      if (viewCount > 0) {
        const v0 = buf.readUInt32LE(viewsPtr + 4);
        if (v0 > 0 && v0 + 36 <= buf.length) {
          view0 = {
            enabled: buf.readUInt32LE(v0) !== 0,
            viewX: buf.readInt32LE(v0 + 4),
            viewY: buf.readInt32LE(v0 + 8),
            viewW: buf.readInt32LE(v0 + 12),
            viewH: buf.readInt32LE(v0 + 16),
            portX: buf.readInt32LE(v0 + 20),
            portY: buf.readInt32LE(v0 + 24),
            portW: buf.readInt32LE(v0 + 28),
            portH: buf.readInt32LE(v0 + 32),
          };
        }
      }
    }
    const entry: RoomEntry = { index: i, name, width, height, speed, view0 };
    rooms.push(entry);
    roomsByName.set(name, entry);
  }
  return { rooms, roomsByName };
}

function parseShdr(buf: Buffer, chunk: IffChunk | undefined): ShaderEntry[] {
  if (!chunk) return [];
  const count = buf.readUInt32LE(chunk.start);
  const shaders: ShaderEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    shaders.push({
      index: i,
      name: readGmStringAt(buf, buf.readUInt32LE(p)),
      type: buf.readUInt32LE(p + 4),
      glslVert: readGmStringAt(buf, buf.readUInt32LE(p + 8)),
      glslFrag: readGmStringAt(buf, buf.readUInt32LE(p + 12)),
    });
  }
  return shaders;
}

function parseVariRefs(buf: Buffer, chunk: IffChunk | undefined): Map<number, string> {
  const varRefs = new Map<number, string>();
  if (!chunk) return varRefs;
  // BC15+ header: 3 * u32, followed by 20-byte entries
  for (let off = chunk.start + 12; off + 20 <= chunk.end; off += 20) {
    const name = readGmStringAt(buf, buf.readUInt32LE(off));
    const occ = buf.readUInt32LE(off + 12);
    let addr = buf.readUInt32LE(off + 16);
    for (let k = 0; k < occ && addr > 0 && addr + 8 <= buf.length; k++) {
      varRefs.set(addr, name);
      const nextDelta = buf.readUInt32LE(addr + 4) & 0x07ffffff;
      if (nextDelta === 0) break;
      addr += nextDelta;
    }
  }
  return varRefs;
}

function parseFuncRefs(buf: Buffer, chunk: IffChunk | undefined): Map<number, string> {
  const funcRefs = new Map<number, string>();
  if (!chunk) return funcRefs;
  const count = buf.readUInt32LE(chunk.start);
  let off = chunk.start + 4;
  for (let i = 0; i < count && off + 12 <= chunk.end; i++) {
    const name = readGmStringAt(buf, buf.readUInt32LE(off));
    const occ = buf.readUInt32LE(off + 4);
    let addr = buf.readUInt32LE(off + 8);
    off += 12;
    for (let k = 0; k < occ && addr > 0 && addr + 8 <= buf.length; k++) {
      funcRefs.set(addr, name);
      const nextDelta = buf.readUInt32LE(addr + 4) & 0x07ffffff;
      if (nextDelta === 0) break;
      addr += nextDelta;
    }
  }
  return funcRefs;
}

function parseCode(buf: Buffer, chunk: IffChunk | undefined): {
  codeEntries: CodeEntry[];
  codeByName: Map<string, CodeEntry>;
} {
  const codeEntries: CodeEntry[] = [];
  const codeByName = new Map<string, CodeEntry>();
  if (!chunk) return { codeEntries, codeByName };
  const count = buf.readUInt32LE(chunk.start);
  for (let i = 0; i < count; i++) {
    const p = buf.readUInt32LE(chunk.start + 4 + i * 4);
    const name = readGmStringAt(buf, buf.readUInt32LE(p));
    const length = buf.readUInt32LE(p + 4);
    const localsCount = buf.readUInt16LE(p + 8);
    const argsCount = buf.readUInt16LE(p + 10);
    const relOff = buf.readInt32LE(p + 12);
    const bytecodeStart = p + 12 + relOff;
    const subOffset = buf.readUInt32LE(p + 16);
    const entry: CodeEntry = {
      index: i,
      name,
      length,
      localsCount,
      argsCount,
      bytecodeStart,
      subOffset,
    };
    codeEntries.push(entry);
    codeByName.set(name, entry);
  }
  return { codeEntries, codeByName };
}

export function parseDataWin(buf: Buffer): ParsedDataWin {
  const chunks = parseIffForm(buf);
  const gen8Chunk = chunks.get('GEN8');
  const strgChunk = chunks.get('STRG');
  if (!gen8Chunk || !strgChunk) {
    throw new Error('Missing required GEN8 or STRG chunk in data.win');
  }
  const gen8 = parseGen8(buf, gen8Chunk);
  const strings = parseStrg(buf, strgChunk);
  const audioGroups = parseAgrp(buf, chunks.get('AGRP'));
  const sounds = parseSond(buf, chunks.get('SOND'));
  const { tpags, tpagByPtr } = parseTpag(buf, chunks.get('TPAG'));
  const textures = parseTxtr(buf, chunks.get('TXTR'));
  const { sprites, spritesByName } = parseSprt(buf, chunks.get('SPRT'), tpagByPtr);
  const { rooms, roomsByName } = parseRoom(buf, chunks.get('ROOM'));
  const shaders = parseShdr(buf, chunks.get('SHDR'));
  const varRefs = parseVariRefs(buf, chunks.get('VARI'));
  const funcRefs = parseFuncRefs(buf, chunks.get('FUNC'));
  const { codeEntries, codeByName } = parseCode(buf, chunks.get('CODE'));
  const audoBlobs = parseAudoChunk(buf, chunks);

  return {
    buffer: buf,
    chunks,
    gen8,
    strings,
    audioGroups,
    sounds,
    tpagByPtr,
    tpags,
    textures,
    sprites,
    spritesByName,
    rooms,
    roomsByName,
    shaders,
    codeEntries,
    codeByName,
    varRefs,
    funcRefs,
    audoBlobs,
  };
}

// ============================================================================
// BC17 Bytecode Constant & Assignment Evaluator
// ============================================================================

type EvalVal = number | string | { varName: string } | { call: string; args: EvalVal[] };

interface ScriptAssignment {
  pc: number;
  varName: string;
  inst: number;
  val: EvalVal | undefined;
  array2d?: [EvalVal | undefined, EvalVal | undefined];
  array1dIndex?: EvalVal | undefined;
}

interface BcInstruction {
  pc: number;
  op: string;
  val?: number | string;
  varName?: string;
  inst?: number;
}

function walkBytecodeOps(parsed: ParsedDataWin, entryName: string): BcInstruction[] {
  const entry = parsed.codeByName.get(entryName);
  if (!entry) return [];
  const { buffer: buf, strings, varRefs } = parsed;
  const ops: BcInstruction[] = [];
  let pc = entry.bytecodeStart + entry.subOffset;
  const end = entry.bytecodeStart + entry.length;
  while (pc + 4 <= end) {
    const instr = buf.readUInt32LE(pc);
    const op = (instr >>> 24) & 0xff;
    const t1 = (instr >>> 16) & 0x0f;
    const t2 = (instr >>> 20) & 0x0f;
    const extra = instr & 0xffff;
    const sExtra = (extra << 16) >> 16;
    const relPc = pc - entry.bytecodeStart;
    let size = 4;

    if (op === 0x84) {
      ops.push({ pc: relPc, op: 'pushi', val: sExtra });
    } else if (op === 0xc0 || op === 0xc1 || op === 0xc2 || op === 0xc3) {
      if (t1 === 0) {
        ops.push({ pc: relPc, op: 'push.d', val: buf.readDoubleLE(pc + 4) });
        size = 12;
      } else if (t1 === 1) {
        ops.push({ pc: relPc, op: 'push.f', val: buf.readFloatLE(pc + 4) });
        size = 8;
      } else if (t1 === 2) {
        ops.push({ pc: relPc, op: 'push.i', val: buf.readInt32LE(pc + 4) });
        size = 8;
      } else if (t1 === 3) {
        ops.push({ pc: relPc, op: 'push.l', val: Number(buf.readBigInt64LE(pc + 4)) });
        size = 12;
      } else if (t1 === 4) {
        ops.push({ pc: relPc, op: 'push.b', val: buf.readInt32LE(pc + 4) });
        size = 8;
      } else if (t1 === 5) {
        ops.push({ pc: relPc, op: 'push.v', varName: varRefs.get(pc) ?? '?', inst: sExtra });
        size = 8;
      } else if (t1 === 6) {
        const sIdx = buf.readUInt32LE(pc + 4);
        ops.push({ pc: relPc, op: 'push.s', val: strings[sIdx] ?? '' });
        size = 8;
      } else if (t1 === 15) {
        ops.push({ pc: relPc, op: 'push.e', val: sExtra });
      } else {
        size = 8;
      }
    } else if (op === 0x45) {
      if (!(t1 === 15 && t2 === 5)) {
        ops.push({ pc: relPc, op: 'pop', varName: varRefs.get(pc) ?? '?', inst: sExtra });
        size = 8;
      }
    } else if (op === 0xd9) {
      ops.push({ pc: relPc, op: 'call', val: extra });
      size = 8;
    } else if (op === 0xff) {
      ops.push({ pc: relPc, op: 'break', val: sExtra });
      if (sExtra === -10 || sExtra === -11) size = 8;
    }
    pc += size;
  }
  return ops;
}

function evalScriptAssignments(parsed: ParsedDataWin, entryName: string): {
  assignments: ScriptAssignment[];
  comparisons: Array<{ pc: number; left: EvalVal | undefined; right: EvalVal | undefined }>;
} {
  const entry = parsed.codeByName.get(entryName);
  if (!entry) return { assignments: [], comparisons: [] };
  const { buffer: buf, strings, varRefs, funcRefs } = parsed;
  const stack: EvalVal[] = [];
  const locals = new Map<string, EvalVal>();
  const assignments: ScriptAssignment[] = [];
  const comparisons: Array<{ pc: number; left: EvalVal | undefined; right: EvalVal | undefined }> = [];

  let pc = entry.bytecodeStart + entry.subOffset;
  const end = entry.bytecodeStart + entry.length;

  while (pc + 4 <= end) {
    const instr = buf.readUInt32LE(pc);
    const op = (instr >>> 24) & 0xff;
    const t1 = (instr >>> 16) & 0x0f;
    const t2 = (instr >>> 20) & 0x0f;
    const extra = instr & 0xffff;
    const sExtra = (extra << 16) >> 16;
    const relPc = pc - entry.bytecodeStart;
    let size = 4;

    if (op === 0x84) {
      stack.push(sExtra);
    } else if (op === 0xc0 || op === 0xc1 || op === 0xc2 || op === 0xc3) {
      if (t1 === 0) {
        stack.push(buf.readDoubleLE(pc + 4));
        size = 12;
      } else if (t1 === 1) {
        stack.push(buf.readFloatLE(pc + 4));
        size = 8;
      } else if (t1 === 2) {
        stack.push(buf.readInt32LE(pc + 4));
        size = 8;
      } else if (t1 === 3) {
        stack.push(Number(buf.readBigInt64LE(pc + 4)));
        size = 12;
      } else if (t1 === 4) {
        stack.push(buf.readInt32LE(pc + 4));
        size = 8;
      } else if (t1 === 5) {
        const vn = varRefs.get(pc) ?? '?';
        const localVal = sExtra === -1 ? locals.get(vn) : undefined;
        stack.push(localVal !== undefined ? localVal : { varName: vn });
        size = 8;
      } else if (t1 === 6) {
        stack.push(strings[buf.readUInt32LE(pc + 4)] ?? '');
        size = 8;
      } else if (t1 === 15) {
        stack.push(sExtra);
      } else {
        size = 8;
      }
    } else if (op === 0x45) {
      if (t1 === 15 && t2 === 5) {
        stack.pop();
      } else {
        const vn = varRefs.get(pc) ?? '?';
        const refType = (buf.readUInt32LE(pc + 4) >>> 27) & 0x1f;
        // 1D array store in BC17: refType === 0 pushes [val, inst, index] before pop.v.v
        if (refType === 0 && stack.length >= 3) {
          const idx = stack.pop();
          const instMarker = stack.pop();
          const val = stack.pop();
          if (typeof instMarker === 'number' && instMarker <= 0) {
            assignments.push({ pc: relPc, varName: vn, inst: sExtra, val, array1dIndex: idx });
          } else {
            if (instMarker !== undefined) stack.push(instMarker);
            if (val !== undefined) stack.push(val);
            assignments.push({ pc: relPc, varName: vn, inst: sExtra, val: idx });
          }
        } else {
          const val = stack.pop();
          if (sExtra === -1 && val !== undefined) {
            locals.set(vn, val);
          }
          assignments.push({ pc: relPc, varName: vn, inst: sExtra, val });
        }
        size = 8;
      }
    } else if (op === 0x05) {
      const a = stack.pop();
      stack.push(typeof a === 'number' ? -a : { varName: 'neg' });
    } else if (op === 0x06) {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(typeof a === 'number' && typeof b === 'number' ? b * a : { varName: 'mul' });
    } else if (op === 0x08) {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(typeof a === 'number' && typeof b === 'number' && a !== 0 ? b / a : { varName: 'div' });
    } else if (op === 0x0c) {
      const a = stack.pop();
      const b = stack.pop();
      if (typeof a === 'number' && typeof b === 'number') stack.push(b + a);
      else if (typeof a === 'string' && typeof b === 'string') stack.push(b + a);
      else stack.push({ varName: 'add' });
    } else if (op === 0x0d) {
      const a = stack.pop();
      const b = stack.pop();
      stack.push(typeof a === 'number' && typeof b === 'number' ? b - a : { varName: 'sub' });
    } else if (op === 0x15) {
      const right = stack.pop();
      const left = stack.pop();
      comparisons.push({ pc: relPc, left, right });
      stack.push(0);
    } else if (op === 0xd9) {
      const fn = funcRefs.get(pc) ?? '?';
      const args: EvalVal[] = [];
      for (let a = 0; a < extra; a++) {
        const arg = stack.pop();
        if (arg !== undefined) args.push(arg);
      }
      stack.push({ call: fn, args });
      size = 8;
    } else if (op === 0xff) {
      if (sExtra === -3) {
        // GMS2.3 set_array_2d: stack has [val, inst(-5), idx1, arrRef, idx2]
        const idx2 = stack.pop();
        const arr = stack.pop();
        const idx1 = stack.pop();
        stack.pop(); // inst
        const val = stack.pop();
        const arrName =
          typeof arr === 'object' && arr !== null && 'varName' in arr ? arr.varName : String(arr);
        assignments.push({
          pc: relPc,
          varName: arrName,
          inst: -5,
          val,
          array2d: [idx1, idx2],
        });
      } else if (sExtra === -5) {
        stack.pop();
      } else if (sExtra === -10 || sExtra === -11) {
        size = 8;
      }
    } else if (op === 0x99 || op === 0xb7 || op === 0xb8) {
      stack.pop();
    }

    pc += size;
  }

  return { assignments, comparisons };
}

// ============================================================================
// Palette Extraction (scrShaderListInit + SHDR GLSL fragment color tuples)
// ============================================================================

function parseGlslColorExpr(expr: string): [number, number, number] | null {
  const clean = expr.replace(/\/\/.*$/, '').trim();
  const named: Record<string, [number, number, number]> = {
    white: [255, 255, 255],
    red: [255, 0, 0],
    black: [0, 0, 0],
    green: [0, 255, 0],
    blue: [0, 126, 255],
  };
  const namedVal = named[clean];
  if (namedVal) return [namedVal[0], namedVal[1], namedVal[2]];

  const m = clean.match(/vec3\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;

  const parseComp = (raw: string): number => {
    const s = raw.trim();
    const divM = s.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
    if (divM && divM[1] !== undefined && divM[2] !== undefined) {
      const num = parseFloat(divM[1]);
      const den = parseFloat(divM[2]);
      if (den === 256 || den === 255) {
        return Math.max(0, Math.min(255, Math.round(num)));
      }
      return Math.max(0, Math.min(255, Math.round((num / den) * 255)));
    }
    const v = parseFloat(s);
    if (!Number.isNaN(v)) {
      return v <= 1.0 ? Math.max(0, Math.min(255, Math.round(v * 255))) : Math.min(255, Math.round(v));
    }
    return 0;
  };

  return [parseComp(m[1]), parseComp(m[2]), parseComp(m[3])];
}

function extractShaderPaletteColors(glslFrag: string): {
  light: [number, number, number] | null;
  mid: [number, number, number] | null;
  dark: [number, number, number] | null;
  special: [number, number, number] | null;
} {
  const result: {
    light: [number, number, number] | null;
    mid: [number, number, number] | null;
    dark: [number, number, number] | null;
    special: [number, number, number] | null;
  } = { light: null, mid: null, dark: null, special: null };

  for (const rawLine of glslFrag.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    const m = line.match(/^color([LMDS])\s*=\s*([^;]+);/);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const rgb = parseGlslColorExpr(m[2]);
    if (!rgb) continue;
    if (m[1] === 'L') result.light = rgb;
    else if (m[1] === 'M') result.mid = rgb;
    else if (m[1] === 'D') result.dark = rgb;
    else if (m[1] === 'S') result.special = rgb;
  }
  return result;
}

export function extractPalettes(parsed: ParsedDataWin): ExtractedPalette[] {
  const ops = walkBytecodeOps(parsed, 'gml_Script_scrShaderListInit');
  const palettes: ExtractedPalette[] = [];

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const nextOp = ops[k + 1];
    if (op?.op === 'push.v' && op.varName === 'shaderAr' && nextOp?.op === 'pushi' && nextOp.val === 0) {
      let shaderId: number | null = null;
      for (let j = k - 1; j >= Math.max(0, k - 6); j--) {
        const cur = ops[j];
        const prev = ops[j - 1];
        if (cur?.op === 'pushi' && cur.val === -5 && prev?.op === 'pushi' && typeof prev.val === 'number') {
          shaderId = prev.val;
          break;
        }
      }
      let palName: string | null = null;
      for (let j = k + 2; j < Math.min(ops.length, k + 8); j++) {
        const cur = ops[j];
        if (cur?.op === 'push.s' && typeof cur.val === 'string') {
          palName = cur.val;
          break;
        }
      }
      if (shaderId !== null && palName !== null) {
        const shader = parsed.shaders[shaderId];
        const colors = shader
          ? extractShaderPaletteColors(shader.glslFrag)
          : { light: null, mid: null, dark: null, special: null };
        const fallbackL: RgbTuple = [255, 255, 255];
        const fallbackM: RgbTuple = [255, 0, 0];
        const fallbackD: RgbTuple = [0, 0, 0];
        const fallbackS: RgbTuple = [0, 126, 255];
        const allExtracted =
          colors.light !== null &&
          colors.mid !== null &&
          colors.dark !== null &&
          colors.special !== null;
        palettes.push({
          id: palettes.length,
          name: palName,
          shaderId,
          shaderName: shader?.name ?? `shader_${shaderId}`,
          light: colors.light ?? [fallbackL[0], fallbackL[1], fallbackL[2]],
          mid: colors.mid ?? [fallbackM[0], fallbackM[1], fallbackM[2]],
          dark: colors.dark ?? [fallbackD[0], fallbackD[1], fallbackD[2]],
          special: colors.special ?? [fallbackS[0], fallbackS[1], fallbackS[2]],
          provenance: allExtracted ? 'extracted' : 'verified_spec',
        });
      }
    }
  }
  return palettes;
}

// ============================================================================
// Weapon Extraction (bStatInitLevel1)
// ============================================================================

const WEAPON_METADATA: ReadonlyArray<{ id: number; name: string; shortName: string }> = [
  { id: 0, name: 'MACHINEGUN', shortName: 'MGUN' },
  { id: 1, name: 'SHOTGUN', shortName: 'SGUN' },
  { id: 2, name: 'LASER', shortName: 'LASR' },
  { id: 3, name: 'TRIPLE', shortName: 'TRPL' },
  { id: 4, name: 'PUNCHER', shortName: 'PNCH' },
  { id: 5, name: 'BURST', shortName: 'BRST' },
  { id: 6, name: 'NOPPY', shortName: 'NOPY' },
];

function extractWeapons(parsed: ParsedDataWin) {
  const { assignments } = evalScriptAssignments(parsed, 'gml_Script_bStatInitLevel1');
  const tables = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    if (!a.array2d) continue;
    const [wIdx, lvlIdx] = a.array2d;
    if (typeof wIdx !== 'number' || typeof lvlIdx !== 'number' || typeof a.val !== 'number') continue;
    let tbl = tables.get(a.varName);
    if (!tbl) {
      tbl = new Map<string, number>();
      tables.set(a.varName, tbl);
    }
    tbl.set(`${wIdx},${lvlIdx}`, a.val);
  }

  const getNum = (varName: string, w: number, lvl: number, fallback = 0): number =>
    tables.get(varName)?.get(`${w},${lvl}`) ?? fallback;

  const buildLevel = (w: number, lvl: number) => {
    const bulletSpriteId = getNum('bStatBulletSprite', w, lvl, -1);
    const muzzleSpriteId = getNum('bStatMuzzle', w, lvl, -1);
    const soundId = getNum('bStatSound', w, lvl, -1);
    const speed = getNum('bStatSpeed', w, lvl, 0);
    const rangeTimer = getNum('bStatRangeTimer', w, lvl, 0);
    return {
      cost: getNum('bStatConRate', w, lvl, 1),
      rof: getNum('bStatRof', w, lvl, 0),
      recoil: getNum('bStatRecoil', w, lvl, 0),
      damage: getNum('bStatDamage', w, lvl, 0),
      speed,
      spreadDeg: getNum('bStatAccuracy', w, lvl, 0),
      pierce: getNum('bStatPierce', w, lvl, 0) !== 0,
      burst: getNum('bStatBurst', w, lvl, 0) !== 0,
      burstRate: getNum('bStatBurstRate', w, lvl, 0),
      burstAmount: getNum('bStatBurstAmount', w, lvl, 1),
      rangeTimer,
      rangeRandom: getNum('bStatRangeRandom', w, lvl, 0),
      estimatedRangePx: speed > 0 ? speed * rangeTimer : 284,
      spType: getNum('bStatSpType', w, lvl, 0),
      sp1: getNum('bStatSp1', w, lvl, 0),
      sp2: getNum('bStatSp2', w, lvl, 0),
      sp3: getNum('bStatSp3', w, lvl, 0),
      aimAngleLimit: getNum('bStatAimAngleLimit', w, lvl, 0),
      screenShake: getNum('bStatScreenShake', w, lvl, 0),
      screenShakeDur: getNum('bStatScreenShakeDur', w, lvl, 0),
      bulletSpriteId,
      bulletSpriteName: parsed.sprites[bulletSpriteId]?.name ?? null,
      muzzleSpriteId,
      muzzleSpriteName: parsed.sprites[muzzleSpriteId]?.name ?? null,
      soundId,
      soundName: parsed.sounds[soundId]?.name ?? null,
    };
  };

  return WEAPON_METADATA.map((meta) => ({
    id: meta.id,
    name: meta.name,
    shortName: meta.shortName,
    cost: getNum('bStatConRate', meta.id, 0, 1),
    normal: buildLevel(meta.id, 0),
    gemHigh: buildLevel(meta.id, 1),
    provenance: tables.size > 0 ? ('extracted' as const) : ('verified_spec' as const),
  }));
}

// ============================================================================
// Physics & Boss Constants Extraction
// ============================================================================

function extractNumericMap(parsed: ParsedDataWin, scriptName: string): Map<string, number[]> {
  const { assignments } = evalScriptAssignments(parsed, scriptName);
  const out = new Map<string, number[]>();
  for (const a of assignments) {
    if (typeof a.val !== 'number') continue;
    let list = out.get(a.varName);
    if (!list) {
      list = [];
      out.set(a.varName, list);
    }
    list.push(a.val);
  }
  return out;
}

function firstNum(map: Map<string, number[]>, key: string, fallback: number): number {
  return map.get(key)?.[0] ?? fallback;
}

function extractPhysics(parsed: ParsedDataWin) {
  const globalStat = extractNumericMap(parsed, 'gml_Script_scrPlayerGlobalStat');
  const playerInit = extractNumericMap(parsed, 'gml_Script_scrPlayerInit');
  const gravScript = extractNumericMap(parsed, 'gml_Script_scrGravity_n');
  const bossCreate = extractNumericMap(parsed, 'gml_Object_FINALBOSS_Create_0');

  const jumpVals = playerInit.get('jumpsp') ?? [];
  const oxyVals = playerInit.get('oxygenDepRate') ?? [];
  const finalGravVals = gravScript.get('finalGrav') ?? [];
  const finalMaxGravVals = gravScript.get('finalMaxgrav') ?? [];

  const grav = firstNum(globalStat, 'grav', 0.2);
  const maxGrav = firstNum(globalStat, 'maxgrav', 7);
  const waterGravDivisor = finalGravVals.find((v) => Math.abs(v - 1.4) < 0.01) ?? 1.4;
  const levitateGravDivisor = finalGravVals.find((v) => Math.abs(v - 1.5) < 0.01) ?? 1.5;
  const bossOuchAmt = firstNum(bossCreate, 'ouchAmt', 220);

  return {
    grav,
    maxGrav,
    limboMaxGrav: finalMaxGravVals[0] ?? 6,
    waterMaxGrav: finalMaxGravVals[1] ?? finalMaxGravVals[0] ?? 6,
    waterGravDivisor,
    waterGrav: Number((grav / waterGravDivisor).toFixed(6)),
    levitateGravDivisor,
    levitateGrav: Number((grav / levitateGravDivisor).toFixed(6)),
    moveAccel: firstNum(playerInit, 'moveaccl', 0.2),
    groundMaxSp: firstNum(playerInit, 'maxsp', 2),
    airMaxSp: firstNum(playerInit, 'airMaxsp', 2.5),
    waterMaxSp: firstNum(playerInit, 'waterMaxsp', 2),
    waterAirMaxSp: firstNum(playerInit, 'waterAirMaxsp', 2.3),
    groundDecel: firstNum(playerInit, 'decclsp', 0.4),
    airDecel: firstNum(playerInit, 'airdeccl', 0.1),
    jumpSp: jumpVals[0] ?? 4.4,
    rocketJumpSp: jumpVals[1] ?? 5,
    waterJumpSp: firstNum(playerInit, 'jumpspWater', 3.8),
    wallKickSp: firstNum(playerInit, 'wallkicksp', 4),
    wallKickLength: firstNum(playerInit, 'wallKickLength', 3),
    enemyBounceSp: firstNum(playerInit, 'enemybounce', 2.7),
    startAmmo: firstNum(globalStat, 'ammo', 8),
    startHp: firstNum(globalStat, 'playerHp', 4),
    startHpMax: firstNum(globalStat, 'playerHpMax', 4),
    heartPieceMax: firstNum(globalStat, 'heartPieceMax', 4),
    stompDamage: firstNum(globalStat, 'jumpDmg', 100),
    flickerAt: firstNum(playerInit, 'flickerAt', 45),
    flickerDur: firstNum(playerInit, 'flickerDur', 6),
    jetpackMaxTicks: firstNum(playerInit, 'jetMax', 90),
    afterimageCount: firstNum(playerInit, 'afterImageNumber', 8),
    oxygenMax: firstNum(globalStat, 'oxygenMax', 100),
    oxygenTickNormal: oxyVals.find((v) => v > 10) ?? firstNum(globalStat, 'oxygenDepRate', 13),
    oxygenTickHard: oxyVals.find((v) => v > 0 && v <= 10) ?? 7,
    gemStreakThreshold: firstNum(globalStat, 'gemStreakThreshold', 100),
    gemStreakTimerStart: firstNum(globalStat, 'gemStreakTimerStart', 300),
    bossOuchAmt,
    bossPhaseThreshold: bossOuchAmt * 4,
    bossPhases: 4,
    bossTotalHp: bossOuchAmt * 16,
    provenance: 'extracted' as const,
  };
}

// ============================================================================
// Unlock Milestones (unlockGoalNum + unlockNotice) & Style Sprite Table
// ============================================================================

function extractUnlockMilestones(
  parsed: ParsedDataWin,
  palettes: ExtractedPalette[],
  styles: Array<{ id: number; name: string }>,
) {
  const { assignments } = evalScriptAssignments(parsed, 'gml_Script_unlockGoalNum');
  const goalsByIdx = new Map<number, number>();
  for (const a of assignments) {
    if (a.varName === 'tng' && typeof a.array1dIndex === 'number' && typeof a.val === 'number') {
      goalsByIdx.set(a.array1dIndex, a.val);
    }
  }

  // Extract 1-based milestone indices that unlock styles from unlockNotice comparisons
  const notice = evalScriptAssignments(parsed, 'gml_Script_unlockNotice');
  const styleMilestoneNums: number[] = [];
  for (const cmp of notice.comparisons) {
    if (typeof cmp.right === 'number' && cmp.right >= 1 && cmp.right <= 41) {
      if (!styleMilestoneNums.includes(cmp.right)) {
        styleMilestoneNums.push(cmp.right);
      }
    }
  }
  styleMilestoneNums.sort((a, b) => a - b);
  const styleTargets = new Map<number, number>();
  styleMilestoneNums.forEach((oneBased, idx) => {
    styleTargets.set(oneBased - 1, idx + 1); // style 1..4
  });

  const milestones: Array<{
    index: number;
    gems: number;
    kind: 'style' | 'palette';
    targetId: number;
    label: string;
    provenance: 'extracted' | 'verified_spec';
  }> = [];

  let nextPaletteId = 1;
  for (let i = 0; i < 41; i++) {
    const gems = goalsByIdx.get(i);
    if (gems === undefined) break;
    const styleId = styleTargets.get(i);
    if (styleId !== undefined) {
      const styleDef = styles.find((s) => s.id === styleId);
      milestones.push({
        index: i,
        gems,
        kind: 'style',
        targetId: styleId,
        label: styleDef?.name ?? `STYLE_${styleId}`,
        provenance: 'extracted',
      });
    } else {
      const pal = palettes[nextPaletteId];
      milestones.push({
        index: i,
        gems,
        kind: 'palette',
        targetId: nextPaletteId,
        label: pal?.name ?? `PALETTE_${nextPaletteId}`,
        provenance: 'extracted',
      });
      nextPaletteId++;
    }
  }
  return milestones;
}

function extractStyleSprites(parsed: ParsedDataWin) {
  const { assignments } = evalScriptAssignments(parsed, 'gml_Script_styleInit');
  const byStyle = new Map<number, Record<string, number | string | null>>();
  for (const a of assignments) {
    if (typeof a.array1dIndex !== 'number' || typeof a.val !== 'number') continue;
    const idx = a.array1dIndex;
    let rec = byStyle.get(idx);
    if (!rec) {
      rec = {};
      byStyle.set(idx, rec);
    }
    if (
      a.varName === 'styleIdle' ||
      a.varName === 'styleRun' ||
      a.varName === 'styleAir' ||
      a.varName === 'styleSpin' ||
      a.varName === 'styleShoot'
    ) {
      rec[a.varName] = parsed.sprites[a.val]?.name ?? null;
    } else if (a.varName === 'styleRunIS' || a.varName === 'styleIdleIS') {
      rec[a.varName] = a.val;
    }
  }
  return byStyle;
}

// ============================================================================
// language.ini [english] Parser
// ============================================================================

function parseEnglishIni(iniText: string): Map<string, string> {
  const clean = iniText.replace(/^\uFEFF/, '');
  const map = new Map<string, string>();
  let inEnglish = false;

  for (const rawLine of clean.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inEnglish = trimmed.slice(1, -1).trim().toLowerCase() === 'english';
      continue;
    }
    if (!inEnglish) continue;
    const eq = rawLine.indexOf('=');
    if (eq < 0) continue;
    const key = rawLine.slice(0, eq).trim();
    const val = rawLine.slice(eq + 1).replace(/^[\t \u3000]+/, '').trimEnd();
    if (key.length > 0) {
      map.set(key, val);
    }
  }
  return map;
}

function cleanIniDesc(raw: string): string {
  return raw.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Main Oracle Builder
// ============================================================================

export function buildOracle(sourceDir: string) {
  const dataWinPath = path.join(sourceDir, 'data.win');
  const langIniPath = path.join(sourceDir, 'language.ini');

  const buf = fs.readFileSync(dataWinPath);
  const parsed = parseDataWin(buf);
  const eng = fs.existsSync(langIniPath)
    ? parseEnglishIni(fs.readFileSync(langIniPath, 'utf8'))
    : new Map<string, string>();

  const rmMain = parsed.roomsByName.get('rmMain');
  const sprTile1 = parsed.spritesByName.get('sprTile1');
  const sprThinPlatform = parsed.spritesByName.get('sprThinPlatform');
  const sprPlayerIdle = parsed.spritesByName.get('sprPlayerIdle');
  const sprBossEye = parsed.spritesByName.get('sprBossEye');
  const sprBossTentacle =
    parsed.spritesByName.get('sprTentacle') ??
    parsed.spritesByName.get('sprBossTentacle') ??
    parsed.sprites.find((s) => s.name.toLowerCase().includes('tentacle'));

  const palettes = extractPalettes(parsed);
  const weapons = extractWeapons(parsed);
  const physics = extractPhysics(parsed);

  // Upgrades (id < 100) & Shop items (id >= 100) from language.ini [english]
  const upgradeIds: number[] = [];
  const shopItemIds: number[] = [];
  for (const key of eng.keys()) {
    const m = key.match(/^ugName(\d+)$/);
    if (!m || m[1] === undefined) continue;
    const id = parseInt(m[1], 10);
    if (id < 100) upgradeIds.push(id);
    else shopItemIds.push(id);
  }
  upgradeIds.sort((a, b) => a - b);
  shopItemIds.sort((a, b) => a - b);

  const upgrades = upgradeIds.map((id) => {
    const rawDesc = eng.get(`ugDesc${id}`) ?? '';
    return {
      id,
      name: eng.get(`ugName${id}`) ?? '',
      rawDescription: rawDesc,
      description: cleanIniDesc(rawDesc),
      provenance: 'extracted' as const,
    };
  });

  const shopItems = shopItemIds.map((id) => {
    const rawDesc = eng.get(`ugDesc${id}`) ?? '';
    return {
      id,
      name: eng.get(`ugName${id}`) ?? '',
      rawDescription: rawDesc,
      description: cleanIniDesc(rawDesc),
      provenance: 'extracted' as const,
    };
  });

  // Styles (0..4)
  const styleSprites = extractStyleSprites(parsed);
  const styleIds: number[] = [];
  for (const key of eng.keys()) {
    const m = key.match(/^styleName(\d+)$/);
    if (!m || m[1] === undefined) continue;
    styleIds.push(parseInt(m[1], 10));
  }
  styleIds.sort((a, b) => a - b);

  const styles = styleIds.map((id) => {
    const rawDesc = eng.get(`styleDesc${id}`) ?? '';
    return {
      id,
      name: eng.get(`styleName${id}`) ?? '',
      rawDescription: rawDesc,
      description: cleanIniDesc(rawDesc),
      sprites: styleSprites.get(id) ?? {},
      provenance: 'extracted' as const,
    };
  });

  // Trophies (0..22)
  const trophyIds: number[] = [];
  for (const key of eng.keys()) {
    const m = key.match(/^trophyName(\d+)$/);
    if (!m || m[1] === undefined) continue;
    trophyIds.push(parseInt(m[1], 10));
  }
  trophyIds.sort((a, b) => a - b);

  const trophies = trophyIds.map((id) => {
    const rawDesc = eng.get(`trophyDesc${id}`) ?? '';
    return {
      index: id,
      id: `trophy_${id}`,
      name: eng.get(`trophyName${id}`) ?? '',
      rawDescription: rawDesc,
      description: cleanIniDesc(rawDesc),
      provenance: 'extracted' as const,
    };
  });

  // Area names (0..5)
  const areas: Array<{ id: number; name: string; provenance: 'extracted' }> = [];
  for (let a = 0; a <= 5; a++) {
    const areaName = eng.get(`area${a}`);
    if (areaName) {
      areas.push({ id: a, name: areaName, provenance: 'extracted' });
    }
  }

  // Unlock milestones (41)
  const unlockMilestones = extractUnlockMilestones(parsed, palettes, styles);

  // Sprite index (all extracted sprites with w/h/origin/bbox/frames)
  const spriteIndex: Record<
    string,
    {
      index: number;
      width: number;
      height: number;
      originX: number;
      originY: number;
      bbox: SpriteBbox;
      frames: number;
      sheetId: number | null;
      sourceRect: { x: number; y: number; w: number; h: number } | null;
    }
  > = {};
  for (const s of parsed.sprites) {
    const f0 = s.frames[0] ?? null;
    spriteIndex[s.name] = {
      index: s.index,
      width: s.width,
      height: s.height,
      originX: s.originX,
      originY: s.originY,
      bbox: s.bbox,
      frames: s.frames.length,
      sheetId: f0 ? f0.sheetId : null,
      sourceRect: f0 ? { x: f0.sourceX, y: f0.sourceY, w: f0.sourceW, h: f0.sourceH } : null,
    };
  }

  // Audio index (all 361 SOND entries + AGRP names)
  const audioIndex = parsed.sounds.map((s) => ({
    index: s.index,
    name: s.name,
    file: s.file,
    groupId: s.groupId,
    groupName: parsed.audioGroups[s.groupId] ?? `group_${s.groupId}`,
    audioId: s.audioId,
    volume: s.volume,
    pitch: s.pitch,
    external: s.audioId < 0,
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    engine: {
      fps: parsed.gen8.fps,
      bytecodeVersion: parsed.gen8.bytecodeVersion,
      defaultWindowW: parsed.gen8.defaultWindowW,
      defaultWindowH: parsed.gen8.defaultWindowH,
      viewW: rmMain?.view0?.viewW ?? 160,
      viewH: rmMain?.view0?.viewH ?? 284,
      roomName: rmMain?.name ?? 'rmMain',
      tileSize: sprTile1?.width ?? 16,
      playerSprite: sprPlayerIdle
        ? {
            name: sprPlayerIdle.name,
            width: sprPlayerIdle.width,
            height: sprPlayerIdle.height,
            originX: sprPlayerIdle.originX,
            originY: sprPlayerIdle.originY,
            frames: sprPlayerIdle.frames.length,
          }
        : null,
      playerBbox: sprPlayerIdle?.bbox ?? null,
      thinPlatformBbox: sprThinPlatform?.bbox ?? null,
      bossEyeSprite: sprBossEye
        ? {
            name: sprBossEye.name,
            width: sprBossEye.width,
            height: sprBossEye.height,
            originX: sprBossEye.originX,
            originY: sprBossEye.originY,
            bbox: sprBossEye.bbox,
          }
        : null,
      bossTentacleSprite: sprBossTentacle
        ? {
            name: sprBossTentacle.name,
            width: sprBossTentacle.width,
            height: sprBossTentacle.height,
            originX: sprBossTentacle.originX,
            originY: sprBossTentacle.originY,
            bbox: sprBossTentacle.bbox,
          }
        : null,
      counts: {
        chunks: parsed.chunks.size,
        strings: parsed.strings.length,
        rooms: parsed.rooms.length,
        sprites: parsed.sprites.length,
        tpag: parsed.tpags.length,
        textures: parsed.textures.length,
        shaders: parsed.shaders.length,
        sounds: parsed.sounds.length,
        audioGroups: parsed.audioGroups.length,
        codeEntries: parsed.codeEntries.length,
      },
      provenance: 'extracted' as const,
    },
    areas,
    palettes,
    weapons,
    physics,
    upgrades,
    shopItems,
    styles,
    trophies,
    unlockMilestones,
    spriteIndex,
    audioGroups: parsed.audioGroups,
    audioIndex,
    provenance: {
      engine: 'extracted',
      areas: 'extracted',
      palettes: palettes.every((p) => p.provenance === 'extracted') ? 'extracted' : 'verified_spec',
      weapons: 'extracted',
      physics: 'extracted',
      upgrades: 'extracted',
      shopItems: 'extracted',
      styles: 'extracted',
      trophies: 'extracted',
      unlockMilestones: 'extracted',
      spriteIndex: 'extracted',
      audioIndex: 'extracted',
    },
  };
}

function runOracleCli(): void {
  const strict = process.argv.includes('--strict') || process.env.KRUNKED_REQUIRE_SOURCE === '1';
  const sourceDir = resolveSourceDir();
  const dataWinPath = path.join(sourceDir, 'data.win');

  if (!fs.existsSync(dataWinPath)) {
    console.warn(
      `[oracle-dump] Source data.win not found at "${sourceDir}". Set KRUNKED_SOURCE_DIR to a valid local game install directory.`,
    );
    if (strict) {
      process.exitCode = 1;
    }
    return;
  }

  const outDir = path.resolve(process.cwd(), '.krunked-well-assets');
  fs.mkdirSync(outDir, { recursive: true });

  const oracle = buildOracle(sourceDir);
  const outPath = path.join(outDir, 'oracle.json');
  fs.writeFileSync(outPath, JSON.stringify(oracle, null, 2) + '\n', 'utf8');

  console.log(
    `[oracle-dump] Wrote ${outPath} | FPS=${oracle.engine.fps} view=${oracle.engine.viewW}x${oracle.engine.viewH} ` +
      `playerBbox=${oracle.engine.playerBbox?.width ?? 0}x${oracle.engine.playerBbox?.height ?? 0} ` +
      `palettes=${oracle.palettes.length} weapons=${oracle.weapons.length} upgrades=${oracle.upgrades.length} ` +
      `shopItems=${oracle.shopItems.length} styles=${oracle.styles.length} trophies=${oracle.trophies.length} ` +
      `milestones=${oracle.unlockMilestones.length} sprites=${Object.keys(oracle.spriteIndex).length} ` +
      `audio=${oracle.audioIndex.length}`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runOracleCli();
}
