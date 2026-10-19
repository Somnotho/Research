import { z } from 'zod';
import { experiment_input } from '../scientific_service/contracts.ts';
import { execution_input } from '../execution_service/contracts.ts';

export const research_limits = z.object({
  max_tool_calls: z.number().int().min(0).max(4).default(3),
  max_duration_seconds: z.number().int().min(60).max(1200).default(600),
  max_output_tokens: z.number().int().min(500).max(4000).default(2000),
  max_context_characters: z.number().int().min(12000).max(80000).default(50000),
  allow_code_execution: z.boolean().default(false),
});
export const research_plan = z.object({
  objective: z.string().min(1).max(1000),
  tasks: z
    .array(
      z.object({
        owner: z.enum(['science', 'commercial', 'analytics', 'reviewer', 'director']),
        task: z.string().min(1).max(1000),
      }),
    )
    .min(1)
    .max(10),
  tool_calls: z
    .array(
      z.object({
        purpose: z.string().min(1).max(500),
        assumptions: z.array(z.string().max(300)).max(8),
        input: z.union([experiment_input, execution_input]),
      }),
    )
    .max(4)
    .default([]),
  missing_inputs: z.array(z.string().max(500)).max(12).default([]),
});

export function parse_plan(text: string) {
  return research_plan.parse(
    JSON.parse(
      text
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
        .trim(),
    ),
  );
}

export function inspect_citations(text: string, allowed_urls: string[]) {
  const urls = [...new Set(text.match(/https?:\/\/[^\s<>\])"}]+/g) ?? [])];
  return {
    cited_urls: urls,
    unrecognized_urls: urls.filter((url) => !allowed_urls.includes(url.replace(/[.,;]$/, ''))),
    limitation:
      'URL provenance check only. It does not prove that a source supports each claim or that quoted material is correct.',
  };
}
