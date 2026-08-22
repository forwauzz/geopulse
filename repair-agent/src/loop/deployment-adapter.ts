import type { DeploymentObservation, DeploymentProbe, RepositoryProfile } from './contracts';
import { deploymentQaUrls } from './deployment-qa';

export interface AuthenticatedDeploymentReader {
  readDeployment(args: {
    provider: RepositoryProfile['repositoryAdapter']['deploymentProvider'];
    repository: string;
    deploymentId: string;
  }): Promise<DeploymentObservation>;
  probe(url: string): Promise<DeploymentProbe>;
}

export class DeploymentEvidenceAdapter {
  readonly #profile: RepositoryProfile;
  readonly #reader: AuthenticatedDeploymentReader;
  readonly #clock: () => Date;

  constructor(args: { profile: RepositoryProfile; reader: AuthenticatedDeploymentReader; clock?: () => Date }) {
    this.#profile = structuredClone(args.profile);
    this.#reader = args.reader;
    this.#clock = args.clock ?? (() => new Date());
  }

  async acquire(args: {
    deploymentId: string;
    sourceSha: string;
    environment: 'preview' | 'production';
  }): Promise<{ observation: DeploymentObservation; probes: DeploymentProbe[]; evaluatedAt: string }> {
    const observation = await this.#reader.readDeployment({
      provider: this.#profile.repositoryAdapter.deploymentProvider,
      repository: this.#profile.repository,
      deploymentId: args.deploymentId,
    });
    if (observation.deploymentId !== args.deploymentId || observation.sourceSha !== args.sourceSha || observation.environment !== args.environment) {
      throw new Error('deployment reader returned evidence for a different release');
    }
    const urls = deploymentQaUrls(this.#profile, args.environment, args.sourceSha);
    const probes = await Promise.all(urls.map((url) => this.#reader.probe(url)));
    return { observation, probes, evaluatedAt: this.#clock().toISOString() };
  }
}
