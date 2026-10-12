import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { AiInsightKind } from '@prisma/client';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { AppConfig } from '../../config/configuration';
import {
  generatedInsightsSchema,
  type GeneratedInsight,
  type GeneratedInsights,
} from './ai.schema';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  type AggregateSnapshot,
} from './prompt.builder';

export interface GenerationRequest {
  snapshot: AggregateSnapshot;
  kinds: AiInsightKind[];
  locale: 'en' | 'ar';
}

export interface GenerationResult {
  insights: GeneratedInsight[];
  model: string;
}

export interface AiProvider {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * The structured-output schema, derived from the Zod schema so there is one
 * definition rather than two that can drift.
 *
 * The SDK's `zodOutputFormat` helper is bound to Zod 4 and this workspace is on
 * Zod 3, so the JSON Schema form of the same schema is handed over instead. The
 * response is still validated with Zod below - that validation, not the schema
 * hint, is what actually guarantees the shape.
 */
const OUTPUT_JSON_SCHEMA = zodToJsonSchema(
  // Widened on the way in: the Anthropic SDK pulls in its own Zod major, so the
  // hoisted `zod-to-json-schema` types resolve against a different Zod instance
  // than this workspace's. The JSON Schema output is untyped either way.
  generatedInsightsSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
  { $refStrategy: 'none' },
) as Parameters<typeof jsonSchemaOutputFormat>[0];

/* -------------------------------------------------------------------------- */
/* Anthropic                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Calls the Messages API with structured outputs, so the response is already
 * schema-shaped rather than prose that has to be scraped.
 *
 * This only ever runs in the worker. The key lives in the API's environment and
 * never reaches a device.
 */
@Injectable()
export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicAiProvider.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const ai = config.get('ai', { infer: true });
    this.model = ai.model;
    this.client = new Anthropic({ apiKey: ai.apiKey });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        // Weighing several stadiums and disciplines against each other is
        // exactly the kind of work adaptive thinking is for.
        thinking: { type: 'adaptive' },
        messages: [
          {
            role: 'user',
            content: buildUserPrompt(request.snapshot, request.kinds, request.locale),
          },
        ],
        output_config: { format: jsonSchemaOutputFormat(OUTPUT_JSON_SCHEMA) },
      });

      // `parsed_output` is null when the output could not be parsed at all.
      if (!response.parsed_output) {
        throw new Error('The model returned a response that could not be parsed');
      }

      // Validated here rather than trusted: this is what keeps a malformed
      // generation out of an admin's review queue.
      const parsed = generatedInsightsSchema.safeParse(response.parsed_output);
      if (!parsed.success) {
        throw new Error(
          `The model's output did not match the insight schema: ${
            parsed.error.issues[0]?.message ?? 'unknown issue'
          }`,
        );
      }

      const insights: GeneratedInsights = parsed.data;
      return { insights: insights.insights, model: this.model };
    } catch (error) {
      // Most specific first: a rate limit is worth retrying, a bad request is not.
      if (error instanceof Anthropic.RateLimitError) {
        throw new Error('AI provider rate limit reached; the job will be retried');
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error('AI_API_KEY was rejected by the provider');
      }
      if (error instanceof Anthropic.BadRequestError) {
        throw new Error(`AI request was rejected: ${error.message}`);
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new Error('Could not reach the AI provider');
      }
      if (error instanceof Anthropic.APIError) {
        throw new Error(`AI provider error ${error.status}: ${error.message}`);
      }
      throw error;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Local                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The development default: derives insights from the snapshot with plain rules.
 *
 * It exists so the whole AI pipeline - queue, storage, the admin review step and
 * the report section - can be built and tested without an API key and without
 * anything leaving the machine. The output is labelled AI-generated and still
 * requires review, exactly like the real provider's.
 */
@Injectable()
export class LocalAiProvider implements AiProvider {
  readonly name = 'local';

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const { snapshot } = request;
    const s = snapshot.summary;

    const insights = request.kinds.map((kind): GeneratedInsight => {
      switch (kind) {
        case 'TREND_SUMMARY':
          return this.trendSummary(snapshot);
        case 'RISK_FORECAST':
          return this.riskForecast(snapshot);
        case 'ANOMALY':
          return this.anomaly(snapshot);
        case 'RECOMMENDATION':
        default:
          return this.recommendation(snapshot);
      }
    });

    // Nothing asynchronous happens here; the signature matches the interface.
    return Promise.resolve({
      insights,
      model: `local-rules/${s.inspections > 0 ? 'data' : 'empty'}`,
    });
  }

  private trendSummary(snapshot: AggregateSnapshot): GeneratedInsight {
    const s = snapshot.summary;
    const direction =
      s.complianceDelta === null
        ? 'with no comparable previous period'
        : s.complianceDelta >= 0
          ? `up ${s.complianceDelta} points on the previous period`
          : `down ${Math.abs(s.complianceDelta)} points on the previous period`;

    return {
      kind: 'TREND_SUMMARY',
      title: `Compliance ${describe(s.compliancePercent)} across ${s.inspections} inspections`,
      body:
        `Between ${snapshot.period.start} and ${snapshot.period.end}, ${s.inspections} inspections and ` +
        `${s.observations} observations were submitted${snapshot.stadium ? ` at ${snapshot.stadium}` : ' across all stadiums'}. ` +
        `Compliance stands at ${describe(s.compliancePercent)}, ${direction}. ` +
        `${s.findingsTotal} findings were raised, of which ${s.findingsClosed} are closed and ${s.findingsOverdue} are overdue.`,
      bullets: [
        `Closure rate ${describe(s.closureRate)} with an average of ${s.averageDaysToClose ?? '—'} days to close.`,
        `EOD submissions ${s.eodSubmitted} of ${s.eodExpected} expected.`,
        `${s.totalManHours} man-hours recorded, ${s.recordableIncidents} recordable incident(s) and ${s.nearMisses} near miss(es).`,
      ],
      severity: bandToSeverity(s.compliancePercent),
      confidence: s.inspections >= 10 ? 0.75 : 0.4,
    };
  }

  private riskForecast(snapshot: AggregateSnapshot): GeneratedInsight {
    const worstDiscipline = [...snapshot.disciplines]
      .filter((row) => row.compliancePercent !== null)
      .sort((a, b) => (a.compliancePercent ?? 100) - (b.compliancePercent ?? 100))[0];
    const s = snapshot.summary;

    return {
      kind: 'RISK_FORECAST',
      title: worstDiscipline
        ? `${worstDiscipline.name} carries the highest residual risk`
        : 'Insufficient data for a risk forecast',
      body: worstDiscipline
        ? `${worstDiscipline.name} is the weakest discipline at ${describe(worstDiscipline.compliancePercent)}, ` +
          `with ${worstDiscipline.critical} critical and ${worstDiscipline.high} high severity findings. ` +
          `Overall ${s.findingsOverdue} corrective action(s) are past their due date, which is where unresolved risk accumulates.`
        : 'Too few submitted records in this period to forecast risk with any confidence.',
      bullets: worstDiscipline
        ? [
            `Re-inspect ${worstDiscipline.name} before the next match day.`,
            `Clear the ${s.findingsOverdue} overdue corrective action(s) first.`,
            `Risk index is ${s.riskIndex} per 100 inspected items.`,
          ]
        : ['Increase inspection coverage before relying on these figures.'],
      severity: s.severity.CRITICAL > 0 ? 'CRITICAL' : s.severity.HIGH > 0 ? 'HIGH' : 'MEDIUM',
      confidence: worstDiscipline ? 0.6 : 0.2,
    };
  }

  private recommendation(snapshot: AggregateSnapshot): GeneratedInsight {
    const top = snapshot.repeatFailures.slice(0, 3);
    const s = snapshot.summary;

    return {
      kind: 'RECOMMENDATION',
      title:
        top.length > 0
          ? `Target the ${top.length} most frequent non-compliances`
          : 'Maintain current inspection cadence',
      body:
        top.length > 0
          ? `The same checklist items keep failing: ${top
              .map((item) => `${item.itemCode} (${item.noCount} times)`)
              .join(', ')}. Repeat failures on the same item usually mean a process or briefing gap rather than one-off lapses.`
          : `No checklist item failed repeatedly in this period. Compliance is ${describe(s.compliancePercent)} and ${s.findingsOverdue} action(s) are overdue.`,
      bullets:
        top.length > 0
          ? top.map((item) => `${item.itemCode}: ${item.question} - failed ${item.noCount} time(s).`)
          : [`Keep EOD submissions at or above ${s.eodSubmitted}/${s.eodExpected}.`],
      severity: top.length > 2 ? 'HIGH' : 'MEDIUM',
      confidence: top.length > 0 ? 0.7 : 0.35,
    };
  }

  private anomaly(snapshot: AggregateSnapshot): GeneratedInsight {
    const scored = snapshot.stadiums.filter((row) => row.compliancePercent !== null);
    const average =
      scored.length > 0
        ? scored.reduce((sum, row) => sum + (row.compliancePercent ?? 0), 0) / scored.length
        : null;
    const outlier =
      average === null
        ? undefined
        : scored.find((row) => (row.compliancePercent ?? 0) < average - 10);

    return {
      kind: 'ANOMALY',
      title: outlier
        ? `${outlier.name} is well below the average`
        : 'No stadium is a clear outlier',
      body: outlier
        ? `${outlier.name} is at ${describe(outlier.compliancePercent)} against an average of ${average?.toFixed(2)}% ` +
          `across ${scored.length} stadium(s), with ${outlier.findingsOverdue} overdue action(s) and a risk index of ${outlier.riskIndex}.`
        : `Compliance is within 10 points of the ${scored.length}-stadium average everywhere, so no single venue stands out in this period.`,
      bullets: outlier
        ? [
            `Review the inspection history for ${outlier.name}.`,
            `Clear ${outlier.findingsOverdue} overdue action(s) at this venue.`,
          ]
        : ['No venue-specific action indicated by these figures.'],
      severity: outlier ? 'HIGH' : 'LOW',
      confidence: scored.length >= 2 ? 0.55 : 0.2,
    };
  }
}

function describe(percent: number | null): string {
  return percent === null ? 'no score (nothing answerable)' : `${percent.toFixed(2)}%`;
}

function bandToSeverity(percent: number | null): GeneratedInsight['severity'] {
  if (percent === null) return 'LOW';
  if (percent < 50) return 'CRITICAL';
  if (percent < 70) return 'HIGH';
  if (percent < 85) return 'MEDIUM';
  return 'LOW';
}
