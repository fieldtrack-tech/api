# Field tracking and payroll

## Company setup

The admin sets the company timezone and currency in **Field & Payroll**. The defaults are Asia/Kolkata and INR. These settings stay fixed so historical reports use the same day boundaries and currency.

Add each warehouse or work site with coordinates, an arrival radius, a larger departure radius, and a per-visit rate. Employees choose from the company's configured sites. Each site maintains its own visit history, so overlapping geofences can count visits to both sites.

Set each employee's basic pay from the effective month. A rate applies to that month and subsequent months until another rate takes effect. Ended months and months with recorded base payments retain their rates. Attendance and work hours do not reduce basic pay.

## Attendance and visits

Employees start work by taking a front-camera JPEG selfie with a fresh GPS fix. The photo has a visible location, accuracy, and timestamp footer and stores its GPS location in EXIF. Each upload uses a private, one-use challenge. The server checks the embedded coordinates against the attendance request and decodes the image. It accepts JPEGs up to 5 MB, 2048 pixels per side, and 4 million pixels total.

The admin's live map reads the latest available GPS fix for each active shift and supports an individual employee view. Android sends locations during a shift and retains unsent points for retry when connectivity returns. The GPS API accepts points from the last 48 hours within their own shift's boundaries, including recently closed shifts.

When an employee confirms a site arrival, the server checks a GPS fix from the last 60 seconds against that site. The reported accuracy must be 100 metres or better. The distance to the site plus that accuracy must fit inside the arrival radius. A repeat payable visit requires GPS evidence from beyond the larger departure radius, then a return during the shift. The first manual confirmation at a site can count without a departure fix. Successful arrival confirmation can also return a zero-amount receipt when the repeat trip is unverified.

Automatic visit detection uses the geofence and rate that were effective when the GPS reading was captured. A late point can provide evidence for a missed trip. Previously counted visits keep their receipt IDs, arrival times, and rates.

## Reports and payment records

Daily, weekly, monthly, and custom-range reports use the company timezone. Weeks run Monday through Sunday. In custom selections both dates are inclusive, with a maximum of 366 days. The API returns an exclusive end date.

Each report shows check-ins, days attended, work time, and verified visits with their rates. An overnight shift contributes time to the dates it touches, with its check-in counted on the starting date. For active shifts, elapsed time is calculated when the report is read.

Visit pay is the sum of verified visit rates in the period. Basic pay appears separately for each complete calendar month in the selection. A day, week, or partial-month range shows visit pay. A custom selection covering multiple complete calendar months includes each month's basic pay once. A missing basic rate leaves the combined total unavailable.

From a single employee's report, an admin can review outstanding visit pay, basic pay, or both and record a payment made outside FieldTrack. Each stored payment carries the actor, amount, currency, period, reference, and the visits or monthly rates it covers. Overlapping cycles only include unpaid components in subsequent payment previews. Recorded receipts keep their amounts as reporting inputs change.

## Data retention

The API runs an initial cleanup and repeats it every five minutes, independent of the Redis workers. It removes expired GPS breadcrumbs, copied last-known GPS coordinates, and check-in GPS coordinates after three calendar months in UTC. It removes expired attendance selfies through the private Storage API. Unused selfie challenges and any uploads made against them expire after a one-day grace period.

The cleanup keeps attendance timestamps and selfie verification status, verified visit records and rates, basic salary history, recorded payments, and summarized work metrics. Old attendance and payroll reports can still be calculated from those records.

## API

| Route | Access and data |
|---|---|
| `POST /attendance/selfie-challenge` | Employee. Returns a one-use challenge and signed upload URL. |
| `POST /attendance/check-in` | Employee. After uploading the JPEG, submit `challenge_id`, `latitude`, `longitude`, `accuracy`, `captured_at`, and `location_at`. |
| `GET /attendance/:sessionId/selfie` | Employee's own session or an admin in the same company. Returns a 60-second signed URL while the file is retained. |
| `GET /field/settings`, `GET /field/sites` | Authenticated company members. |
| `POST /field/sites/:id/reach` | Employee. Submit `latitude`, `longitude`, `accuracy`, and `recorded_at`. |
| `GET /admin/monitoring/map` | Admin. Latest active-shift markers. Accepts an optional `employeeId` filter. |
| `POST /admin/field/settings` | Admin. Set `currency` and `timezone` once. |
| `POST /admin/field/sites`, `PATCH /admin/field/sites/:id` | Admin. Save a complete site definition. |
| `GET /admin/field/basic-pay`, `POST /admin/field/basic-pay/:employeeId` | Admin. List rates or save `effective_month` (YYYY-MM-01) and `amount_minor`. |
| `GET /field/my-report` | Employee's own report. |
| `GET /admin/field/reports`, `GET /admin/field/reports/export` | Admin. Company data with an optional `employee_id`. Export returns a filename and CSV. |
| `GET /admin/field/payments/:employeeId/preview` | Admin. Review outstanding amounts using the same date selection as a report plus optional `component` (`both`, `visits`, or `basic`). |
| `GET /admin/field/payments/:employeeId` | Admin. Read preserved payment records. |
| `POST /admin/field/payments/:employeeId` | Admin. Record an external payment using the selection and component from preview, `expected_total_minor`, an optional reference, and an optional UUID `request_id` for safe retries. |

For day, week, or month reports, send `period` and `date` (YYYY-MM-DD). For custom dates, send `period=range` and `from` and `to` (YYYY-MM-DD). Monetary fields ending in `_minor` are integer minor units. For example, 12500 represents INR 125.00.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, and `node scripts/test-migration-replay.mjs` from the API directory. Run `npm run build` and `npm run test:selfie` from the web directory. Build Android with `:app:assembleDebug`. The PGlite tests cover the forward migration chain, date boundaries, late GPS uploads, payment duplication, and cleanup against isolated PostgreSQL.
