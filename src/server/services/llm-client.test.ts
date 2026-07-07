import { afterEach, describe, expect, it, vi } from "vitest";
import { callLLM } from "@/server/services/llm-client";

const mocks = vi.hoisted(() => ({
  completionsCreate: vi.fn(),
  openAIConstructor: vi.fn()
}));

vi.mock("openai", () => ({
  default: mocks.openAIConstructor.mockImplementation(() => ({
    chat: {
      completions: {
        create: mocks.completionsCreate
      }
    }
  }))
}));

describe("llm client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.AI_PROVIDER;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it("calls the Ollama endpoint shape when AI_PROVIDER is ollama", async () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL = "http://ollama.test/";
    process.env.OLLAMA_MODEL = "llama-test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "[{\"ok\":true}]" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLLM("system prompt", "user prompt");

    expect(result).toBe("[{\"ok\":true}]");
    expect(fetchMock).toHaveBeenCalledWith("http://ollama.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String)
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      model: "llama-test",
      stream: false,
      options: { temperature: 0, num_ctx: 8192 },
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" }
      ]
    });
  });

  it("calls Groq through the OpenAI-compatible client when AI_PROVIDER is groq", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "groq-key";
    process.env.GROQ_MODEL = "groq-model";
    mocks.completionsCreate.mockResolvedValue({
      choices: [{ message: { content: "[{\"provider\":\"groq\"}]" } }]
    });

    const result = await callLLM("system prompt", "user prompt");

    expect(result).toBe("[{\"provider\":\"groq\"}]");
    expect(mocks.openAIConstructor).toHaveBeenCalledWith({
      apiKey: "groq-key",
      baseURL: "https://api.groq.com/openai/v1"
    });
    expect(mocks.completionsCreate).toHaveBeenCalledWith({
      model: "groq-model",
      temperature: 0,
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" }
      ]
    });
  });
});
