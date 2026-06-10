# Manufacturing Performance Monitor Backend

This backend is the future central API/database layer for the dashboard.

The current frontend is still browser-local until it is intentionally refactored to call these APIs.

## Current Database

The implemented backend database is server-owned SQLite:

```text
backend/data/manufacturing.db
```

SQLite is accessed only through the Python API. Browsers should not open or write the database file directly.

## PostgreSQL Readiness

The API routes call repository modules in `backend/queries/`.

The repository modules call the `Database` interface in `backend/database.py`.

That means PostgreSQL can be added later by implementing a new database adapter without rewriting the route handlers.

## Environment Variables

```text
DB_BACKEND=sqlite
APP_DATA_DIR=backend/data
SQLITE_PATH=backend/data/manufacturing.db
CORS_ORIGINS=http://localhost:8765,http://127.0.0.1:8765
```

`DB_BACKEND=postgres` is reserved for the future PostgreSQL adapter.

## Install

```bash
pip install -r backend/requirements.txt
```

## Run

```bash
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

API docs are available at:

```text
http://127.0.0.1:8000/docs
```

## Main API Groups

```text
GET/POST/DELETE /api/actual-costs
GET/POST/DELETE /api/ob-targets
GET/POST/DELETE /api/runrate/monthly
GET/POST/DELETE /api/runrate/weekly
GET/POST/DELETE /api/manhours
GET             /api/dashboard/cost
GET             /api/dashboard/production
GET             /api/dashboard/runrate-summary
GET             /api/dashboard/manhours-summary
GET             /api/dashboard/ob-actual
```
