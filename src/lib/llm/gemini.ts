import { LLMProvider, LLMConfig, ChatMessage, ChatOptions, ChatResponse } from "./types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

const EXPANSION_PROMPT = `You are a file search assistant. Given a search query, generate 5 alternative search terms that might find related files or content.

Rules:
- Return ONLY the terms, one per line
- No numbering, no explanations
- Focus on: synonyms, abbreviations, related concepts
- Try to match the style of the query

Query: "{query}"

Alternative terms:`;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful research assistant embedded in a file search tool called BioGrep. 
You help users understand and navigate their files and documents.
Be concise but thorough. When referencing files, mention their names.
If you don't have enough context to answer, say so and suggest what information would help.`;

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

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        console.log("[LLM] chat called with", messages.length, "messages");

        if (!this.isConfigured()) {
            return {
                content: "",
                error: "API key not configured. Please set VITE_GEMINI_API_KEY in your .env file."
            };
        }

        try {
            // Build the system instruction
            const systemPrompt = options?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
            let fullSystemPrompt = systemPrompt;

            // Append context if provided (e.g., search results)
            if (options?.context) {
                fullSystemPrompt += `\n\n--- Current Search Context ---\n${options.context}`;
            }

            // Convert messages to Gemini format
            // Gemini uses "user" and "model" roles, and system prompt goes in systemInstruction
            const geminiContents = messages
                .filter(m => m.role !== "system") // System messages go in systemInstruction
                .map(m => ({
                    role: m.role === "assistant" ? "model" : "user",
                    parts: [{ text: m.content }]
                }));

            const response = await fetch(
                `${GEMINI_API_URL}/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{ text: fullSystemPrompt }]
                        },
                        contents: geminiContents,
                        generationConfig: {
                            temperature: options?.temperature ?? 0.7,
                            maxOutputTokens: options?.maxTokens ?? 1024,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Gemini API error:", response.status, errorText);
                return {
                    content: "",
                    error: `API error (${response.status}): ${errorText.slice(0, 100)}`
                };
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

            if (!content) {
                return { content: "", error: "Empty response from API" };
            }

            return { content };
        } catch (err) {
            console.error("Chat failed:", err);
            return {
                content: "",
                error: `Chat failed: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }
}

