# PUPT-FLSS

Streamlining the academic scheduling at PUP Taguig.

---

## Table of Contents
- [Version and Technology](#version-and-technology)
- [File Architecture](#file-architecture)
- [Onboarding & Setup Guide](#onboarding--setup-guide)
  - [Prerequisites](#prerequisites)
  - [Frontend Setup](#frontend-setup)
  - [Backend Setup](#backend-setup)
- [Commands and Testing](#commands-and-testing)
  - [Build Command](#build-command)
  - [Angular Tests](#angular-tests)
  - [Backend Artisan Commands](#backend-artisan-commands)
- [External Integration Endpoints](#external-integration-endpoints)

---

## Version and Technology

### Frontend
- **Framework**: Angular 19 (`^19.2.0`)
- **Language**: TypeScript (`^5.7.3`)
- **Styling & UI**: Angular Material (`^19.2.0`), SCSS
- **Calendar & Analytics**:
  - FullCalendar (`^6.1.16`)
  - Chart.js (`^4.5.1`), ng2-charts (`^6.0.1`)
- **Machine Learning Integration**: ONNX Runtime Web (`^1.25.1`)
- **Document Export**: ExcelJS (`^4.4.0`), jsPDF (`>=4.2.1`), jsPDF-AutoTable (`^3.8.3`)

### Backend
- **Framework**: Laravel Framework 11 (`^11.0`)
- **Language**: PHP (`^8.1`)
- **Authentication**: Laravel Sanctum (`^4.0`), Custom IDP / OAuth2, HMAC Auth
- **Storage & Utilities**: Azure Storage (`^2.0`), League CSV (`^9.20`), Guzzle (`^7.2`)

### Machine Learning
- **Framework / Tools**: Python, Jupyter Notebooks, ONNX Model Export

---

## File Architecture

The repository is structured into the following main directories:

- [frontend/](frontend)
  - `src/app/`: Angular components, services, guards, models, and routes.
  - `src/assets/`: Static image assets and icons.
  - `src/environments/`: Client environment configuration.
  - `post-build.js`: Post-build execution script.
- [backend/](backend)
  - `app/Http/Controllers/`: API request handlers.
  - `app/Http/Middleware/`: Middleware (HMAC verification, Sanctum auth, rate limiting).
  - `app/Console/Commands/`: Custom Artisan backend CLI commands.
  - `routes/api.php`: Core API routes and external partner endpoints.
  - `database/`: Database migrations, seeders, and CSV seed data.
- [ml/](ml)
  - `notebooks/`: Machine learning model training scripts and data analysis.
  - `ml_training_guide.md`: Guide for training ML scheduling models.

---

## Onboarding & Setup Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PHP**: ^8.1
- **Composer**: ^2.0
- **Database**: MySQL 8.0+

### Frontend Setup
1. **Install Angular CLI Globally**:
   ```bash
   npm install -g @angular/cli
   ```

2. **Navigate to the Frontend Directory**:
   ```bash
   cd frontend
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Start the Development Server**:
   ```bash
   ng serve
   ```
   Navigate to `http://localhost:4200/` in your browser.

### Backend Setup
1. **Navigate to the Backend Directory**:
   ```bash
   cd backend
   ```

2. **Install PHP Dependencies**:
   ```bash
   composer install
   ```

3. **Configure Environment File**:
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```
   Update database credentials and environment variables in `.env`.

4. **Set Up Storage Directory & Permissions**:
   ```bash
   php artisan storage:link
   ```

5. **Run Migrations & Seeders**:
   ```bash
   php artisan migrate --seed
   ```

6. **Start Backend Server**:
   ```bash
   php artisan serve
   ```
   The backend API will run on `http://127.0.0.1:8000/`.

---

## Commands and Testing

### Build Command

To build the Angular frontend for production:

```bash
ng build --configuration production && node post-build.js
```

### Angular Tests

To execute unit tests for the Angular frontend:

In PowerShell:
```powershell
$env:CHROME_BIN="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
npm run test
```

Or run directly using Angular CLI inside the `frontend/` directory:
```bash
cd frontend
ng test
```

### Backend Artisan Commands

The backend includes custom `php artisan` management commands:

| Command Signature | Description |
|---|---|
| `php artisan user:reset-password {email?}` | Resets faculty user password & dispatches email |
| `php artisan user:delete-account {email}` | Deletes faculty or admin account and profile |
| `php artisan api:add-key {system} {key?}` | Adds or updates integration API key |
| `php artisan api:generate-key {--length=64}` | Generates a secure random API key |
| `php artisan api:get-keys {system}` | Retrieves API keys for an external system |
| `php artisan preferences:check-deadline` | Disables preferences after submission deadlines |
| `php artisan appeals:cleanup-temp` | Cleans up appeal prescan temp files older than 24h |
| `php artisan deploy:backend` | Prepares backend for production deployment |
| `php artisan ml:export-dataset` | Exports scheduling dataset CSV for ML model training |
| `php artisan address:sync` | Downloads and caches Philippine PSGC address dataset |
| `php artisan sync:idp-uuids` | Syncs faculty email addresses with IDP user UUIDs |
| `php artisan optimize:clear` | Clears all backend caches (config, route, view) |

#### Key Command Usage Examples

- **Reset Faculty Password**:
  ```bash
  php artisan user:reset-password user@example.com --default
  ```

- **Generate API Key for Integration**:
  ```bash
  php artisan api:generate-key --length=64
  ```

- **Export ML Dataset**:
  ```bash
  php artisan ml:export-dataset --all
  ```

---

## External Integration Endpoints

Partnered systems integrate with PUPT-FLSS via external API endpoints
defined in [api.php](backend/routes/api.php)
under the `/api/v1/` prefix. Requests are authenticated using HMAC security
verification (`check.hmac` middleware).

### External Endpoints Summary

| Method | Endpoint Path | Partnered System(s) | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Health Check | System health status |
| `GET` | `/api/v1/faculties` | `orr`, `frrs`, `puptweb`, `ojtims` | Faculty list |
| `GET` | `/api/v1/departments` | `accred` | Department list |
| `GET` | `/api/v1/faculty-schedules` | `fas` | Faculty schedules (legacy) |
| `GET` | `/api/v1/faculty-schedules/part-time` | `fas` | Part-time faculty schedules |
| `GET` | `/api/v1/faculty-schedules/temporary` | `fas` | Temporary faculty schedules |
| `GET` | `/api/v1/rooms` | `fas`, `frrs` | Available room list |
| `GET` | `/api/v1/academic-year-semester` | `dms` | Active AY & Semester |
| `GET` | `/api/v1/course-schedules` | `frrs` | Course schedules |
| `GET` | `/api/v1/course-files` | `frrs` | Course files |
| `GET` | `/api/v1/faculty-profiles` | `dms`, `ocms` | Faculty profile data |
