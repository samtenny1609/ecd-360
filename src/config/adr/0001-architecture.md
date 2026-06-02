# ADR 0001: Foundational Architecture & Engineering Standards

**Date**: 2026-04-17
**Status**: Accepted

## 1. Context and Problem Statement
Parentzo demands a strict, deterministic backend capable of handling highly sensitive child development data while enforcing compliance with regulations like the DPDP Act 2023. We needed a robust architecture enforcing separation of concerns, scalability, and airtight business logic execution.

## 2. Decision

### 2.1 Airtable as Primary Database Instead of PostgreSQL/Prisma
While PostgreSQL/Prisma was initially considered, Airtable was mandated as the primary database backend. 
- **Reasoning**: Serves immediate operational capability for non-technical stakeholders to view mappings.
- **Constraints**: Enforces strict payload batch limits (10 per request) and manual cascade delete mapping in the API layer since Airtable lacks native SQL-like cascade references.

### 2.2 Boundary Enforcement: `grouping.service.ts` as a Pure Function
- **Decision**: `grouping.service.ts` imports zero database packages and returns only plain classification objects.
- **Reasoning**: Decouples deterministic logic from any underlying data store. Testability is maxed out without needing database mocks for business rules.

### 2.3 Express Rate Limiting Globals
- **Decision**: Configured `express-rate-limit` globally restricting each IP to 100 requests per 15 mins.
- **Reasoning**: Unprotected APIs are vectors. Even internal staging must be rate-limited to avoid self-inflicted outages.

### 2.4 DPDP Cascade Delete
- **Decision**: Added `deleteChildAndAllData(child_id)` logic to `db.service.ts` which manually queries and batches deletes across ObservationCycles -> Responses -> Audits -> Children.
- **Reasoning**: Airtable prevents automatic cascade deletes. Compliance is legally required under India's DPDP Act.

### 2.5 Shadow Logging for Future ML
- **Decision**: A JSON column `shadow_ml_input` was added to `ClassificationAudits` on Airtable alongside the deterministic grouping result.
- **Reasoning**: Preserving raw response distributions at scale provides clean training datasets for any future migration to probabilistic ML models without any current engineering overhead.
