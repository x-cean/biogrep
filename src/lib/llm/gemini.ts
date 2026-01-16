import { LLMProvider, LLMConfig } from "./types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

const EXPANSION_PROMPT = `You are a file search assistant. Given a search query, generate 5 alternative search terms that might find related files or content.

Rules:
- Return ONLY the terms, one per line
- No numbering, no explanations
- Focus on: synonyms, abbreviations, related concepts
- Try to match the style of the query

Query: "{query}"

Alternative terms:`;

export class GeminiProvider implements LLMProvider {
    private apiKey: string;
    private model: string;

    constructor(config: LLMConfig = {}) {
        this.apiKey = config.apiKey || import.meta.env.VITE_GEMINI_API_KEY || "";
        this.model = config.model || DEFAULT_MODEL;
    }

    isConfigured(): boolean {
        const configured = Boolean(this.apiKey);
        console.log("[LLM] Provider configured:", configured, "Key length:", this.apiKey.length);
        return configured;
    }

    async expandQuery(query: string): Promise<string[]> {
        console.log("[LLM] expandQuery called with:", query);
        if (!this.isConfigured()) {
            console.warn("Gemini API key not configured, skipping query expansion");
            return [];
        }

        try {
            const prompt = EXPANSION_PROMPT.replace("{query}", query);

            const response = await fetch(
                `${GEMINI_API_URL}/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 100,
                        },
                    }),
                }
            );

            if (!response.ok) {
                console.error("Gemini API error:", response.status, await response.text());
                return [];
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Parse response: split by newlines, clean up, filter empty
            const terms = text
                .split("\n")
                .map((line: string) => line.trim().toLowerCase())
                .filter((term: string) => term && term !== query.toLowerCase())
                .slice(0, 5);

            return terms;
        } catch (err) {
            console.error("Query expansion failed:", err);
            return [];
        }
    }
}
