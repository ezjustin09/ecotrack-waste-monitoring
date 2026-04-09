# Waste Monitoring System

A full-stack waste monitoring demo with:

- Expo React Native citizen app
- Node.js Express backend
- Socket.IO real-time truck updates
- `react-native-maps` live truck tracking
- Driver simulator that pushes GPS data every 5 seconds

## Project Structure

```text
waste-monitoring-system/
|-- backend/
|   |-- package.json
|   |-- server.js
|   `-- driverSimulator.js
|-- mobile/
|   |-- package.json
|   |-- app.json
|   |-- babel.config.js
|   |-- App.js
|   `-- src/
|       |-- components/
|       |   `-- TruckMarker.js
|       |-- navigation/
|       |   `-- RootTabs.js
|       |-- screens/
|       |   |-- MapScreen.js
|       |   `-- ReportScreen.js
|       |-- services/
|       |   |-- api.js
|       |   `-- socket.js
|       `-- utils/
|           `-- region.js
`-- package.json
```

## 1. Install Dependencies

From `C:\Users\USER\OneDrive - STI College Global City\Documents\Playground\waste-monitoring-system`:

```powershell
npm.cmd install
```

If you prefer installing package-by-package:

```powershell
Set-Location backend
npm.cmd install
Set-Location ..\mobile
npm.cmd install
```

## 2. Run The Backend

```powershell
npm.cmd run start:backend
```

The API will start on `http://localhost:4000`.

Available endpoints:

- `GET /trucks`
- `POST /report`

## 3. Run The Driver Simulator

In a second terminal:

```powershell
npm.cmd run simulate:driver
```

You can also target a custom truck and server:

```powershell
Set-Location backend
$env:SERVER_URL = "http://localhost:4000"
node driverSimulator.js TRUCK-LIVE
```

## 4. Run The Expo App

In a third terminal:

```powershell
npm.cmd run start:mobile
```

For a physical device, point the app to your computer IP:

```powershell
$env:EXPO_PUBLIC_API_HOST = "192.168.1.10"
npm.cmd run start:mobile
```

Notes:

- Android emulator usually works with `10.0.2.2`
- iOS simulator usually works with `localhost`
- Physical devices need your computer's LAN IP

## 5. Google Login Setup

Set these environment variables before starting mobile:

```powershell
$env:EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = "your-android-client-id.apps.googleusercontent.com"
$env:EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "your-ios-client-id.apps.googleusercontent.com"
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "your-web-client-id.apps.googleusercontent.com"
# Optional for Expo Go auth proxy
$env:EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID = "your-expo-client-id.apps.googleusercontent.com"
```

Backend token audience validation should include every Google client ID you use:

```powershell
$env:GOOGLE_WEB_CLIENT_ID = "your-web-client-id.apps.googleusercontent.com"
$env:GOOGLE_ANDROID_CLIENT_ID = "your-android-client-id.apps.googleusercontent.com"
$env:GOOGLE_IOS_CLIENT_ID = "your-ios-client-id.apps.googleusercontent.com"
```

After changing app scheme settings in `app.json`, rebuild and reinstall your development build once.
Then run backend + mobile as usual.

## Mobile Features

- Live map with real-time garbage truck markers
- Truck marker details for `truckId`, `status`, and coordinates
- Illegal dumping report form with description and location
- Current-location autofill using Expo Location

## Backend Features

- Express API
- Socket.IO real-time broadcast layer
- In-memory truck location store
- In-memory report store

## Example Report Payload

```json
{
  "description": "Large pile of trash near the creek.",
  "location": {
    "latitude": 14.5448,
    "longitude": 121.0687
  }
}
```
