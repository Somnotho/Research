export const specialist_tasks = {
  science:
    'Analyze technical mechanisms, equations, limits, alternative technologies, infrastructure and experiments.',
  commercial:
    'Analyze business position, market evidence, competitors, implementation, adoption, employee workload and financial assumptions.',
  analytics:
    'Interpret provided calculator outputs and quantify uncertainty. Show missing inputs, sensitivity scenarios and decision metrics. Do not invent data.',
} as const;

export type SpecialistRole = keyof typeof specialist_tasks;
