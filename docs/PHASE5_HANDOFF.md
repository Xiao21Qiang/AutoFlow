# AutoFlow Web Phase 5 Handoff

Date: 2026-07-19
Timezone: Asia/Manila

## Export Inventory

| Screen | Format | Route/helper | Authorized roles | Data source | Audit event |
| --- | --- | --- | --- | --- | --- |
| Customer Payments invoice modal | PDF | `GET /api/admin/invoices/:id/pdf` | Owning customer, Admin, authorized staff finance/payment readers | `invoiceDomain.buildInvoiceDto` from scoped payment + booking | `Invoice PDF downloaded` |
| Admin/Staff Payment Tracking | PDF/CSV route, PDF UI | `GET /api/admin/reports/payments/:format` | Admin, staff with Payment Tracking | Scoped payment invoice DTOs | `Report exported` |
| Admin Bookings | PDF/CSV route, PDF UI | `GET /api/admin/reports/bookings/:format` | Admin, staff with Booking view | Scoped bookings + invoice payment summaries | `Report exported` |
| Admin Service Tracking | PDF/CSV route, PDF UI | `GET /api/admin/reports/tracking/:format` | Admin, staff with Tracking view | Scoped bookings/tracking fields | `Report exported` |
| Admin Stock Monitoring | PDF/CSV route, PDF UI | `GET /api/admin/reports/stock/:format` | Admin, staff with Stock view | Scoped stock items via shared stock helper | `Report exported` |
| Admin Services | PDF/CSV route, PDF UI | `GET /api/admin/reports/services/:format` | Admin, staff with Services module | Scoped service catalog DTOs | `Report exported` |
| Admin Financial Tracker | PDF/CSV route, PDF UI | `GET /api/admin/reports/financial/:format` | Admin, staff with Financial Tracker including General Manager read-only | `invoiceDomain.buildFinancialReportDto` | `Report exported` |
| Admin Analytics | PDF/CSV route, PDF UI | `GET /api/admin/reports/analytics/:format` | Admin, staff with Analytics including General Manager read-only | `buildBusinessSummary` and scoped review/service counts | `Report exported` |
| Admin Detailer Management | PDF/CSV route, PDF UI | `GET /api/admin/reports/detailer-management/:format` | Admin, staff with Detailer Management | Scoped bookings and scoped commissions | `Report exported` |
| Staff My Work | PDF/CSV route, PDF UI | `GET /api/admin/reports/my-work/:format` | Staff with My Work | Scoped assigned/supervised bookings | `Report exported` |
| Commission Report | PDF/CSV route | `GET /api/admin/reports/commissions/:format` | Admin, staff with commission export | Scoped commissions only | `Report exported` |
| Admin Audit Logs | PDF/CSV route, PDF UI | `GET /api/admin/reports/audit-logs/:format` | Admin, staff with Audit Logs | Scoped audit logs | `Report exported` |
| Admin Reviews | PDF/CSV route, PDF UI | `GET /api/admin/reports/reviews/:format` | Admin, staff with Engagement view | Scoped reviews | `Report exported` |
| Admin Promotions | PDF/CSV route, PDF UI | `GET /api/admin/reports/promotions/:format` | Admin, staff with Engagement view | Scoped promos | `Report exported` |
| Admin Reward Pool | PDF/CSV route, PDF UI | `GET /api/admin/reports/rewards/:format` | Admin, staff with Engagement view | Scoped rewards | `Report exported` |
| Admin Reward History | PDF/CSV route, PDF UI | `GET /api/admin/reports/reward-history/:format` | Admin, staff with Engagement view | Scoped customer rewards | `Report exported` |
| Detailer row print | Browser print only | `exportTabularPdf` | Visible row only | Already-rendered row data | No PDF label; action is labelled Print |

## PDF and CSV

PDFs are generated server-side with `pdfkit`. Responses use `application/pdf` and `Content-Disposition: attachment`; filenames are sanitized and contain no private reference values. Tables use margins, page numbers, wrapped text, and page breaks.

CSV responses use UTF-8 with BOM, quoted cells, CRLF rows, safe filenames, and formula-injection protection for text cells beginning with `=`, `+`, `-`, or `@`. Numeric columns are preserved as numeric values.

## Audit Coverage

Exports audit actor ID, role, user type, action, entity/report type, format, filters, record count, result, and failure reason where applicable. Export documents, proof images, auth headers, secrets, hashes, tokens, and raw AI prompts/responses are intentionally excluded.

AI analytics, financial interpretation, and tracking issue-note requests audit feature, model identifier when available, date range or booking ID, duration, result, response type, and safe error category. Financial and analytics AI handlers now build model inputs from backend-scoped summaries instead of trusting client totals.

## Closed UX Gaps

- `Rescheduled` was removed from active booking/tracking status selectors. Schedule edits persist active status `Scheduled`; schedule changes audit as `Rescheduled booking`.
- Staff My Work now has an authorized detail modal from scoped rows.
- Reward History now has filters for customer/search, status, reward type, code, booking ID, milestone, granted date, used date, and date range over the full scoped dataset.
- Misleading PDF buttons now use downloadable backend PDFs. The remaining print-only detail action is labelled `Print`.

## Demo Checklist

### Admin
1. Sign in as Admin.
2. Review dashboard counts and low-stock alert.
3. Create/edit staff and customer records.
4. Review bookings, schedule a pending booking, and reschedule a Scheduled booking.
5. Verify payment stages and open/download invoice PDF.
6. Create/edit/archive expenses.
7. Create/edit/restock stock items.
8. Review detailer assignments and commissions.
9. Generate analytics and finance AI interpretations.
10. Export bookings, payments, finance, analytics, stock, engagement, audit, and reward reports.
11. Review audit logs for export and AI events.

### General Manager
1. Sign in as General Manager.
2. Open Finance and Analytics in read-only mode.
3. Download authorized reports and invoice PDFs.
4. Generate read-only AI interpretations.
5. Attempt blocked finance mutation and confirm denial.

### Staff
1. Sign in as Sales/Inventory/Detailer role.
2. Verify only authorized modules appear.
3. Export only role-authorized operational reports.
4. Attempt blocked Admin-only finance/audit/reward export.

### Senior Detailer
1. Open My Work.
2. View own assigned work and junior supervised work details.
3. Confirm junior commission amounts are not exposed.
4. Download My Work report.

### Customer
1. Register/sign in.
2. Add saved vehicle and create date-only booking.
3. Upload downpayment/final payment proof.
4. Open tracking/warranty where eligible.
5. Download own invoice PDF.
6. Use promotion/reward and submit eligible review.
7. Confirm personal activity excludes other customer data.

## Remaining Verification Notes

The final required commands must still be run after all patches: `node --check server/server.js`, `node --check server/models.js`, syntax checks for new backend files, `git diff --check`, full `CI=true npm test -- --watchAll=false`, and `npm run build`.
