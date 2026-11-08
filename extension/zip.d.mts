export type ZipEntry = { name: string; data: Uint8Array | string };
export function crc32(data: Uint8Array): number;
export function crc32Fallback(data: Uint8Array): number;
export function zipFiles(entries: ZipEntry[], opts?: { date?: Date }): Buffer;
