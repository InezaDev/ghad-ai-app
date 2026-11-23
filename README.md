# GHAD AI — Rwanda REB CBC Lesson Planner & Teaching Workspace

An AI-powered workspace built for Rwandan teachers (Primary P1–P6 & Secondary S1–S6) aligned with the **Rwanda Basic Education Board (REB) Competence-Based Curriculum (CBC)** in **English**, **Ikinyarwanda**, and **Français**.

## Key Features

- **Official REB CBC Lesson Planner (`/api/lesson`)**
  - Full identification header support (`School Name`, `Teacher's Name`, `Term`, `Date`, `Subject`, `Class`, `Unit Nº`, `Lesson Nº`, `Duration` including 40 / 80 min or custom durations, `Class Size`, and `SEN`).
  - **Auto-Complete Missing Parts**: Generate a full REB lesson plan even when starting only from teacher Identification/Unit details, or click **Complete Missing Parts with AI** to fill any blank cells (Objectives, Materials, References, Overview, numbered `1. / 2. / 3.` stage steps, Competences, Self-Evaluation) while preserving your existing entries.
  - Export clean printable HTML/PDF or Word (`.doc`) documents.
- **CBC Teaching Assistant (`/api/assistant`)**: Queued, cancelable multi-turn chat with automatic retry on temporary demand spikes.
- **CBC Assessment Builder (`/api/assessment`)**: Generates competence-based exams/quizzes with marking schemes and verified mark totals.
- **Learner-Centred Methodology Guide (`/api/methodology`)**: Step-by-step CBC facilitation strategies, group structures, and cross-cutting issues.
- **Interactive 3D Hero Showcase**: Hardware-accelerated Three.js WebGL academic studio scene (`HeroScene3D`) with automatic lightweight fallback for software WebGL environments.
- **Firebase Auth & Cloud Sync**: Google Sign-In, Email/Password registration, teacher profile persistence, and saved library sync.

## Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Copy `.env.example` to `.env` and set your Gemini API key:
   ```bash
   cp .env.example .env
   ```
   Required environment variable:
   - `GEMINI_API_KEY`: Server-side Gemini API key (never exposed to the client).
   - `PORT` *(optional)*: HTTP port (defaults to `3000`).

3. **Run the development server**
   ```bash
   npm run dev
   ```
   Opens the full-stack Express + Vite server at `http://localhost:3000`.

## Deploying from GitHub

Compatible with Node.js platforms such as **Render**, **Railway**, **Fly.io**, and **Google Cloud Run**.

- **Build command**:
  ```bash
  npm install && npm run build
  ```
- **Start command**:
  ```bash
  npm start
  ```
- **Environment variables to configure in your host**:
  - `GEMINI_API_KEY` — Your server-side Gemini API key.
  - `PORT` — Provided automatically by most hosts (defaults to `3000`).
- **Health check endpoint**:
  - `GET /api/health` returns `{ "ok": true, "service": "ghad-ai", "timestamp": "..." }`.

## Verification Scripts

- Typecheck / lint: `npm run lint`
- Production frontend bundle: `npm run build`
