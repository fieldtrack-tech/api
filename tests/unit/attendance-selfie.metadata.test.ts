import { describe, expect, it } from "vitest";
import { selfieGpsLocation } from "../../src/modules/attendance/attendance-selfie.metadata.js";
import { gpsSelfieFixture } from "../setup/selfie-fixture.js";

describe("embedded GPS EXIF validation", () => {
  it.each([true, false])("reads standard GPS in little-endian = %s TIFF", (little) => {
    const location = selfieGpsLocation(gpsSelfieFixture(-33.8688, 151.2093, little));
    expect(location?.latitude).toBeCloseTo(-33.8688, 8); expect(location?.longitude).toBeCloseTo(151.2093, 8);
  });
  it.each([[0, 0], [90, 180], [40.7128, -74.006]])("supports valid coordinates %s, %s", (latitude, longitude) => {
    expect(selfieGpsLocation(gpsSelfieFixture(latitude, longitude))?.latitude).toBeCloseTo(latitude, 8);
    expect(selfieGpsLocation(gpsSelfieFixture(latitude, longitude))?.longitude).toBeCloseTo(longitude, 8);
  });
  it("rejects offset escape attempts, invalid rational denominators and corrupted JPEG lengths", () => {
    const bytes = gpsSelfieFixture(); const view = new DataView(bytes.buffer);
    view.setUint32(12 + 4, 0xffffffff, true);
    expect(() => selfieGpsLocation(bytes)).toThrow();
    const badRational = gpsSelfieFixture(); new DataView(badRational.buffer).setUint32(12 + 84, 0, true);
    expect(() => selfieGpsLocation(badRational)).toThrow(/rational/);
    const badLength = gpsSelfieFixture(); badLength[4] = 0xff; badLength[5] = 0xff;
    expect(() => selfieGpsLocation(badLength)).toThrow(/length/);
  });
  it("rejects out-of-range embedded coordinates", () => {
    expect(() => selfieGpsLocation(gpsSelfieFixture(91, 73))).toThrow(/range/);
  });
  it("does not read metadata from JPEG scan/pixel data", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xda, ...gpsSelfieFixture()]);
    expect(selfieGpsLocation(jpeg)).toBeNull();
  });
});
