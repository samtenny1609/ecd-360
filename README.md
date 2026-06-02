# Parentzo Backend (Phase 1)

This repository contains the deterministic backend for the Parentzo ECD assessment tool. 
It uses Express.js, TypeScript Strict mode, and integrates with Airtable as the primary data store.

## Features
* **Strict Age Calculation**: Computes exact completed months enforcing date boundaries.
* **Deterministic Grouping Engine**: Evaluates responses through configured logic gates independently of database dependencies.
* **Airtable Mapping**: Connects robust TypeScript models to an Airtable Base instance for storage.
* **Compliance Checks**: Built-in endpoints providing data cascade deletion adhering to DPDP regulations.

## Setup Requirements

Since Node.js must be present on your host machine to run this project:
1. [Download and install Node.js (v20+)](https://nodejs.org/)
2. Open terminal in this directory: `cd parentzo-backend`
3. Install dependencies: `npm install`
4. Set up Airtable configurations (see `.env.example` format below).

### Environment Variables
Create a `.env` file based on these keys:
```env
PORT=3000
NODE_ENV=development
AIRTABLE_API_KEY=patXXX.XXX
AIRTABLE_BASE_ID=appXXX
```

## Database Schema mapped to Airtable Tables

Ensure your Airtable Base contains the following exactly named tables with the proper linked record mappings:
* **Children** 
* **Caregivers**
* **ObservationCycles**
* **ObservationPrompts**
* **Responses**
* **ClassificationAudits** (Must include standard metric counts, deterministic group assignments, and a `shadow_ml_input` JSON field).

## Running the Application
* **Development**: `npm run dev`
* **Tests**: `npm test`
* **Seed database**: `npx ts-node airtable/seed.ts`
