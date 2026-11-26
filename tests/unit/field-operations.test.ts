import { describe, expect, it } from "vitest";
import { settingsSchema, siteSchema, reportBounds, reportQuerySchema, csvCell, moneyMinorSchema } from "../../src/modules/field-operations/field-operations.schema.js";
import { cameraCheckInSchema } from "../../src/modules/attendance/attendance.schema.js";
import { validateCameraTimes } from "../../src/modules/attendance/attendance-selfie.service.js";

describe("field payroll contracts", () => {
  it("supports fixed monthly currency and valid company timezone", () => {
    expect(settingsSchema.parse({})).toEqual({ currency: "INR", timezone: "Asia/Kolkata" });
    expect(settingsSchema.safeParse({ currency: "INR", timezone: "Asia/Kolkata" }).success).toBe(true);
    expect(settingsSchema.safeParse({ currency: "JPY", timezone: "UTC" }).success).toBe(false);
    expect(settingsSchema.safeParse({ currency: "ABC", timezone: "UTC" }).success).toBe(false);
    expect(settingsSchema.safeParse({ currency: "USD", timezone: "Not/AZone" }).success).toBe(false);
  });
  it("requires a departure boundary farther than the arrival boundary", () => {
    const site = { name: "Warehouse A", latitude: 19, longitude: 73, arrival_radius_m: 100, departure_radius_m: 500, visit_rate_minor: 12500 };
    expect(siteSchema.safeParse(site).success).toBe(true);
    expect(siteSchema.safeParse({ ...site, departure_radius_m: 100 }).success).toBe(false);
    expect(siteSchema.safeParse({ ...site, visit_rate_minor: 12.5 }).success).toBe(false);
  });
  it("uses exact integer minor units", () => {
    for (const value of [-1, 1.1, Infinity, 100_000_000_001]) expect(moneyMinorSchema.safeParse(value).success).toBe(false);
    expect(moneyMinorSchema.parse(12345)).toBe(12345);
  });
  it("handles Monday weeks, year boundaries and leap-year months", () => {
    expect(reportBounds({ period: "week", date: "2027-01-03" })).toEqual({ from: "2026-12-28", to: "2027-01-04" });
    expect(reportBounds({ period: "week", date: "2026-11-23" })).toEqual({ from: "2026-11-23", to: "2026-11-30" });
    expect(reportBounds({ period: "month", date: "2028-02-29" })).toEqual({ from: "2028-02-01", to: "2028-03-01" });
    expect(reportQuerySchema.safeParse({ period: "month", date: "2026-02-30" }).success).toBe(false);
  });
  it("supports single company dates and inclusive bounded date ranges", () => {
    expect(reportBounds({ period: "day", date: "2028-02-29" })).toEqual({ from: "2028-02-29", to: "2028-03-01" });
    expect(reportBounds({ period: "range", from: "2026-11-24", to: "2026-11-24" }))
      .toEqual({ from: "2026-11-24", to: "2026-11-25" });
    expect(reportQuerySchema.safeParse({ period: "range", from: "2026-11-24", to: "2026-11-23" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ period: "range", from: "2025-11-24", to: "2026-12-01" }).success).toBe(false);
  });
  it("escapes spreadsheet formulas and quotes in CSV", () => {
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(csvCell("Warehouse, A")).toBe('"Warehouse, A"');
    expect(csvCell(123.45)).toBe('"123.45"');
  });
});
describe("fresh camera attendance", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  const body = { challenge_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", latitude: 19, longitude: 73, accuracy: 10,
    captured_at: new Date(now).toISOString(), location_at: new Date(now).toISOString() };
  it("requires both selfie challenge and GPS", () => {
    expect(cameraCheckInSchema.safeParse({}).success).toBe(false);
    expect(cameraCheckInSchema.safeParse(body).success).toBe(true);
    expect(cameraCheckInSchema.safeParse({ ...body, accuracy: 101 }).success).toBe(false);
  });
  it("rejects stale or future photos and GPS fixes", () => {
    expect(() => validateCameraTimes(body, now)).not.toThrow();
    expect(() => validateCameraTimes({ ...body, captured_at: new Date(now - 120001).toISOString() }, now)).toThrow(/fresh/);
    expect(() => validateCameraTimes({ ...body, location_at: new Date(now + 30001).toISOString() }, now)).toThrow(/fresh/);
  });
});
