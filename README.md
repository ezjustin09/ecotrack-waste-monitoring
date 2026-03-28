# EcoTrack

EcoTrack is a cross-platform waste collection monitoring system tailored for Pateros City. This MVP is delivered as a responsive Progressive Web App (PWA) backed by a lightweight local Node.js API, so it runs on phones, tablets, laptops, and desktop browsers without external dependencies.

## What it does

- Shows city-wide collection KPIs for the current shift
- Tracks route progress, truck assignments, and collection completion
- Monitors barangay service coverage across Pateros
- Logs and resolves collection incidents such as overflow bins and missed pickups
- Works as an installable PWA for field supervisors and dispatch staff
- Caches the shell for better resilience when connectivity is unstable

## Pateros-specific coverage

The seeded dataset includes the following barangays:

- Aguho
- Magtanggol
- Martires del 96
- Poblacion
- San Pedro
- San Roque
- Santa Ana
- Santo Rosario-Kanluran
- Santo Rosario-Silangan
- Tabacalera

## Run locally

1. Make sure Node.js 18+ is available.
2. Start the server:

```bash
node server.js
```

3. Open [http://localhost:3000](http://localhost:3000)

You can also reset the dataset back to the original seeded state with:

```bash
node server.js --reset-data
```

## Project structure

- `server.js` - static file server and local JSON API
- `data/seed.json` - seeded Pateros waste collection data
- `public/index.html` - app shell
- `public/styles.css` - visual design and responsive layout
- `public/app.js` - client-side state, rendering, and API calls
- `public/sw.js` - service worker for offline shell caching
- `public/manifest.webmanifest` - PWA metadata

## Available API endpoints

- `GET /api/health`
- `GET /api/dashboard`
- `POST /api/issues`
- `PATCH /api/issues/:id/resolve`
- `PATCH /api/routes/:id/advance`

## Suggested next upgrades

- Add authentication for dispatchers, truck crews, and city administrators
- Attach GPS telemetry from collection vehicles
- Add real map layers for route visualization and heat zones
- Persist data in SQLite or PostgreSQL instead of JSON files
- Send SMS or Viber alerts for critical incidents
