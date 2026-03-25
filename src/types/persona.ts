export type Sentiment = "positive" | "neutral" | "critical" | "mixed";
export type Verbosity = "brief" | "moderate" | "detailed";

export type Persona = {
  name: string;
  age: number;
  occupation: string;
  background: string;
  sentiment: Sentiment;
  verbosity: Verbosity;
  answerTendencies: string;
};
