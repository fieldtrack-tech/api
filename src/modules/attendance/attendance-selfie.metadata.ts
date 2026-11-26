/** Read standard JPEG GPS EXIF without evaluating or decoding image content.
 * All TIFF offsets are bounded to the APP1 segment, not the entire upload. */
export function selfieGpsLocation(jpeg: Uint8Array): { latitude: number; longitude: number } | null {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Invalid JPEG");
  let offset = 2;
  while (offset < jpeg.length) {
    if (jpeg[offset] !== 0xff) throw new Error("Invalid JPEG marker");
    while (jpeg[offset] === 0xff) offset++;
    const marker = jpeg[offset++];
    if (marker === 0xda || marker === 0xd9) return null; // EXIF must precede scan data.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > jpeg.length) throw new Error("Truncated JPEG segment");
    const length = jpeg[offset] * 256 + jpeg[offset + 1];
    if (length < 2 || offset + length > jpeg.length) throw new Error("Invalid JPEG segment length");
    if (marker === 0xe1 && length >= 16 && jpeg[offset + 2] === 0x45 && jpeg[offset + 3] === 0x78
      && jpeg[offset + 4] === 0x69 && jpeg[offset + 5] === 0x66 && jpeg[offset + 6] === 0 && jpeg[offset + 7] === 0) {
      const tiff = new DataView(jpeg.buffer, jpeg.byteOffset + offset + 8, length - 8);
      const gps = tiffGpsLocation(tiff);
      if (gps) return gps;
    }
    offset += length;
  }
  return null;
}

function tiffGpsLocation(tiff: DataView) {
  const order = tiff.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) throw new Error("Invalid EXIF byte order");
  const little = order === 0x4949;
  const u16 = (offset: number) => tiff.getUint16(offset, little);
  const u32 = (offset: number) => tiff.getUint32(offset, little);
  if (u16(2) !== 42) throw new Error("Invalid EXIF signature");
  type Entry = { offset: number; type: number; count: number; value: number };
  const entries = (offset: number): Map<number, Entry> => {
    if (offset < 8) throw new Error("Invalid EXIF directory offset");
    const count = u16(offset);
    if (count > 256 || offset + 2 + count * 12 + 4 > tiff.byteLength) throw new Error("Invalid EXIF directory size");
    const result = new Map<number, Entry>();
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      result.set(u16(at), { offset: at, type: u16(at + 2), count: u32(at + 4), value: u32(at + 8) });
    }
    return result;
  };
  const pointer = entries(u32(4)).get(0x8825);
  if (!pointer) return null;
  if (pointer.type !== 4 || pointer.count !== 1) throw new Error("Invalid EXIF GPS pointer");
  const gps = entries(pointer.value);
  const ref = (tag: number, positive: string, negative: string): number => {
    const entry = gps.get(tag);
    if (!entry || entry.type !== 2 || entry.count !== 2) throw new Error("Missing EXIF GPS reference");
    const value = String.fromCharCode(tiff.getUint8(entry.offset + 8));
    if (value !== positive && value !== negative) throw new Error("Invalid EXIF GPS reference");
    return value === positive ? 1 : -1;
  };
  const coordinate = (tag: number): number => {
    const entry = gps.get(tag);
    if (!entry || entry.type !== 5 || entry.count !== 3 || entry.value < 8 || entry.value + 24 > tiff.byteLength)
      throw new Error("Missing EXIF GPS coordinates");
    const values = [0, 1, 2].map((i) => {
      const denominator = u32(entry.value + i * 8 + 4);
      if (!denominator) throw new Error("Invalid EXIF GPS rational");
      return u32(entry.value + i * 8) / denominator;
    });
    if (values[1] >= 60 || values[2] >= 60) throw new Error("Invalid EXIF GPS minutes/seconds");
    return values[0] + values[1] / 60 + values[2] / 3600;
  };
  const latitude = coordinate(2) * ref(1, "N", "S");
  const longitude = coordinate(4) * ref(3, "E", "W");
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("EXIF GPS is out of range");
  return { latitude, longitude };
}
