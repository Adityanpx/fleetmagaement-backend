# Bulker Fleet Manager — Backend

REST API for a single-owner cement **bulker** transport business: vehicles, drivers, companies, trips, expenses, freight payments and driver settlements. Node.js + Express + PostgreSQL (Supabase via `pg`), JWT auth for one owner account.

All money logic lives in two SQL views in `src/db/schema.sql`:

- **`trip_financials`**
  - `income = freight − company_diesel` when the trip's deduct switch is on, otherwise `freight`. A cancelled trip has income `0`.
  - `owner_cost` = expenses that are not advances and were paid by us or the driver.
  - `profit = income − owner_cost`, `pending = income − received`.
- **`driver_balances`**: `balance = own_spend − advances + (received_from_driver − paid_to_driver)`. A positive balance means we owe the driver.

## Setup

1. `npm install`
2. Create a Supabase project.
3. Create the schema: paste `src/db/schema.sql` into the Supabase SQL editor and run it, **or** run `npm run db:schema`. Both are safe to re-run.
4. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL`: use the **Session pooler** URI (`*.pooler.supabase.com:5432`). The direct `db.xxx.supabase.co` host only works over IPv6, so Render can't reach it. URL-encode special characters in the password (`@` → `%40`), and don't add `?sslmode=`.
   - Set a long random `JWT_SECRET` and a strong `OWNER_PASSWORD`.
5. `npm run seed`: creates or updates the owner login from `OWNER_USERNAME` / `OWNER_PASSWORD`. Re-run it after changing the password.
6. `npm run dev` for local work (auto-reload), or `npm start` in production.

Health check: `GET /health`

## API

All routes are under `/api`. Every route except `POST /auth/login` needs the header `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ username, password }` → `{ token, user }` |
| GET | `/auth/me` | |
| GET/POST | `/vehicles` | `?active=true` |
| GET/PUT/DELETE | `/vehicles/:id` | DELETE soft-deletes if the vehicle has trips |
| GET/POST | `/drivers` | list includes `balance` |
| GET/PUT/DELETE | `/drivers/:id` | GET includes the balance breakdown and settlements |
| POST | `/drivers/:id/settlements` | `{ amount, direction: paid_to_driver\|received_from_driver, settle_date, trip_id?, note? }` |
| DELETE | `/drivers/:id/settlements/:settlementId` | |
| GET/POST | `/companies` | |
| GET/PUT/DELETE | `/companies/:id` | GET includes a `ledger` |
| GET/POST | `/trips` | filters below; `deduct_company_diesel` defaults to the company's setting |
| GET/PUT/DELETE | `/trips/:id` | GET includes financials, expenses and payments |
| PATCH | `/trips/:id/status` | `completed` needs `actual_end_date` and `end_odometer`; `cancelled` needs `cancel_reason` |
| POST | `/trips/:id/payments` | `{ amount, payment_date, mode?, note? }` |
| DELETE | `/trips/:id/payments/:paymentId` | |
| GET/POST | `/trips/:tripId/expenses` | diesel: `amount` = litres × rate if omitted; `fill_location` required |
| PUT/DELETE | `/expenses/:id` | |
| GET | `/dashboard` | tiles, expenses by category, profit by vehicle, monthly trend, running trips, document expiries, driver dues |
| GET | `/reports/trips` \| `vehicles` \| `expenses` \| `fuel` \| `drivers` \| `companies` | |

**Filters** (trip lists, dashboard, reports): `from`, `to` (compared against trip `start_date`), `vehicle_id`, `driver_id`, `company_id`, `status`.

**Formats**
- Dates are `YYYY-MM-DD` strings.
- Money, litres and km are JSON numbers.
- Errors look like `{ error, details? }`.
- Enum values:
  - Expense `category`: `advance diesel toll food fine parking loading_unloading tyre repair other`
  - `paid_by`: `ourselves company driver`
  - `mode`: `cash upi bank card`
