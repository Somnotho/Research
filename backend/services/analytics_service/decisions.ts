import { z } from 'zod';
export const decision_input = z
  .object({
    label: z.string().trim().min(1).max(120),
    criteria: z
      .array(
        z.object({ name: z.string().trim().min(1).max(80), weight: z.number().finite().min(0).max(100) }),
      )
      .min(2)
      .max(8),
    options: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          scores: z.array(z.number().finite().min(0).max(10)).min(2).max(8),
        }),
      )
      .min(2)
      .max(8),
  })
  .superRefine((input, context) => {
    if (input.criteria.reduce((sum, item) => sum + item.weight, 0) <= 0)
      context.addIssue({ code: 'custom', message: 'At least one criterion needs a positive weight' });
    if (new Set(input.criteria.map((item) => item.name)).size !== input.criteria.length)
      context.addIssue({ code: 'custom', message: 'Criterion names must be unique' });
    if (input.options.some((option) => option.scores.length !== input.criteria.length))
      context.addIssue({ code: 'custom', message: 'Every option requires a score for every criterion' });
  });
export function calculate_decision(input: z.infer<typeof decision_input>) {
  const total_weight = input.criteria.reduce((sum, item) => sum + item.weight, 0);
  return {
    criteria: input.criteria.map((criterion) => ({
      ...criterion,
      normalized_weight: criterion.weight / total_weight,
    })),
    ranking: input.options
      .map((option) => ({
        ...option,
        weighted_score: option.scores.reduce(
          (sum, score, index) => sum + (score * input.criteria[index].weight) / total_weight,
          0,
        ),
      }))
      .sort((first, second) => second.weighted_score - first.weighted_score),
    assumptions: [
      'Scores are user judgments on a 0–10 scale, with higher always better',
      'Weights are normalized; scores are not market evidence or a physical feasibility proof',
      'Revisit weights and score uncertainty before choosing an option',
    ],
  };
}
