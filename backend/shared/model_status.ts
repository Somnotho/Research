export function read_model_status() {
  return {
    mode: process.env.RESEARCH_MODEL_MODE === 'simulation' ? 'simulation' : 'azure',
    configured: Boolean(
      process.env.AZURE_AI_ENDPOINT && process.env.AZURE_AI_MODEL && process.env.RESEARCH_AZURE_KEY,
    ),
    model: process.env.AZURE_AI_MODEL ?? null,
  };
}
