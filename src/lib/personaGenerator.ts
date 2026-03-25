import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FormSchema } from "@/types/form";
import type { Persona } from "@/types/persona";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * Generate a set of personas based on a form's content using Gemini.
 */
export async function generatePersonas(
  schema: FormSchema,
  count: number = 10
): Promise<Persona[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const questionLabels = schema.fields.map((f) => `- ${f.label}`).join("\n");

  const prompt = `You are helping generate test data for a Google Forms survey.

Survey title: "${schema.title}"
Survey description: "${schema.description}"
Questions:
${questionLabels}

Generate exactly ${count} distinct personas who would realistically fill out this survey. Each persona should have a unique perspective and background.

Return a JSON array where each element has:
- "name": string (realistic full name)
- "age": number (between 18 and 75)
- "occupation": string
- "background": string (1-2 sentences about their relevant background)
- "sentiment": one of "positive", "neutral", "critical", or "mixed"
- "verbosity": one of "brief", "moderate", or "detailed"
- "answerTendencies": string (1 sentence describing how they typically respond to surveys)

Ensure a good mix of sentiments and verbosity levels across all personas.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const personas: Persona[] = JSON.parse(text);

  if (!Array.isArray(personas) || personas.length === 0) {
    throw new Error("LLM returned invalid persona data");
  }

  return personas;
}
