# EcoTrack: Waste Monitoring System for Pateros

## 1. Functional Requirements

### 1.1 Authentication and Account Management
- FR-01: The system shall allow users to create a citizen account using name, email, and password.
- FR-02: The system shall allow users to log in using email and password.
- FR-03: The system shall allow users to log in using Google authentication.
- FR-04: The system shall support forgot-password via reset code sent through email.
- FR-05: The system shall allow users to reset their password using a valid reset code.
- FR-06: The system shall maintain user sessions and allow users to log out.
- FR-07: The system shall support role-based access for `citizen`, `driver`, and `admin`.

### 1.2 Citizen Mobile Features
- FR-08: The mobile app shall display a live map of garbage truck locations.
- FR-09: The map shall show truck markers with truck ID, status, and coordinates.
- FR-10: The mobile app shall display nearby-truck alerts based on the citizen's current location.
- FR-11: The mobile app shall allow citizens to submit illegal dumping reports.
- FR-12: A report shall include issue type, photo, barangay, street, and contact number.
- FR-13: The mobile app shall display collection schedules.
- FR-14: The mobile app shall display announcements and news.
- FR-15: The mobile app shall update announcements/news in real time when admin publishes updates.

### 1.3 Driver and Fleet Tracking
- FR-16: Driver users shall be able to send periodic GPS updates to the backend.
- FR-17: The backend shall accept and validate truck GPS payloads (truck ID, latitude, longitude, status).
- FR-18: The backend shall broadcast truck updates to all connected clients via WebSocket.
- FR-19: The system shall remove truck visibility when driver/truck tracking is disconnected or removed.

### 1.4 Admin Dashboard
- FR-20: Admin users shall be able to log in to a web dashboard.
- FR-21: Admin users shall be able to view dashboard metrics (active trucks, reports, feed data).
- FR-22: Admin users shall be able to create, read, update, and delete collection schedules.
- FR-23: Admin users shall be able to create, read, update, and delete truck driver accounts.
- FR-24: Admin users shall be able to create, read, update, and delete announcements.
- FR-25: Admin users shall be able to create, read, update, and delete news items.
- FR-26: Admin users shall be able to view submitted issue reports.

### 1.5 Notifications and Messaging
- FR-27: The system shall register mobile device push tokens for authenticated users.
- FR-28: The system shall send push notifications when a new announcement is posted.
- FR-29: The system shall send push notifications when a new news item is posted.
- FR-30: The system shall remove stale push tokens (e.g., unregistered devices) from user records.

### 1.6 Backend API and Data
- FR-31: The backend shall expose REST endpoints for auth, trucks, reports, schedules, announcements, and news.
- FR-32: The backend shall expose protected admin endpoints for dashboard and management CRUD.
- FR-33: The backend shall persist data in MongoDB collections for users, reports, schedules, announcements, news, sessions, and counters.
- FR-34: The backend shall maintain live truck telemetry in memory for low-latency updates.

---

## 2. Non-Functional Requirements

### 2.1 Performance
- NFR-01: The system should broadcast real-time truck updates to connected clients with minimal delay (target under 2 seconds on stable network).
- NFR-02: API endpoints should return standard responses within 3 seconds under normal load.
- NFR-03: Map rendering and marker updates should remain smooth on mid-range Android and iOS devices.

### 2.2 Availability and Reliability
- NFR-04: The backend service should target at least 99% uptime in production.
- NFR-05: Session and password reset data shall persist across backend restarts using MongoDB.
- NFR-06: The system shall gracefully handle transient network interruptions and recover WebSocket connection automatically.

### 2.3 Security
- NFR-07: Passwords shall be stored as secure hashes (scrypt), not plain text.
- NFR-08: Protected endpoints shall require valid authentication tokens.
- NFR-09: Admin endpoints shall require valid admin session tokens.
- NFR-10: CORS shall be restricted in production using explicit allowed origins.
- NFR-11: API keys and sensitive credentials shall be managed via environment variables/secrets and not hardcoded.
- NFR-12: Password reset codes shall expire automatically after a defined TTL.

### 2.4 Scalability and Maintainability
- NFR-13: The backend architecture shall support horizontal scaling for stateless API operations.
- NFR-14: Codebase shall maintain modular separation for mobile screens, services, and backend route concerns.
- NFR-15: Database collections shall have indexes on frequently queried fields (e.g., email, IDs, token TTL fields).

### 2.5 Compatibility and Usability
- NFR-16: The mobile app shall support Android and iOS through Expo/React Native.
- NFR-17: UI shall be responsive across common phone screen sizes.
- NFR-18: Admin dashboard shall be usable on modern desktop browsers.
- NFR-19: Error messages shown to users should be clear and actionable.

### 2.6 Compliance and Operations
- NFR-20: Production configuration shall fail fast when critical environment variables are missing.
- NFR-21: Application logs shall include operational traces for auth, push notifications, and connection errors.
- NFR-22: Build and deployment workflow shall support development, preview, and production profiles.

---

## 3. Suggested Acceptance Criteria Summary
- AC-01: A citizen can sign up, log in, open the map, and see live trucks.
- AC-02: A driver can log in and transmit GPS updates every few seconds.
- AC-03: Admin can create announcement/news and mobile users receive updates and push notifications.
- AC-04: Citizen can submit a report with required fields and admin can view it.
- AC-05: Schedules, announcements, and news are persisted in MongoDB and remain after restart.
- AC-06: Password reset email flow works end-to-end using SMTP credentials.
