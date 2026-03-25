# Surveyor — Implementation Plan

## Overview

Surveyor is a Next.js tool for generating and submitting realistic fake responses to Google Forms surveys. It is intended for testing your own forms with bulk, human-like data. It uses Gemini AI for persona and response generation, Inngest for scheduled submission, and supports both public and Google sign-in-required forms.

---

## Tech Stack

| Concern         | Choice                                                                |
| --------------- | --------------------------------------------------------------------- |
| Framework       | Next.js (App Router)                                                  |
| Language        | TypeScript                                                            |
| LLM             | Google Gemini 2.5 Flash (free tier for dev, Flash-Lite paid for prod) |
| LLM SDK         | `@google/generative-ai` or Vercel AI SDK with Google provider         |
| Scheduling      | Inngest                                                               |
| Auth (optional) | Auth.js (NextAuth v5) with Google provider                            |
| Styling         | Tailwind CSS                                                          |
| Database (dev)  | Local Postgres                                                        |
| Database (prod) | Supabase (Postgres)                                                   |
| ORM             | Prisma                                                                |
| Deployment      | Vercel                                                                |

---

## Project Structure

```
surveyor/
├── app/
│   ├── page.tsx                        # Home: Enter form URL + configure run
│   ├── dashboard/
│   │   └── [runId]/page.tsx            # Progress dashboard for a submission run
│   └── api/
│       ├── parse-form/route.ts         # Fetch & parse Google Form schema
│       ├── generate-personas/route.ts  # LLM persona generation
│       ├── generate-responses/route.ts # Build response job payloads
│       ├── start-run/route.ts          # Kick off Inngest fan-out
│       └── submit/route.ts            # Single submission endpoint (called by Inngest)
│
├── inngest/
│   ├── client.ts                       # Inngest client instance
│   └── functions/
│       └── submitResponse.ts           # Scheduled submission function
│
├── lib/
│   ├── formParser.ts                   # Extract FormSchema from FB_PUBLIC_LOAD_DATA_
│   ├── personaGenerator.ts             # LLM call to generate personas
│   ├── responseGenerator.ts            # LLM call to generate answers per persona
│   ├── googleFormsSubmitter.ts         # HTTP POST to Google Forms endpoint
│   └── conditionalLogic.ts            # (future) Evaluate conditional navigation rules
│
├── prisma/
│   └── schema.prisma                   # DB schema
│
├── types/
│   ├── form.ts                         # FormSchema, Field, FieldType types
│   ├── persona.ts                      # Persona type
│   └── run.ts                          # SubmissionRun, ResponseJob types
│
└── docs/
    └── implementation-plan.md          # This file
```

---

## Data Models

### `SubmissionRun`

Represents one batch of form submissions.

```ts
{
  id: string
  formUrl: string
  formId: string
  formSchema: Json          // Parsed FormSchema
  personas: Json            // Generated personas array
  totalResponses: number
  windowMinutes: number     // Time spread for submissions
  status: "pending" | "running" | "completed" | "failed"
  createdAt: DateTime
  completedAt: DateTime?
  googleAccessToken: string? // Optional, for sign-in-required forms
}
```

### `ResponseJob`

One individual form submission.

```ts
{
  id: string
  runId: string
  personaIndex: number
  answers: Json             // { entryId: value } map
  scheduledFor: DateTime
  status: "pending" | "submitted" | "failed"
  submittedAt: DateTime?
  errorMessage: string?
}
```

---

## Implementation Phases

---

### Phase 1 — Project Setup

- [ ] Initialise Next.js project with TypeScript and Tailwind CSS
- [ ] Start local Postgres (via Docker or system install) and create a `surveyor` database
- [ ] Create Prisma schema for `SubmissionRun` and `ResponseJob`
- [ ] Run initial migration against local DB
- [ ] Set up environment variables (`.env.local`):
  - `GEMINI_API_KEY`
  - `DATABASE_URL` (local: `postgresql://localhost:5432/surveyor`)
  - `INNGEST_EVENT_KEY`
  - `INNGEST_SIGNING_KEY`
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Auth.js, optional)

> **Production note:** when deploying to Vercel, swap `DATABASE_URL` to your Supabase connection string. No code changes needed — Prisma uses the env var transparently.

- [ ] Install Inngest SDK and create `inngest/client.ts`
- [ ] Add Inngest serve route at `app/api/inngest/route.ts`

---

### Phase 2 — Form Parser (`lib/formParser.ts`)

Goal: given a Google Form URL, return a structured `FormSchema`.

**How it works:**

- Server-side fetch of the form URL (avoids CORS)
- Extract the `FB_PUBLIC_LOAD_DATA_` JavaScript variable from the HTML
- Parse the JSON blob — field data lives at index `[1][1]`
- Map each field to a typed `Field` object

**`FormSchema` type:**

```ts
type FieldType =
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "dropdown"
  | "linear_scale"
  | "date"
  | "time";

type Field = {
  entryId: string; // e.g. "entry.123456789"
  label: string; // The question text
  type: FieldType;
  required: boolean;
  options: string[]; // For multiple_choice, checkbox, dropdown
  scaleMin?: number; // For linear_scale
  scaleMax?: number;
  conditionalRules?: any; // Raw conditional data, parsed in Phase 6
};

type FormSchema = {
  formId: string;
  title: string;
  description: string;
  fields: Field[];
};
```

**Error handling:**

- If `FB_PUBLIC_LOAD_DATA_` is not found, throw a clear error (format changed or form is private)
- Validate that at least one field was parsed before returning

**API route:** `POST /api/parse-form` — accepts `{ url: string }`, returns `FormSchema`

---

### Phase 3 — Persona Generator (`lib/personaGenerator.ts`)

Goal: given a `FormSchema`, produce an array of 8–12 distinct personas.

**LLM prompt strategy:**

```
You are helping generate test data for a survey.

Survey title: "{title}"
Survey description: "{description}"
Questions: {question labels as a list}

Generate 10 distinct personas who would realistically fill out this survey.
Return a JSON array. Each persona must have:
- name (string)
- age (number)
- occupation (string)
- background (1–2 sentence description)
- sentiment: "positive" | "neutral" | "critical" | "mixed"
- verbosity: "brief" | "moderate" | "detailed"
- answerTendencies (1 sentence: how this person typically responds to surveys)
```

Use Gemini's **structured output / JSON mode** to ensure a valid array is returned.

**API route:** `POST /api/generate-personas` — accepts `{ schema: FormSchema }`, returns `Persona[]`

---

### Phase 4 — Response Generator (`lib/responseGenerator.ts`)

Goal: for a given persona and form schema, produce a complete set of answers.

**Multiple choice / dropdown / checkbox:**

- Weighted random selection based on `persona.sentiment`
  - `positive` → skew toward first/positive-sounding options
  - `critical` → skew toward last/negative-sounding options
  - `neutral` / `mixed` → uniform random

**Linear scale:**

- Map sentiment to a numeric range (e.g. positive → 7–10 on a 1–10 scale)
- Add small random variance

**Free text (short_text / long_text):**

- Single batched LLM call per persona, answering all free-text questions at once
- Prompt:

  ```
  You are {name}, {age}, {occupation}. {background}
  Your survey response style: {answerTendencies}. You write {verbosity} answers.

  Answer each of the following survey questions in your own voice.
  Return a JSON object mapping question labels to your answers.
  Keep answers natural and human — no lists, no bullet points.

  Questions:
  {list of free-text question labels}
  ```

- Map returned answers back to `entryId` keys for form submission

**Output:** `Record<entryId, string>` — ready to POST

**API route:** `POST /api/generate-responses` — accepts `{ schema: FormSchema, personas: Persona[], count: number }`, returns `ResponseJob[]` (without DB IDs yet)

---

### Phase 5 — Submission & Scheduling

#### `lib/googleFormsSubmitter.ts`

Submits a single response via HTTP POST.

```
POST https://docs.google.com/forms/d/e/{formId}/formResponse
Content-Type: application/x-www-form-urlencoded

entry.123456789=Some+answer&entry.987654321=Option+A&fvv=1&pageHistory=0
```

Key fields to include:

- All `entry.XXXXXXX` answer fields
- `fvv=1` (form version flag, required)
- `pageHistory=0` (comma-separated page indices visited)

For sign-in-required forms: include the `Authorization: Bearer {accessToken}` header.

Returns `{ success: boolean, statusCode: number, error?: string }`.

#### `inngest/functions/submitResponse.ts`

An Inngest function that:

1. Receives a `ResponseJob` payload
2. Calls `googleFormsSubmitter`
3. Updates the `ResponseJob` status in the DB
4. Updates the parent `SubmissionRun` progress

#### `app/api/start-run/route.ts`

1. Create a `SubmissionRun` record in DB
2. Generate responses for all personas
3. Persist all `ResponseJob` records
4. Calculate a scheduled time for each job:
   ```ts
   // Distribute N jobs across windowMinutes with jitter
   const baseInterval = (windowMinutes * 60 * 1000) / totalJobs;
   const scheduledFor =
     now + i * baseInterval + randomJitter(baseInterval * 0.3);
   ```
5. Send one Inngest event per job with `{ scheduledFor }` → Inngest sleeps until that time

---

### Phase 6 — Conditional Logic (Future)

`lib/conditionalLogic.ts` will:

- Parse conditional navigation rules from the raw `FB_PUBLIC_LOAD_DATA_` field data
- Implement a state machine: given current answers, determine which field to show next
- Skip fields whose conditions are not met when building the answer payload

This can be stubbed out in Phase 2 (store raw conditional data) and implemented later without changing the public API.

---

### Phase 7 — UI

#### Home page (`app/page.tsx`)

- Form URL input
- "Parse Form" button → calls `/api/parse-form`, shows parsed question summary
- Persona count + generation button → calls `/api/generate-personas`, shows persona cards
- Configuration: number of responses, time window (minutes/hours), persona mix (equal / weighted)
- "Start Run" button → calls `/api/start-run`, redirects to dashboard

#### Dashboard (`app/dashboard/[runId]/page.tsx`)

- Auto-refreshing progress bar (submitted / pending / failed)
- Persona breakdown: which personas contributed how many responses
- Timeline: a simple chart showing when submissions are scheduled/landed
- Table of all `ResponseJob`s with status, persona name, scheduled time, submitted time

---

### Phase 8 — Google Sign-In (Optional Auth)

- Add Auth.js with Google OAuth provider
- Request scope: `openid email profile` (no extra scopes needed — you're submitting as the user, not accessing their Drive)
- Store `access_token` in the Auth.js session (JWT strategy)
- On the home page: detect if a form requires sign-in (check by doing a HEAD request or catching a 401 on parse)
- If required: show "Sign in with Google" button, then pass token through to `start-run` → `ResponseJob` payloads → Inngest jobs → submitter

---

## Key Technical Risks & Mitigations

| Risk                                  | Mitigation                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `FB_PUBLIC_LOAD_DATA_` format changes | Fail loudly with clear error; provide manual field-ID override UI                                 |
| Google Forms rate limiting (429)      | Inngest retry with exponential backoff; spread submissions across longer windows                  |
| Gemini API quota on free tier         | Batch all free-text questions per persona into one call; use Flash-Lite for high volume           |
| Vercel function timeout on large runs | `start-run` only schedules jobs — Inngest workers run independently outside the request lifecycle |
| Sign-in token expiry during long runs | Store refresh token; implement token refresh in the Inngest function before submitting            |

---

## Environment Variables

```env
# Gemini
GEMINI_API_KEY=

# Postgres
# Development: local Postgres
DATABASE_URL=postgresql://localhost:5432/surveyor
# Production (Vercel): swap to Supabase connection string
# DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Auth.js (optional, for sign-in-required forms)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## Development Order

1. **Phase 1** — Project setup, DB, Inngest wiring
2. **Phase 2** — Form parser (testable immediately with a real form URL)
3. **Phase 3** — Persona generator (verify LLM output quality early)
4. **Phase 4** — Response generator (the core logic)
5. **Phase 5** — Submitter + Inngest scheduling (end-to-end test with small run)
6. **Phase 7** — UI (wire everything together)
7. **Phase 8** — Google sign-in (only if needed)
8. **Phase 6** — Conditional logic (once base product is stable)
