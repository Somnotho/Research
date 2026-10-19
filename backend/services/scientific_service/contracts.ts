import { z } from 'zod';

const expression = z.string().min(1).max(500);
const variable = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/);
export const experiment_input = z.discriminatedUnion('operation', [
  z.object({
    operation: z.enum(['simplify', 'differentiate', 'integrate', 'solve', 'evaluate']),
    expression,
    variable: variable.default('x'),
    values: z.record(variable, z.number().finite().min(-1e12).max(1e12)).default({}),
  }),
  z.object({ operation: z.literal('verify_identity'), left: expression, right: expression }),
  z.object({
    operation: z.literal('prove_linear'),
    premises: z.array(expression).max(10),
    conclusion: expression,
  }),
  z.object({
    operation: z.literal('matrix'),
    matrix: z
      .array(z.array(z.number().finite().min(-1e9).max(1e9)).min(1).max(8))
      .min(1)
      .max(8),
  }),
  z.object({
    operation: z.literal('statistics'),
    baseline: z.array(z.number().finite()).min(3).max(10000),
    candidate: z.array(z.number().finite()).min(3).max(10000),
  }),
  z.object({
    operation: z.literal('monte_carlo'),
    upfront_cost: z.number().min(0).max(1e12),
    monthly_savings: z.number().min(0).max(1e12),
    monthly_running_cost: z.number().min(0).max(1e12),
    savings_uncertainty: z.number().min(0).max(1).default(0.2),
    months: z.number().int().min(1).max(600).default(24),
    samples: z.number().int().min(100).max(10000).default(2000),
    seed: z.number().int().min(0).max(2147483647).default(42),
  }),
  z.object({
    operation: z.literal('convert_units'),
    value: z.number().finite(),
    source_unit: z.string().min(1).max(60),
    target_unit: z.string().min(1).max(60),
  }),
]);
export type ExperimentInput = z.infer<typeof experiment_input>;
