# Deployment Guide (Production)

This guide covers backend + mobile production deployment for the Waste Monitoring System.

## 1) Prepare production secrets

### Backend env (`backend/.env`)

Use [backend/.env.production.example](./backend/.env.production.example) as template.

Required values:

- `NODE_ENV=production`
- `MONGODB_URI`
- `MONGODB_DB`
- `ADMIN_PASSWORD_HASH`
- `CORS_ALLOWED_ORIGINS`

Generate admin hash:

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system\backend"
node scripts/hash-password.js "YourStrongAdminPassword"
```

Copy the printed hash into `ADMIN_PASSWORD_HASH`.

### Mobile env (`mobile/.env`)

Use [mobile/.env.production.example](./mobile/.env.production.example) as template.

Required values:

- `EXPO_PUBLIC_API_HOST`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `GOOGLE_MAPS_ANDROID_API_KEY`
- `GOOGLE_MAPS_IOS_API_KEY`

## 2) Run deployment preflight

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system"
$env:NODE_ENV="production"
npm run deploy:check
```

If it fails, fix the missing env values first.

## 3) Build mobile release artifacts

### Android preview APK (internal testing)

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system"
npm run build:android:preview
```

### Android production AAB (Play Store)

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system"
npm run build:android:production
```

### iOS preview / production

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system"
npm run build:ios:preview
npm run build:ios:production
```

## 4) Start backend in production mode

```powershell
cd "C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system\backend"
$env:NODE_ENV="production"
node server.js
```

## 5) Rotate and restrict old Google Maps keys

If keys were previously committed, rotate them immediately.

1. Open Google Cloud Console -> APIs & Services -> Credentials.
2. For each old key:
   - Create replacement key.
   - Restrict API key by app type.
   - Restrict APIs to Maps SDK for Android / Maps SDK for iOS only.
3. Android key restrictions:
   - Set package name: `com.ecotrack.wastemonitoring`
   - Add SHA-1 fingerprints (debug + release as needed)
4. iOS key restrictions:
   - Set bundle ID: `com.ecotrack.wastemonitoring`
5. Update `.env` values with new keys.
6. Rebuild mobile app.
7. Disable/delete old leaked keys.

## 6) Optional post-deploy smoke checks

- Backend health endpoint returns 200: `GET /health`
- Admin login works with hashed admin password
- Mobile login works (email + Google)
- Live truck updates appear on map
- Report submission works with image upload
