/**
 * iter-041 (arch 5.3): minimální čtečka zipu nad `node:zlib` pro xlsx.
 *
 * Čistý modul (jen `node:zlib`). Žádná závislost, žádné vyhodnocování obsahu.
 * Tvrdé limity (gate: doslova):
 *   - soubor nejvýš 512 KiB, první 4 bajty `PK\x03\x04`, jinak „není xlsx“,
 *   - EOCD jen v posledních 65 557 bajtech, nejvýš 64 položek,
 *   - zip64, šifrování a jiné metody než 0 a 8 jsou chyba,
 *   - každá čtená položka: deklarovaná velikost nejvýš 4 MiB,
 *     `inflateRawSync` s `maxOutputLength` (přesah vyhodí RangeError, žádná
 *     alokace navíc), skutečná délka = deklarovaná, CRC32 sedí,
 *   - součet rozbalených položek nejvýš 8 MiB,
 *   - položky se hledají přesným jménem, duplicitní jména jsou chyba.
 */
import { inflateRawSync } from "node:zlib";
import { SemaforFileError } from "@/lib/semafor/errors";

export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_ENTRIES = 64;
export const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const EOCD_SEARCH = 65_557;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface CentralEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export interface ZipReader {
  /** Jména položek (jen pro hlášky a testy). */
  names(): string[];
  has(name: string): boolean;
  /** Rozbalí položku přesného jména, jinak chyba `broken`. */
  read(name: string): Buffer;
}

const broken = () => new SemaforFileError("broken");

export function openZip(input: Uint8Array): ZipReader {
  if (input.length > MAX_FILE_BYTES) throw new SemaforFileError("tooBig");
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length < 22 || buf.readUInt32LE(0) !== SIG_LOCAL) throw new SemaforFileError("notXlsx");

  // EOCD: hledá se odzadu jen v povoleném okně.
  let eocd = -1;
  const lowest = Math.max(0, buf.length - EOCD_SEARCH);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw broken();

  const diskNo = buf.readUInt16LE(eocd + 4);
  const cdDisk = buf.readUInt16LE(eocd + 6);
  const entriesOnDisk = buf.readUInt16LE(eocd + 8);
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw broken(); // zip64
  if (diskNo !== 0 || cdDisk !== 0 || entriesOnDisk !== total) throw broken();
  if (total > MAX_ENTRIES) throw broken();
  if (cdOffset + cdSize > eocd) throw broken();

  const entries = new Map<string, CentralEntry>();
  let pos = cdOffset;
  for (let i = 0; i < total; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== SIG_CENTRAL) throw broken();
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    if (flags & 0x1) throw broken(); // šifrování
    if (method !== 0 && method !== 8) throw broken();
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw broken(); // zip64
    }
    const end = pos + 46 + nameLen + extraLen + commentLen;
    if (end > buf.length) throw broken();
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    if (entries.has(name)) throw broken();
    entries.set(name, { name, method, crc, compressedSize, uncompressedSize, localOffset });
    pos = end;
  }

  let totalOut = 0;

  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) throw broken();
      if (e.uncompressedSize > MAX_ENTRY_BYTES) throw broken();
      if (totalOut + e.uncompressedSize > MAX_TOTAL_BYTES) throw broken();
      const lo = e.localOffset;
      if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LOCAL) throw broken();
      const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
      const end = start + e.compressedSize;
      if (end > cdOffset || start > end) throw broken();
      const raw = buf.subarray(start, end);
      let out: Buffer;
      if (e.method === 0) {
        if (e.compressedSize !== e.uncompressedSize) throw broken();
        out = Buffer.from(raw);
      } else {
        try {
          // maxOutputLength = deklarovaná velikost: bomba, která lže o velikosti,
          // skončí RangeError dřív, než se alokuje víc.
          out = inflateRawSync(raw, { maxOutputLength: Math.max(1, e.uncompressedSize) });
        } catch {
          throw broken();
        }
      }
      if (out.length !== e.uncompressedSize) throw broken();
      if (crc32(out) !== e.crc) throw broken();
      totalOut += out.length;
      if (totalOut > MAX_TOTAL_BYTES) throw broken();
      return out;
    },
  };
}
