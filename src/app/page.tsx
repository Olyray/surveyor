"use client";

import { useState } from "react";
import type { FormSchema } from "@/types/form";
import type { Persona } from "@/types/persona";

type Step = "url" | "schema" | "personas" | "configure" | "running";

export default function Home() {
  const [step, setStep] = useState<Step>("url");
  const [formUrl, setFormUrl] = useState("");
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [totalResponses, setTotalResponses] = useState(50);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [personaCount, setPersonaCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function handleParseForm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSchema(data);
      setStep("schema");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse form");
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePersonas() {
    if (!schema) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, count: personaCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPersonas(data.personas);
      setStep("personas");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate personas"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/start-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formUrl,
          totalResponses,
          windowMinutes,
          personaCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRunId(data.runId);
      setStep("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Surveyor</h1>
      <p className="mb-8 text-gray-600">
        Generate realistic test responses for your Google Forms
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Enter URL */}
      <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">1. Google Form URL</h2>
        <div className="flex gap-3">
          <input
            type="url"
            placeholder="https://docs.google.com/forms/d/e/.../viewform"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            className="flex-1 rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={handleParseForm}
            disabled={!formUrl || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && step === "url" ? "Parsing..." : "Parse Form"}
          </button>
        </div>
      </section>

      {/* Step 2: Show parsed schema */}
      {schema && step !== "url" && (
        <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            2. Form: {schema.title}
          </h2>
          {schema.description && (
            <p className="mb-4 text-sm text-gray-600">{schema.description}</p>
          )}
          <div className="mb-4 space-y-2">
            {schema.fields.map((field) => (
              <div
                key={field.entryId}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <span>
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {field.type}
                  {field.options.length > 0 &&
                    ` (${field.options.length} options)`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">
              Number of personas:
              <input
                type="number"
                min={2}
                max={20}
                value={personaCount}
                onChange={(e) => setPersonaCount(Number(e.target.value))}
                className="ml-2 w-16 rounded border px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={handleGeneratePersonas}
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && step === "schema"
                ? "Generating..."
                : "Generate Personas"}
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Show personas */}
      {personas.length > 0 && (step === "personas" || step === "configure" || step === "running") && (
        <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">3. Personas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {personas.map((p, i) => (
              <div key={i} className="rounded border p-3 text-sm">
                <div className="font-medium">
                  {p.name}, {p.age}
                </div>
                <div className="text-gray-600">{p.occupation}</div>
                <div className="mt-1 flex gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      p.sentiment === "positive"
                        ? "bg-green-100 text-green-700"
                        : p.sentiment === "critical"
                          ? "bg-red-100 text-red-700"
                          : p.sentiment === "mixed"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {p.sentiment}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {p.verbosity}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {step === "personas" && (
            <button
              onClick={() => setStep("configure")}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Configure Run
            </button>
          )}
        </section>
      )}

      {/* Step 4: Configure and start */}
      {step === "configure" && (
        <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">4. Configure Run</h2>
          <div className="mb-4 space-y-4">
            <label className="block text-sm">
              <span className="text-gray-700">Total responses</span>
              <input
                type="number"
                min={1}
                max={500}
                value={totalResponses}
                onChange={(e) => setTotalResponses(Number(e.target.value))}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">
                Spread over (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={1440}
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
              <span className="mt-1 text-xs text-gray-500">
                {totalResponses} responses over {windowMinutes} minutes ={" "}
                ~1 every {Math.round(windowMinutes / totalResponses * 60)} seconds
              </span>
            </label>
          </div>
          <button
            onClick={handleStartRun}
            disabled={loading}
            className="rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start Submission Run"}
          </button>
        </section>
      )}

      {/* Step 5: Running */}
      {step === "running" && runId && (
        <section className="mb-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Run Started!</h2>
          <p className="mb-4 text-sm text-gray-600">
            {totalResponses} responses are being submitted over{" "}
            {windowMinutes} minutes.
          </p>
          <a
            href={`/dashboard/${runId}`}
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Dashboard
          </a>
        </section>
      )}
    </main>
  );
}
