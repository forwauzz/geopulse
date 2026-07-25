import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAIEmbeddingProvider } from '../lib/intelligence/openai-embedding-provider';
import {
  runRetrievalExperiment,
  type RetrievalFixture,
} from '../lib/intelligence/retrieval-experiment';

const FIXTURE_PATH = resolve(
  process.cwd(),
  'eval/fixtures/intelligence-retrieval-experiment-v1.json'
);

async function main(): Promise<void> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RetrievalFixture;
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for the bounded semantic experiment.');
  const provider = new OpenAIEmbeddingProvider(apiKey);
  // Only deliberately synthetic, non-tenant examples leave the process.
  // Tenant isolation is evaluated by the local contract tests without embedding payloads.
  const externalSafeFixture: RetrievalFixture = {
    ...fixture,
    fixtureVersion: `${fixture.fixtureVersion}-external-safe`,
    documents: fixture.documents
      .filter((document) => document.visibility !== 'private_tenant')
      .map((document) => ({ ...document, visibility: 'public' as const, tenantId: null })),
    tasks: fixture.tasks
      .filter((task) => task.taskType !== 'access_control')
      .map((task) => ({
        ...task,
        filters: {
          ...task.filters,
          visibility: undefined,
          tenantId: undefined,
        },
        forbiddenEvidenceIds: [],
      })),
  };
  const report = await runRetrievalExperiment(externalSafeFixture, provider, {
    allowTenantPrivate: false,
    minimumPrecisionImprovement: 0.1,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.thresholdPassed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
