import { describe, expect, it } from 'vitest';
import {
  applyStartupRolloutFlagPatch,
  resolveStartupRolloutFlagsFromMetadata,
  resolveStartupWorkspaceRolloutFlags,
} from './startup-rollout-flags';

describe('startup rollout flags', () => {
  it('defaults to startup dashboard/github on and auto-pr off', () => {
    const flags = resolveStartupRolloutFlagsFromMetadata({});
    expect(flags).toEqual({
      startupDashboard: true,
      githubAgent: true,
      autoPr: false,
      slackAgent: false,
      slackAutoPost: false,
    });
  });

  it('respects workspace metadata rollout flags', () => {
    const flags = resolveStartupRolloutFlagsFromMetadata({
      metadata: {
        rollout_flags: {
          startup_dashboard: false,
          github_agent: true,
          auto_pr: true,
          slack_agent: true,
          slack_auto_post: false,
        },
      },
    });
    expect(flags).toEqual({
      startupDashboard: false,
      githubAgent: true,
      autoPr: true,
      slackAgent: true,
      slackAutoPost: false,
    });
  });

  it('applies env overrides over metadata', () => {
    const flags = resolveStartupRolloutFlagsFromMetadata({
      metadata: {
        rollout_flags: {
          startup_dashboard: true,
          github_agent: true,
          auto_pr: true,
        },
      },
      env: {
        STARTUP_DASHBOARD_ENABLED: 'false',
        STARTUP_GITHUB_AGENT_ENABLED: '0',
        STARTUP_AUTO_PR_ENABLED: 'false',
        STARTUP_SLACK_AGENT_ENABLED: 'true',
        STARTUP_SLACK_AUTO_POST_ENABLED: '1',
      },
    });
    expect(flags).toEqual({
      startupDashboard: false,
      githubAgent: false,
      autoPr: false,
      slackAgent: true,
      slackAutoPost: true,
    });
  });

  it('loads workspace metadata via supabase helper', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('startup_workspaces');
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: {
                metadata: {
                  rollout_flags: {
                    startup_dashboard: true,
                    github_agent: false,
                    auto_pr: false,
                    slack_agent: true,
                    slack_auto_post: false,
                  },
                },
              },
              error: null,
            });
          },
        };
      },
    } as any;

    await expect(
      resolveStartupWorkspaceRolloutFlags({
        supabase,
        startupWorkspaceId: 'ws-1',
      })
    ).resolves.toEqual({
      startupDashboard: true,
      githubAgent: false,
      autoPr: false,
      slackAgent: true,
      slackAutoPost: false,
    });
  });

  it('applies rollout patch while preserving other metadata keys', () => {
    const next = applyStartupRolloutFlagPatch({
      metadata: {
        source: 'admin_manual',
        rollout_flags: {
          startup_dashboard: true,
          github_agent: true,
          auto_pr: false,
          slack_agent: true,
          slack_auto_post: false,
        },
      },
      patch: {
        slackAutoPost: true,
      },
    });

    expect(next['source']).toBe('admin_manual');
    expect(next['rollout_flags']).toEqual({
      startup_dashboard: true,
      github_agent: true,
      auto_pr: false,
      slack_agent: true,
      slack_auto_post: true,
    });
  });
});
