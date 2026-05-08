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

IMPORTANT: All personas are Nigerians. Use Nigerian full names (from any of the major ethnic groups: Yoruba, Igbo, Hausa-Fulani, Efik, Ijaw, Tiv, etc.). Occupations, educational qualifications, and backgrounds must reflect the Nigerian context — e.g. degrees are B.Sc, HND, OND, M.Sc, MBA, Ph.D (not Associate Degree or equivalents that don't exist in Nigeria's system). Reference Nigerian cities, universities, companies, and everyday experiences where relevant.

Return a JSON array where each element has:
- "name": string (realistic Nigerian full name)
- "age": number (between 18 and 60)
- "occupation": string
- "background": string (1-2 sentences about their relevant background, grounded in Nigerian context)
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
