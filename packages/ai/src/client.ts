import Anthropic from "@anthropic-ai/sdk";

export interface AIClient {
  claude: Anthropic;
  /** Use Haiku for classification ($0.80/M input) */
  classify: <T>(params: Anthropic.MessageCreateParams) => Promise<T>;
  /** Use Sonnet for content generation ($3/M input) */
  generate: (params: Anthropic.MessageCreateParams) => Promise<string>;
}

export function createAIClient(apiKey?: string): AIClient {
  const claude = new Anthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  return {
    claude,

    async classify<T>(params: Anthropic.MessageCreateParams): Promise<T> {
      const response = await claude.messages.create({
        ...params,
        model: params.model ?? "claude-haiku-4-5-20251001",
        stream: false,
      }) as Anthropic.Message;

      const toolBlock = response.content.find((b: any) => b.type === "tool_use");
      if (!toolBlock || toolBlock.type !== "tool_use") {
        throw new Error("No tool_use block in response");
      }
      return toolBlock.input as T;
    },

    async generate(params: Anthropic.MessageCreateParams): Promise<string> {
      const response = await claude.messages.create({
        ...params,
        model: params.model ?? "claude-sonnet-4-20250514",
        stream: false,
      }) as Anthropic.Message;

      const textBlock = response.content.find((b: any) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in response");
      }
      return textBlock.text;
    },
  };
}
