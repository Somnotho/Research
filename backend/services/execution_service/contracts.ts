import { z } from 'zod';
export const execution_input = z.object({
  operation: z.literal('python_test'),
  source: z.string().min(1).max(20000),
  tests: z.string().min(1).max(20000),
  timeout_seconds: z.number().int().min(2).max(20).default(10),
});
