import type { PublicCategory, PublicTool } from "../registry";

export interface PublicInstruction {
  id: string;
  step: number;
  text: string;
}

export interface PublicExample {
  id: string;
  title: string;
  input: string;
  output: string;
}

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
}

export interface PublicReference {
  id: string;
  title: string;
  url: string;
}

export interface PublicToolContent {
  title: string;
  summary: string;
  instructions: PublicInstruction[];
  examples: PublicExample[];
  faqs: PublicFaq[];
  references: PublicReference[];
}

export interface PublicToolWithContent extends PublicTool {
  content: PublicToolContent;
}

export interface PublicArticle {
  id: string;
  title: string;
  description: string;
  body: string;
}

export interface PublicContentOutput {
  tools: PublicToolWithContent[];
  categories: PublicCategory[];
  articles: PublicArticle[];
}