# Building Damage Management System

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-Client-E34F26?style=flat-square&logo=html5&logoColor=white)
![Architecture](https://img.shields.io/badge/Architecture-Domain--Driven-6366F1?style=flat-square)
![API](https://img.shields.io/badge/API-RESTful-4f46e5?style=flat-square)
![RBAC](https://img.shields.io/badge/Access%20Control-Role--Based-8b5cf6?style=flat-square)
![RTL](https://img.shields.io/badge/UI-RTL%20Hebrew-0fa968?style=flat-square)

> A full-stack platform for coordinating the end-to-end rehabilitation lifecycle of
> damaged buildings — from initial report, through appraiser assessment and
> municipal approval, to budget release and return-home package delivery —
> built around a domain-driven, service-oriented backend and a role-aware
> single-page client.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Server](#running-the-server)
  - [Demo Accounts](#demo-accounts)
- [Data Model](#data-model)
- [API Reference](#api-reference)
  - [Authentication](#authentication)
  - [Buildings Domain](#buildings-domain)
  - [Assessments Domain](#assessments-domain)
  - [Municipal Domain](#municipal-domain)
  - [Settlement Processes](#settlement-processes)
  - [Audit Log](#audit-log)
  - [System Health](#system-health)
  - [Notification Service](#notification-service)
- [Access Control Matrix](#access-control-matrix)
- [Business Rules Engine](#business-rules-engine)
- [Notification Resilience Simulation](#notification-resilience-simulation)
- [Project Structure](#project-structure)
- [Security Notes](#security-notes)

---

## Overview

The **Building Damage Management System** models the real-world workflow that
a Ministry of Housing, local municipalities, and licensed property appraisers
follow when coordinating disaster recovery for damaged residential buildings.
The platform tracks each building through its full rehabilitation pipeline —
damage intake, professional assessment, municipal infrastructure sign-off,
budget eligibility, and final "return home" package delivery to residents —
while enforcing ownership boundaries between the teams responsible for each
stage.

Three cooperating client portals sit on top of one shared API:

| Portal | Responsible party | Primary concern |
|---|---|---|
| **National Dashboard** | Ministry of Housing | Building intake, status lifecycle, settlement-wide readiness |
| **Appraiser Portal** | Licensed appraisers | Damage-severity assessments |
| **Municipal Portal** | Local authorities | Infrastructure sign-off (water, power, access roads, hazards) |

A settlement is only cleared for re-population once every building within it
independently satisfies budget, appraisal, and municipal-approval conditions —
a rule enforced centrally through the [business rules engine](#business-rules-engine).

## System Architecture

The backend follows a **domain-driven, service-oriented design**: each
business capability owns its own data, its own service layer, and its own
HTTP router, and cross-domain reads happen exclusively through service-layer
calls — never through direct field access.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (SPA, hash-router)                    │
│        National Dashboard · Appraiser Portal · Municipal Portal      │
└───────────────────────────────┬────────────────────────────────────┘
                                 │  RESTful JSON over HTTP
┌───────────────────────────────▼────────────────────────────────────┐
│                            Express API Layer                        │
│   requireAuth → requireRole → requireSettlementAccess (middleware)  │
├───────────────┬───────────────┬───────────────┬─────────────────────┤
│   Buildings   │  Assessments  │   Municipal    │   Settlement Process │
│    domain     │    domain     │    domain      │        domain         │
├───────────────┴───────────────┴───────────────┴─────────────────────┤
│         Users domain (auth)     │      Audit Log domain              │
├──────────────────────────────────────────────────────────────────────┤
│   Shared infrastructure: Notification Service · PDF Generation      │
│              (return-home package, retry + idempotency)             │
├──────────────────────────────────────────────────────────────────────┤
│              File-backed persistence (JSON / CSV data layer)         │
└──────────────────────────────────────────────────────────────────────┘
```

**Key architectural principles:**

- **Ownership isolation** — the `Buildings` domain never reads
  `appraiserAssessment` or `municipalApproval` directly; it calls
  `AssessmentsService.hasAcceptableAssessment()` and
  `MunicipalService.isApproved()` instead, keeping each domain free to evolve
  its own internal shape.
- **Legacy-compatible routing** — the client communicates over a stable
  `/reports/*` surface that transparently delegates to the correct domain
  service, so the frontend contract never breaks as domains are refactored.
- **Middleware-based access control** — authentication, role checks, and
  settlement-scoped authorization are composed as independent Express
  middleware layers rather than embedded in route handlers.
- **Resilient integrations** — outbound notifications go through a
  retry-with-timeout wrapper and are idempotency-keyed, simulating how the
  system would behave against an unreliable third-party mail provider.

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express 4 |
| PDF generation | PDFKit (RTL-aware Hebrew document rendering) |
| Bidirectional text shaping | `bidi-js` |
| Client | Vanilla HTML5 / CSS3 / JavaScript (hash-based SPA router) |
| Persistence | File-backed JSON / CSV data layer (`reports.json`, `settlement-processes.json`, `notifications.csv`) |
| Auth | Token-based sessions (`X-Auth-Token` header) |

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 18.x or later | Required for native `crypto.randomUUID()` support |
| npm | Bundled with Node.js | Used for dependency management |
| A modern browser | Any evergreen browser | Chrome, Edge, or Firefox recommended for RTL rendering |

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd Building-Damage-Management-System
npm install
```

This resolves the runtime dependencies declared in `package.json`: `express`,
`pdfkit`, and `bidi-js`.

### Running the Server

```bash
npm start
```

This boots the domain-driven server (`server-refactored.js`) on
**http://localhost:3000**. On first launch, the data layer seeds twenty
sample buildings distributed across three settlements (ירושלים, צפת, טבריה)
so the dashboard is populated immediately.

The listening port can be overridden via the `PORT` environment variable:

```bash
PORT=4000 npm start
```

> A previous single-file server implementation is preserved at `server.js`
> and remains reachable via `npm run start:legacy` for architectural
> comparison — the domain-driven server above is the active entry point.

### Demo Accounts

All demo accounts use the password **`1234`**:

| Username | Role | Scope |
|---|---|---|
| `dana` / `yossi` | `MINISTRY` | Full national access |
| `sarah` | `MUNICIPALITY` | ירושלים only |
| `moshe` | `MUNICIPALITY` | צפת only |
| `oren` | `MUNICIPALITY` | טבריה only |
| `rachel` | `APPRAISER` | Full assessment access |

## Data Model

### Building

```jsonc
{
  "id": "b3d2c1a4-...",
  "reporterName": "דנה כהן",
  "address": "רחוב בן יהודה 42, ירושלים",
  "settlementId": "ירושלים",
  "damageType": "דליפת מים",
  "description": "תיאור נזק בכתובת ...",
  "status": "NEW | IN_REVIEW | REHABILITATION_IN_PROGRESS | REHABILITATION_COMPLETED",
  "hasDamagePhotos": true,
  "hasEngineerReport": true,
  "eligibilityChecked": true,
  "socialApproval": false,
  "apartmentCount": 12,
  "familyEmail": "family@example.com",
  "pdfUrl": "/generated-pdfs/return-home-package-<id>.pdf",
  "appraiserAssessment": { "$ref": "AppraiserAssessment" },
  "municipalApproval": { "$ref": "MunicipalApproval" },
  "createdAt": "2026-01-15T09:30:00.000Z"
}
```

### AppraiserAssessment

```jsonc
{
  "damageSeverity": "קל | בינוני | חמור",
  "notes": "string",
  "inspectionDate": "YYYY-MM-DD",
  "requiresFollowUp": false,
  "savedAt": "ISO-8601 timestamp"
}
```

### MunicipalApproval

```jsonc
{
  "waterSupplyOk": true,
  "electricitySupplyOk": true,
  "accessRoadsOpen": true,
  "environmentalHazardsCleared": true,
  "notes": "string",
  "approved": true,
  "savedAt": "ISO-8601 timestamp"
}
```

### SettlementProcess

```jsonc
{
  "id": "uuid",
  "settlementName": "ירושלים",
  "startedBy": "דנה לוי",
  "status": "PROCESSING | COMPLETED",
  "startedAt": "ISO-8601 timestamp",
  "completedAt": "ISO-8601 timestamp | null"
}
```

## API Reference

All endpoints return JSON. Validation failures return `400` with an `error`
message; missing entities return `404`; unauthorized/forbidden requests
return `401` / `403`. Authenticated requests must include an
`X-Auth-Token` header obtained from `/auth/login`.

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Exchange credentials for a session token |
| `POST` | `/auth/logout` | Invalidate the current session token |
| `GET`  | `/auth/me` | Resolve the current session's user profile |

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"dana","password":"1234"}'
```

### Buildings Domain

*Owned by the Ministry of Housing team.*

| Method | Path | Access | Description |
|---|---|---|---|
| `GET`  | `/reports` | Any authenticated role | List buildings (settlement-scoped for `MUNICIPALITY`) |
| `POST` | `/reports` | `MINISTRY` | Create a new building record |
| `GET`  | `/reports/:id` | Settlement-scoped | Full building view (cross-domain) |
| `PATCH` | `/reports/:id` | `MINISTRY` | Update building fields |
| `PATCH` | `/reports/:id/status` | `MINISTRY` | Advance the rehabilitation status |
| `POST` | `/reports/:id/open-budget` | `MINISTRY` | Log a budget-request action |
| `POST` | `/buildings/:id/return-home-package` | `MINISTRY` | Generate the RTL PDF return-home package |
| `GET`  | `/buildings/:id/settlement-readiness` | Any authenticated role | Readiness verdict for one building |
| `GET`  | `/buildings/settlement-readiness/all` | Any authenticated role | Readiness verdict for every building |

```bash
curl -X POST http://localhost:3000/reports \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: <token>" \
  -d '{
    "reporterName": "Dana Cohen",
    "address": "12 Allenby St, Tel Aviv",
    "damageType": "Water leak",
    "description": "Ceiling leak in the kitchen."
  }'
```

### Assessments Domain

*Owned by the appraiser team.*

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/assessments/buildings` | `MINISTRY`, `APPRAISER` | List buildings for the appraiser portal |
| `GET` | `/reports/:id/appraiser-assessment` | `MINISTRY`, `APPRAISER` | Fetch one assessment |
| `PUT` | `/reports/:id/appraiser-assessment` | `MINISTRY`, `APPRAISER` | Create or update an assessment |

### Municipal Domain

*Owned by local authorities.*

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/municipal/buildings` | `MINISTRY`, `MUNICIPALITY` | List buildings for the municipal portal |
| `GET` | `/reports/:id/municipal-approval` | Settlement-scoped | Fetch one approval record |
| `PUT` | `/reports/:id/municipal-approval` | `MINISTRY`, `MUNICIPALITY` (settlement-scoped) | Create or update an approval |

### Settlement Processes

*Tracks bulk return-home package generation runs.*

| Method | Path | Description |
|---|---|---|
| `POST` | `/settlement-processes` | Start a bulk generation run (`PROCESSING`) |
| `POST` | `/settlement-processes/:id/complete` | Mark a run as `COMPLETED` |
| `GET`  | `/settlement-processes` | List all runs, newest first |

### Audit Log

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit-log` | Full cross-entity action log |
| `GET` | `/audit-log/buildings/:id` | Action history scoped to one building |

Every state-changing action — status updates, assessments, approvals, budget
requests — is recorded with the acting user, timestamp, and entity reference.

### System Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/system-health` | Aggregate operational metrics |

```jsonc
{
  "settlementProcesses": { "completed": 4, "processing": 1 },
  "notifications": { "successful": 18, "failed": 3, "retryCount": 5 },
  "performance": { "avgSettlementDurationSec": 2.4 }
}
```

### Notification Service

| Method | Path | Description |
|---|---|---|
| `POST` | `/notifications/send` | Send a notification (retried up to 3× with a 5s timeout per attempt) |
| `GET`  | `/notifications` | List all notification attempts, newest first |
| `GET`  | `/notifications/mode` | Get the current simulated delivery mode |
| `POST` | `/notifications/mode` | Set the simulated delivery mode |

## Access Control Matrix

| Capability | `MINISTRY` | `MUNICIPALITY` | `APPRAISER` |
|---|:---:|:---:|:---:|
| View buildings | All | Own settlement only | All |
| Create / edit buildings | ✅ | — | — |
| Change building status | ✅ | — | — |
| Submit appraiser assessment | ✅ | — | ✅ |
| Submit municipal approval | ✅ | Own settlement only | — |
| Open budget request | ✅ | — | — |
| Generate return-home package | ✅ | — | — |

Authorization is enforced through three composable Express middlewares:
`requireAuth` (resolves the session), `requireRole` (whitelist check), and
`requireSettlementAccess` (compares the building's `settlementId` against the
requesting municipal user's own).

## Business Rules Engine

Settlement readiness is derived, not stored — `BudgetEligibilityService`
evaluates a chain of conditions on demand:

1. **Rehabilitation readiness** — damage photos, engineer report, and an
   eligibility check must all be present.
2. **Social approval gate** — buildings with more than 24 apartments
   additionally require an explicit social approval flag.
3. **Budget eligibility** — rehabilitation readiness *and* the social
   approval gate must both clear.
4. **Return-home package eligibility** — requires an engineer report,
   a completed eligibility check, and `status === REHABILITATION_COMPLETED`.
5. **Settlement readiness** — the strictest gate: every condition above,
   plus a generated PDF package, an appraiser assessment rated `קל` or
   `בינוני`, and an **approved** municipal sign-off.

The dashboard surfaces exactly which of these gates is still open per
building (`needsAppraiser`, `needsMunicipal`, `other`), so a settlement's
overall readiness percentage is always explainable.

## Notification Resilience Simulation

The notification service is deliberately built as an unreliable dependency,
so the platform's retry, timeout, and idempotency handling can be exercised
on demand via a runtime-switchable mode:

| Mode | Behavior |
|---|---|
| `SUCCESS` | Every send succeeds (default) |
| `ALWAYS_FAIL` | Every send fails |
| `FAIL_FIRST_ATTEMPT` | First attempt per building+email fails, subsequent attempts succeed |
| `RANDOM_FAILURE` | ~30% of sends fail at random |
| `RESPONSE_LOST` | The call hangs indefinitely, simulating a dropped response |

The API layer wraps every send in up to **3 retry attempts**, each bounded by
a **5-second timeout race**, and de-duplicates repeat sends using an
`idempotencyKey` so a retried request is never delivered twice. Every
attempt — successful or not — is appended to `notifications.csv` for full
traceability, and surfaced live in the Notification Center UI.

## Project Structure

```
Building-Damage-Management-System/
├── server-refactored.js          # Active entry point — domain-driven server
├── server.js                     # Legacy single-file server (kept for reference)
├── notificationServer.js         # Shared notification infrastructure
├── returnHomePackageService.js   # RTL PDF generation service
├── logger.js                     # Structured event logging
├── domains/
│   ├── store.js                  # Shared file-backed persistence layer
│   ├── buildings/                # Ministry of Housing domain
│   ├── assessments/              # Appraiser domain
│   ├── municipal/                # Local authorities domain
│   ├── users/                    # Identity & session management
│   ├── auditLog/                 # Cross-entity action history
│   └── settlementProcess/        # Bulk-generation run tracking
├── middleware/
│   ├── requireAuth.js
│   ├── requireRole.js
│   └── requireSettlementAccess.js
└── public/
    ├── index.html                # Application shell
    ├── app.js                    # Hash-router SPA (portals, forms, dashboards)
    └── budgetEligibility.js      # Client-side business rules mirror
```

## Security Notes

This system is a coursework/reference implementation of a multi-tenant
domain-driven architecture, not a hardened production deployment. In its
current form:

- Session tokens are opaque, in-memory identifiers with no expiry.
- Demo account passwords are stored and compared in plain text.
- There is no rate limiting, CSRF protection, or transport encryption
  configured at the application layer.

Any of these would need to be addressed — e.g. hashed credentials, expiring
JWTs, HTTPS termination — before this codebase left an educational or
internal-demo context.
