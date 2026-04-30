# Surveyor

Surveyor automates realistic fake responses for Google Forms. It parses any public Google Form, generates AI personas based on the form's content, and submits responses spread across a configurable time window — simulating real traffic patterns.

Useful for load-testing your own survey forms before distributing them.

## How It Works

1. Paste a Google Form URL
2. Surveyor fetches and parses the form schema (field types, options, labels)
3. Gemini generates distinct personas suited to the form's audience
4. Each persona answers the form: multiple choice via weighted random selection, free-text via LLM, Likert scales via sentiment weighting
5. Responses are scheduled as background jobs spread across your chosen time window
6. A live dashboard tracks submission progress

## Prerequisites

- Node.js 18+
- PostgreSQL (local or remote)
- [Gemini API key](https://aistudio.google.com/app/apikey)
- [Inngest CLI](https://www.inngest.com/docs/local-development) (for local background job processing)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.local` and fill in your values:

```bash
# .env.local

GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL="postgresql://localhost:5432/surveyor"

# For local development
INNGEST_DEV=1
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Also set `DATABASE_URL` in `.env` (used by the Prisma CLI):

```bash
# .env
DATABASE_URL="postgresql://localhost:5432/surveyor"
```

### 3. Set up the database

Create a local Postgres database and run the migration:

```bash
createdb surveyor
npx prisma migrate dev --name init
```

### 4. Start the development servers

You need two terminals:

**Terminal 1 — Next.js app:**

```bash
npm run dev
```

**Terminal 2 — Inngest dev server** (processes the background submission jobs):

```bash
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000) and the Inngest UI at [http://localhost:8288](http://localhost:8288).

## Usage

### Starting a run

1. Go to [http://localhost:3000](http://localhost:3000)
2. Paste your Google Form URL (either the public `/viewform` URL or the editor URL)
3. Click **Parse Form** — Surveyor reads the form's fields and options
4. Click **Generate Personas** — Gemini creates distinct respondent personas based on the form's topic
5. Set the number of responses and time window (how many minutes to spread them across)
6. Click **Start Run** — you'll be redirected to the dashboard

### Dashboard

The dashboard polls automatically and shows:

- Overall progress (submitted / pending / failed)
- Per-job status with scheduled and actual submission times

### Supported field types

| Type                  | How it's answered                                             |
| --------------------- | ------------------------------------------------------------- |
| Multiple choice       | Weighted random based on persona sentiment                    |
| Dropdown              | Weighted random based on persona sentiment                    |
| Checkbox              | Random subset, weighted toward sentiment                      |
| Linear scale (Likert) | Sentiment-weighted numeric value                              |
| Short text            | Gemini — brief, few-word answer                               |
| Long text             | Gemini — natural sentences, length based on persona verbosity |
| Date                  | Random date within the past year                              |
| Time                  | Random time                                                   |

## Production Deployment

1. Provision a PostgreSQL database (e.g. Supabase, Neon)
2. Update `DATABASE_URL` in your deployment environment
3. Create an [Inngest account](https://app.inngest.com) and get your `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
4. Set all environment variables in your hosting provider
5. Remove `INNGEST_DEV=1` from production env
6. Deploy the Next.js app (`npm run build && npm run start`)

## Tech Stack

- **Next.js 16** — App Router, API routes
- **Prisma 7** — Database ORM (requires driver adapter for v7+)
- **PostgreSQL** — Stores runs and job state
- **Inngest** — Background job scheduling and retries
- **Google Gemini** — Persona generation and free-text answers
- **Tailwind CSS** — UI styling
