import { compose_comparison_report } from './comparison_report.ts';
import { PrismaClient, Prisma } from './generated/index.js';
import { call_service } from '../../shared/http.ts';
import { consult_agent } from './agent_client.ts';
import { specialist_tasks, type SpecialistRole } from './agent_plan.ts';
import { setTimeout as wait_interval } from 'node:timers/promises';
import { research_limits, parse_plan, inspect_citations } from './planning.ts';

export function create_worker(database: PrismaClient) {
  let active = false;
  const controllers = new Map<string, AbortController>();
  async function record_step(run_id: string, agent: string, state: string, detail: string) {
    await database.research_step.create({ data: { run_id, agent, state, detail } });
  }
  async function execute_run(run_id: string) {
    const run = await database.research_run.findUniqueOrThrow({ where: { id: run_id } });
    const limits = research_limits.parse(run.limits ?? {});
    const controller = new AbortController();
    controllers.set(run_id, controller);
    const deadline = setTimeout(
      () => controller.abort(new Error('Research time budget exceeded')),
      limits.max_duration_seconds * 1000,
    );
    const calls: {
      role: string;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number } | null;
    }[] = [];
    async function check_budget() {
      const state = await database.research_run.findUniqueOrThrow({ where: { id: run_id } });
      if (state.cancel_requested) controller.abort(new Error('Cancelled by owner'));
      controller.signal.throwIfAborted();
    }
    async function request_agent(
      role: 'planner' | 'science' | 'commercial' | 'analytics' | 'reviewer' | 'director',
      task: string,
      context: string,
    ) {
      await check_budget();
      if (calls.length >= 6) throw new Error('Model call budget exhausted');
      // Reserve calls before dispatch, including parallel specialists.
      const entry: (typeof calls)[number] = { role, model: 'pending', usage: null };
      calls.push(entry);
      const result = await consult_agent(role, task, context.slice(0, limits.max_context_characters), {
        signal: controller.signal,
        max_output_tokens: limits.max_output_tokens,
      });
      entry.model = result.model;
      entry.usage = result.usage;
      await database.research_run.update({
        where: { id: run_id },
        data: { usage: calls as Prisma.InputJsonValue },
      });
      await check_budget();
      return result;
    }
    try {
      await check_budget();
      await record_step(
        run_id,
        'director',
        'running',
        'Planning → evidence and permitted computation → three specialists → independent review → synthesis. Maximum six model calls.',
      );
      const [
        project,
        documents,
        scenarios,
        experiments,
        sources,
        decisions,
        code_tests,
        history,
        comparisons,
      ] = await Promise.all([
        call_service('workspace', `/projects/${run.project_id}`),
        call_service('knowledge', `/projects/${run.project_id}/excerpts`, {
          method: 'POST',
          body: JSON.stringify({ question: run.question }),
        }),
        call_service('analytics', `/projects/${run.project_id}/scenarios`),
        call_service('scientific', `/projects/${run.project_id}/experiments`),
        call_service('evidence', `/projects/${run.project_id}/sources`),
        call_service('analytics', `/projects/${run.project_id}/decisions`),
        call_service('execution', `/projects/${run.project_id}/tests`),
        database.message.findMany({
          where: { project_id: run.project_id },
          orderBy: { created_at: 'desc' },
          take: 8,
        }),
        call_service('analytics', `/projects/${run.project_id}/comparisons`),
      ]);
      let web: any = { sources: [], method: 'External research disabled by user.' };
      if (run.web_enabled) {
        await record_step(
          run_id,
          'evidence',
          'running',
          'Discovering external evidence. The research question leaves this workspace.',
        );
        try {
          web = await call_service('evidence', '/search', {
            method: 'POST',
            body: JSON.stringify({ question: run.question }),
          });
        } catch (error) {
          web = { sources: [], method: 'External search failed; current market claims remain unverified.' };
          await record_step(run_id, 'evidence', 'warning', String(error));
        }
      }
      const scenario_evidence = scenarios.slice(0, 5).map((scenario: any) => {
        const { cash_flows, ...summary } = scenario.result;
        return { id: scenario.id, label: scenario.label, result: summary };
      });
      const scientific_tool_results: unknown[] = experiments.slice(0, 5);
      const packet = {
        question: run.question,
        company_brief: project.brief ?? null,
        documents,
        improvement_comparisons: comparisons.slice(0, 5),
        scenarios: scenario_evidence,
        scientific_tool_results,
        implementation_test_receipts: code_tests.slice(0, 3),
        decision_matrices: decisions,
        saved_sources: sources.map((source: any) => ({ ...source, text: source.text.slice(0, 5000) })),
        web,
        history: history
          .reverse()
          .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) })),
        context_scope:
          'Latest versions; retrieved excerpts; latest five scenarios and experiments; latest eight messages. Provider context is length-limited.',
      };
      const context = () => JSON.stringify(packet).slice(0, Math.floor(limits.max_context_characters * 0.5));
      await record_step(
        run_id,
        'planner',
        'running',
        'Creating an explicit plan, identifying missing inputs and choosing bounded scientific tools.',
      );
      const planner = await request_agent(
        'planner',
        `Return ONLY JSON matching {objective:string,tasks:[{owner:"science"|"commercial"|"analytics"|"reviewer"|"director",task:string}],tool_calls:[{purpose:string,assumptions:string[],input:object}],missing_inputs:string[]}. Maximum ${limits.max_tool_calls} tool calls. Allowed input operations: simplify/differentiate/integrate/solve/evaluate {expression,variable,values}; verify_identity {left,right}; prove_linear {premises:string[],conclusion:string}; matrix {matrix:number[][]}; statistics {baseline:number[],candidate:number[]}; monte_carlo {upfront_cost,monthly_savings,monthly_running_cost,savings_uncertainty:0..1,months:1..600,samples:100..10000,seed}; convert_units {value,source_unit,target_unit}. Use explicit source values or declare every hypothetical input as an assumption. ${limits.allow_code_execution ? 'You may also use python_test {source:string,tests:string,timeout_seconds:2..20}. Tests must use Python unittest and standard library only. Code runs in a network-disabled, resource-limited disposable container without host files.' : 'Code execution is not permitted for this run.'} No company changes. Do not choose tools when unrelated to the question.`,
        context(),
      );
      const plan = parse_plan(planner.text);
      plan.tool_calls = plan.tool_calls.slice(0, limits.max_tool_calls);
      if (!plan.tool_calls.length && scenario_evidence.length && limits.max_tool_calls > 0) {
        const scenario = scenario_evidence[0].result;
        plan.tool_calls.push({
          purpose: 'Proactively test uncertainty in the latest user financial scenario',
          assumptions: [
            '20% relative standard deviation in savings is an exploratory assumption, not a measured uncertainty',
          ],
          input: {
            operation: 'monte_carlo',
            upfront_cost: scenario.upfront_cost,
            monthly_savings: scenario.monthly_savings,
            monthly_running_cost: scenario.monthly_running_cost,
            savings_uncertainty: 0.2,
            months: scenario.months,
            samples: 2000,
            seed: 42,
          },
        });
      }
      await database.research_run.update({
        where: { id: run_id },
        data: { plan: plan as Prisma.InputJsonValue },
      });
      await record_step(
        run_id,
        'planner',
        'completed',
        JSON.stringify({ ...planner, text: JSON.stringify(plan, null, 2) }),
      );
      for (const tool of plan.tool_calls) {
        await check_budget();
        await record_step(
          run_id,
          'scientific',
          'running',
          `${tool.purpose}; operation: ${tool.input.operation}`,
        );
        try {
          let result: any;
          if (tool.input.operation === 'python_test') {
            if (!limits.allow_code_execution) throw new Error('Code execution was not enabled by the owner');
            const job = await call_service('execution', `/projects/${run.project_id}/tests`, {
              method: 'POST',
              body: JSON.stringify(tool.input),
              signal: controller.signal,
            });
            for (let attempt = 0; attempt < 55; attempt++) {
              await check_budget();
              const receipt = await call_service('execution', `/tests/${job.id}`, {
                signal: controller.signal,
              });
              if (['completed', 'failed', 'cancelled'].includes(receipt.state)) {
                result = receipt;
                break;
              }
              await wait_interval(500, undefined, { signal: controller.signal });
            }
            if (!result)
              throw new Error('Implementation test did not return within its bounded execution window');
          } else
            result = await call_service('scientific', `/projects/${run.project_id}/experiments`, {
              method: 'POST',
              body: JSON.stringify(tool.input),
              signal: controller.signal,
            });
          scientific_tool_results.push({
            ...result,
            purpose: tool.purpose,
            declared_assumptions: tool.assumptions,
          });
          await record_step(run_id, 'scientific', 'completed', JSON.stringify(result));
        } catch (error) {
          scientific_tool_results.push({
            operation: tool.input.operation,
            error: String(error),
            state: 'failed',
          });
          await record_step(
            run_id,
            'scientific',
            'warning',
            `Tool failed; no result may be claimed: ${String(error)}`,
          );
        }
      }
      await check_budget();
      await database.research_run.update({
        where: { id: run_id },
        data: { evidence: packet as Prisma.InputJsonValue },
      });
      await record_step(
        run_id,
        'evidence',
        'completed',
        'Evidence packet, company context, real calculations and source limitations recorded.',
      );
      const analyses = await Promise.all(
        (Object.keys(specialist_tasks) as SpecialistRole[]).map(async (role) => {
          const task =
            specialist_tasks[role] +
            '\nPlan tasks: ' +
            plan.tasks
              .filter((task) => task.owner === role)
              .map((task) => task.task)
              .join('; ');
          await record_step(run_id, role, 'running', task);
          const result = await request_agent(role, task, context());
          await record_step(run_id, role, 'completed', JSON.stringify(result));
          return { role, ...result };
        }),
      );
      const specialist_context = JSON.stringify(analyses);
      await record_step(
        run_id,
        'reviewer',
        'running',
        'Cross-checking all specialist findings against tool results, assumptions and source provenance.',
      );
      const review = await request_agent(
        'reviewer',
        'Challenge every specialist claim. Check numerical results against the scientific receipts; identify assumptions, citation gaps, physical limitations and contradictions. Explain the strongest counterargument and required corrections. Only formal_linear/prove_linear results establish the specific encoded linear claim; do not generalize them.',
        context() + '\nSPECIALISTS:\n' + specialist_context,
      );
      await record_step(run_id, 'reviewer', 'completed', JSON.stringify(review));
      await record_step(
        run_id,
        'director',
        'running',
        'Resolving review objections and producing an evidence-based implementation proposal.',
      );
      const synthesis = await request_agent(
        'director',
        'Evaluate the improvement_comparisons against the current-state baseline: quantify gains and regressions, preserve estimate/observed labels and references, address trade-offs, and never force a favorable conclusion. Resolve reviewer objections explicitly. Answer with problem statement, evidence, options matrix, computed results with experiment IDs, symbolic equations with units and assumptions, financial feasibility, employee impact, risks, staged implementation, acceptance criteria and the next investigation. Distinguish formal results, user assumptions, simulations and unrun physical tests. Cite only supplied URLs and document locations.',
        context() + '\nSPECIALISTS:\n' + specialist_context + '\nREVIEW:\n' + review.text,
      );
      const citation_audit = inspect_citations(synthesis.text, [
        ...web.sources.map((source: any) => source.url),
        ...sources.map((source: any) => source.url),
      ]);
      const answer =
        synthesis.text +
        (citation_audit.unrecognized_urls.length
          ? '\n\n### Source provenance warning\nThe following references were not in the retrieved evidence and need verification: ' +
            citation_audit.unrecognized_urls.join(', ')
          : '');
      const content =
        '# Executive research proposal\n\nPrepared: ' +
        new Date().toISOString() +
        '\n\n' +
        compose_comparison_report(comparisons.slice(0, 5)) +
        '## Research synthesis\n\n' +
        answer +
        '\n\n---\n# Research plan\n```json\n' +
        JSON.stringify(plan, null, 2) +
        '\n```\n\n# Specialist working notes\n\n' +
        analyses.map((result) => `## ${result.role}\n${result.text}`).join('\n\n') +
        '\n\n## Independent review\n' +
        review.text +
        '\n\n# Evidence provenance and executed tools\n```json\n' +
        JSON.stringify({ ...packet, citation_audit, usage: calls }, null, 2) +
        '\n```';
      await check_budget();
      const report = await call_service('report', '/reports', {
        method: 'POST',
        body: JSON.stringify({
          project_id: run.project_id,
          run_id,
          title: run.question.slice(0, 120),
          content,
        }),
      });
      await check_budget();
      await record_step(run_id, 'director', 'completed', JSON.stringify(synthesis));
      await database.$transaction(async (transaction) => {
        const committed = await transaction.research_run.updateMany({
          where: { id: run_id, state: 'running', cancel_requested: false },
          data: { state: 'completed', answer, report_id: report.id, completed_at: new Date() },
        });
        if (!committed.count) throw new Error('Investigation stopped before publishing the final answer');
        await transaction.message.create({
          data: { project_id: run.project_id, role: 'assistant', content: answer },
        });
      });
    } catch (error) {
      const state = await database.research_run.findUniqueOrThrow({ where: { id: run_id } });
      const cancelled = state.cancel_requested;
      const detail = cancelled
        ? 'Cancelled by owner; completed tool receipts and partial findings retained.'
        : controller.signal.aborted
          ? 'Research time budget exceeded; no further model calls were dispatched.'
          : error instanceof Error
            ? error.message
            : 'Research workflow failed';
      await database.research_run.update({
        where: { id: run_id },
        data: {
          state: cancelled ? 'cancelled' : 'failed',
          error: detail,
          usage: calls as Prisma.InputJsonValue,
          completed_at: new Date(),
        },
      });
      await record_step(run_id, 'director', cancelled ? 'cancelled' : 'failed', detail);
    } finally {
      clearTimeout(deadline);
      controllers.delete(run_id);
    }
  }
  async function poll_queue() {
    if (active) return;
    active = true;
    try {
      const run = await database.research_run.findFirst({
        where: { state: 'queued' },
        orderBy: { created_at: 'asc' },
      });
      if (run) {
        const claim = await database.research_run.updateMany({
          where: { id: run.id, state: 'queued' },
          data: { state: 'running' },
        });
        if (claim.count) await execute_run(run.id);
      }
    } finally {
      active = false;
    }
  }
  return {
    poll_queue,
    cancel_run: (run_id: string) => controllers.get(run_id)?.abort(new Error('Cancelled by owner')),
  };
}
