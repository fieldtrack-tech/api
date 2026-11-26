// Solid 32 x 32 test frame with no personal data.
const JPEG_FRAME = Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAID/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AjANUAAAAAAP/2Q==", "base64");

export function gpsSelfieFixture(latitude = 19, longitude = 73, little = true) {
  const tiff = new Uint8Array(128);
  const view = new DataView(tiff.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, little);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, little);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    u16(at, tag); u16(at + 2, type); u32(at + 4, count); u32(at + 8, value);
  };
  tiff.set(little ? [0x49, 0x49] : [0x4d, 0x4d]); u16(2, 42); u32(4, 8);
  u16(8, 1); entry(10, 0x8825, 4, 1, 26); u16(26, 4);
  entry(28, 1, 2, 2, 0); tiff[36] = latitude < 0 ? 0x53 : 0x4e;
  entry(40, 2, 5, 3, 80);
  entry(52, 3, 2, 2, 0); tiff[60] = longitude < 0 ? 0x57 : 0x45;
  entry(64, 4, 5, 3, 104);
  const coordinate = (offset: number, value: number) => {
    const microseconds = Math.round(Math.abs(value) * 3600 * 1_000_000);
    const remainder = microseconds % 3_600_000_000;
    u32(offset, Math.floor(microseconds / 3_600_000_000)); u32(offset + 4, 1);
    u32(offset + 8, Math.floor(remainder / 60_000_000)); u32(offset + 12, 1);
    u32(offset + 16, remainder % 60_000_000); u32(offset + 20, 1_000_000);
  };
  coordinate(80, latitude); coordinate(104, longitude);
  const jpeg = new Uint8Array(138 + JPEG_FRAME.length);
  jpeg.set([0xff, 0xd8, 0xff, 0xe1]); new DataView(jpeg.buffer).setUint16(4, 136);
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6); jpeg.set(tiff, 12); jpeg.set(JPEG_FRAME.subarray(2), 140);
  return jpeg;
}
