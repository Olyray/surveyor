import { NextRequest, NextResponse } from "next/server";
import { generateAllResponses } from "@/lib/responseGenerator";
import type { FormSchema } from "@/types/form";
import type { Persona } from "@/types/persona";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { schema, personas, count } = body as {
    schema?: FormSchema;
    personas?: Persona[];
    count?: number;
  };

  if (!schema || !schema.fields || schema.fields.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'schema'" },
      { status: 400 }
    );
  }

  if (!personas || !Array.isArray(personas) || personas.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'personas'" },
      { status: 400 }
    );
  }

  const totalResponses = Math.min(Math.max(count ?? 10, 1), 500);

  try {
    const responses = await generateAllResponses(
      schema,
      personas,
      totalResponses
    );
    return NextResponse.json({ responses });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate responses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
