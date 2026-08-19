import type { GitHubRequiredCheckObservation, GitHubRoleObservation, PullRequestObservation } from './contracts';
import { parseGitHubCheckRunObservation, parseGitHubPullRequestObservation, parseGitHubRequiredCheckObservation } from './github-observations';

export interface AuthenticatedGitHubReader {
  readCheckRun(repository: string, checkRunId: number): Promise<unknown>;
  readPullRequest(repository: string, pullRequestNumber: number): Promise<unknown>;
  readLinkedIssueNumbers(repository: string, pullRequestNumber: number): Promise<readonly number[]>;
}

export class GitHubObservationAdapter {
  readonly #reader: AuthenticatedGitHubReader;
  readonly #repository: string;
  readonly #clock: () => Date;

  constructor(args: { reader: AuthenticatedGitHubReader; repository: string; clock?: () => Date }) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repository)) throw new Error('GitHub adapter repository is invalid');
    this.#reader = args.reader;
    this.#repository = args.repository;
    this.#clock = args.clock ?? (() => new Date());
  }

  async observeRole(role: 'reviewer' | 'qa' | 'merge-controller', checkRunId: number): Promise<GitHubRoleObservation> {
    const raw = await this.#reader.readCheckRun(this.#repository, checkRunId);
    return parseGitHubCheckRunObservation({ raw, role, repository: this.#repository, observedAt: this.#clock().toISOString() });
  }

  async observeRequiredCheck(args: { checkRunId: number }): Promise<GitHubRequiredCheckObservation> {
    const raw = await this.#reader.readCheckRun(this.#repository, args.checkRunId);
    return parseGitHubRequiredCheckObservation({ raw, repository: this.#repository, observedAt: this.#clock().toISOString() });
  }

  async observePullRequest(pullRequestNumber: number): Promise<PullRequestObservation> {
    const [raw, linkedIssueNumbers] = await Promise.all([
      this.#reader.readPullRequest(this.#repository, pullRequestNumber),
      this.#reader.readLinkedIssueNumbers(this.#repository, pullRequestNumber),
    ]);
    return parseGitHubPullRequestObservation({ raw, repository: this.#repository, linkedIssueNumbers, observedAt: this.#clock().toISOString() });
  }
}
