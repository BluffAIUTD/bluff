// Minimal zip writer (no dependency): deflate via node:zlib, one flat archive, enough for a Chrome "Load unpacked" bundle.
import zlib from "node:zlib";

let TABLE;
/** CRC-32 (IEEE), table-driven. Used when node:zlib has no crc32 (it was added in Node 22.2). */
export function crc32Fallback(data) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32(data) {
  return typeof zlib.crc32 === "function" ? zlib.crc32(data) >>> 0 : crc32Fallback(data);
}

/** MS-DOS time/date fields. A fixed date keeps the archive byte-for-byte reproducible. */
function dosDateTime(d) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

/**
 * @param {{ name: string, data: Uint8Array | string }[]} entries  file names use "/" separators, no leading slash
 * @param {{ date?: Date }} [opts]
 * @returns {Buffer}
 */
export function zipFiles(entries, opts = {}) {
  const { time, date } = dosDateTime(opts.date ?? new Date(Date.UTC(2026, 0, 1)));
  const locals = [];
  const centrals = [];
  let offset = 0;
  const seen = new Set();
  for (const e of entries) {
    if (!e.name || e.name.startsWith("/") || e.name.includes("..") || e.name.includes("\\")) throw new Error(`bad zip entry name: ${e.name}`);
    if (seen.has(e.name)) throw new Error(`duplicate zip entry: ${e.name}`);
    seen.add(e.name);
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : Buffer.from(e.data);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const stored = deflated.length >= raw.length; // tiny or already-compressed files (PNG) may not shrink
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(raw);
    const name = Buffer.from(e.name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0 (so the permissions below apply)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}
