# PUPT-FLSS

Streamlining the academic scheduling at PUP Taguig.

---

## Table of Contents
- [Version and Technology](#version-and-technology)
- [File Architecture](#file-architecture)
- [Commands and Testing](#commands-and-testing)
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

- [frontend/](ffrontend)
  - `src/app/`: Angular components, services, guards, models, and routes.
  - `src/assets/`: Static image assets and icons.
  - `src/environments/`: Client environment configuration.
  - `post-build.js`: Post-build execution script.
- [backend/](backend)
  - `app/Http/Controllers/`: API request handlers.
  - `app/Http/Middleware/`: Middleware (HMAC verification, Sanctum auth, rate limiting).
  - `routes/api.php`: Core API routes and external partner endpoints.
  - `database/`: Database migrations, seeders, and CSV seed data.
- [ml/](ml)
  - `notebooks/`: Machine learning model training scripts and data analysis.
  - `ml_training_guide.md`: Guide for training ML scheduling models.

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

---

## Coding Guidelines
1. Keep code lines within 80 columns
2. Add atleast one line of comment (//) or docstring on top 
  of newly added methods explaining briefly it's purpose
3. Add a whitespace in between large code blocks before and after, example:

```
// code

if () {
  // statement
}

// code
```

---

## External Integration Endpoints

Partnered systems integrate with PUPT-FLSS via external API endpoints
defined in [api.php](/backend/routes/api.php)
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
