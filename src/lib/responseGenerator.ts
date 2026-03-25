import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FormSchema, Field } from "@/types/form";
import type { Persona } from "@/types/persona";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

type AnswerMap = Record<string, string>;

/**
 * Generate a complete set of answers for a single persona.
 */
export async function generateResponseForPersona(
  schema: FormSchema,
  persona: Persona
): Promise<AnswerMap> {
  const answers: AnswerMap = {};

  // Handle structured fields first (multiple choice, checkbox, dropdown, linear scale)
  for (const field of schema.fields) {
    const answer = generateStructuredAnswer(field, persona);
    if (answer !== null) {
      answers[field.entryId] = answer;
    }
  }

  // Batch all free-text fields into a single LLM call
  const textFields = schema.fields.filter(
    (f) => f.type === "short_text" || f.type === "long_text"
  );

  if (textFields.length > 0) {
    const textAnswers = await generateFreeTextAnswers(
      schema,
      textFields,
      persona
    );
    Object.assign(answers, textAnswers);
  }

  return answers;
}

/**
 * Generate an answer for a structured field based on persona traits.
 */
function generateStructuredAnswer(
  field: Field,
  persona: Persona
): string | null {
  switch (field.type) {
    case "multiple_choice":
    case "dropdown":
      return pickWeightedOption(field.options, persona);

    case "checkbox":
      return pickMultipleOptions(field.options, persona);

    case "linear_scale":
      return generateScaleAnswer(field, persona);

    case "date":
      return generateRandomDate();

    case "time":
      return generateRandomTime();

    default:
      // short_text and long_text handled by LLM
      return null;
  }
}

/**
 * Pick a single option from a list, weighted by persona sentiment.
 */
function pickWeightedOption(options: string[], persona: Persona): string {
  if (options.length === 0) return "";

  const weights = buildWeights(options.length, persona.sentiment);
  return weightedRandom(options, weights);
}

/**
 * Pick multiple options for checkbox fields.
 */
function pickMultipleOptions(options: string[], persona: Persona): string {
  if (options.length === 0) return "";

  // Pick 1 to ceil(options.length / 2) options
  const maxPicks = Math.max(1, Math.ceil(options.length / 2));
  const numPicks = 1 + Math.floor(Math.random() * maxPicks);

  const shuffled = [...options].sort(() => Math.random() - 0.5);
  const weights = buildWeights(options.length, persona.sentiment);

  // Use weighted selection for first pick, random for rest
  const selected = new Set<string>();
  selected.add(weightedRandom(options, weights));

  for (const opt of shuffled) {
    if (selected.size >= numPicks) break;
    selected.add(opt);
  }

  return Array.from(selected).join(", ");
}

/**
 * Generate a linear scale answer based on persona sentiment.
 */
function generateScaleAnswer(field: Field, persona: Persona): string {
  const min = field.scaleMin ?? 1;
  const max = field.scaleMax ?? 5;
  const range = max - min;

  let base: number;
  switch (persona.sentiment) {
    case "positive":
      base = min + range * 0.7 + Math.random() * range * 0.3;
      break;
    case "critical":
      base = min + Math.random() * range * 0.4;
      break;
    case "mixed":
      base = min + range * 0.3 + Math.random() * range * 0.4;
      break;
    default: // neutral
      base = min + range * 0.3 + Math.random() * range * 0.4;
      break;
  }

  return String(Math.round(Math.max(min, Math.min(max, base))));
}

/**
 * Build weights for option selection based on sentiment.
 * Positive → skew toward earlier options (often positive-sounding)
 * Critical → skew toward later options
 * Neutral/Mixed → roughly uniform
 */
function buildWeights(
  count: number,
  sentiment: Persona["sentiment"]
): number[] {
  const weights = new Array(count).fill(1);

  if (sentiment === "positive") {
    for (let i = 0; i < count; i++) {
      weights[i] = count - i;
    }
  } else if (sentiment === "critical") {
    for (let i = 0; i < count; i++) {
      weights[i] = i + 1;
    }
  }
  // neutral and mixed stay uniform

  return weights;
}

function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }

  return items[items.length - 1];
}

function generateRandomDate(): string {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 365);
  const date = new Date(now.getTime() - daysAgo * 86400000);
  return date.toISOString().split("T")[0];
}

function generateRandomTime(): string {
  const hours = Math.floor(Math.random() * 24)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor(Math.random() * 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Generate free-text answers for all text fields in a single batched LLM call.
 */
async function generateFreeTextAnswers(
  schema: FormSchema,
  textFields: Field[],
  persona: Persona
): Promise<AnswerMap> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const verbosityGuide = {
    brief: "1 short sentence max for open-ended questions.",
    moderate: "1-2 natural sentences for open-ended questions.",
    detailed: "2-3 sentences for open-ended questions.",
  };

  const questionList = textFields
    .map((f, i) => {
      const hint = f.type === "short_text"
        ? " [SHORT ANSWER: reply in a few words only, like a real survey respondent would — e.g. a name, a place, or a brief phrase. Never write a full sentence.]"
        : " [OPEN-ENDED: write naturally in your own voice]";
      return `${i + 1}. "${f.label}"${hint}`;
    })
    .join("\n");

  const prompt = `You are ${persona.name}, age ${persona.age}, ${persona.occupation}. ${persona.background}
Your survey response style: ${persona.answerTendencies}. You tend to be ${persona.sentiment} in your outlook.
${verbosityGuide[persona.verbosity]}

This is a survey titled "${schema.title}".

Answer each survey question EXACTLY as instructed per question. Short-answer questions must be answered in a few words — never a full sentence. Open-ended questions can be answered naturally.

Questions:
${questionList}

Return a JSON object where keys are the question numbers (as strings: "1", "2", etc.) and values are your answers.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const rawAnswers: Record<string, string> = JSON.parse(text);

  // Map numbered answers back to entry IDs
  const answers: AnswerMap = {};
  textFields.forEach((field, i) => {
    const key = String(i + 1);
    if (rawAnswers[key]) {
      answers[field.entryId] = rawAnswers[key];
    }
  });

  return answers;
}

/**
 * Generate all responses for a run: N responses cycling through personas.
 */
export async function generateAllResponses(
  schema: FormSchema,
  personas: Persona[],
  totalResponses: number
): Promise<{ personaIndex: number; answers: AnswerMap }[]> {
  const responses: { personaIndex: number; answers: AnswerMap }[] = [];

  for (let i = 0; i < totalResponses; i++) {
    const personaIndex = i % personas.length;
    const persona = personas[personaIndex];
    const answers = await generateResponseForPersona(schema, persona);
    responses.push({ personaIndex, answers });
  }

  return responses;
}
