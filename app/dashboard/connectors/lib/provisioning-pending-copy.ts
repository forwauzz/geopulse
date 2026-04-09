export type ProvisioningPendingCopy = {
  readonly title: string;
  readonly body: string;
  readonly ctaLabel: string;
  readonly ctaHref: string;
};

export function buildProvisioningPendingCopy(bundleKey: string): ProvisioningPendingCopy {
  const isAgency = bundleKey === 'agency_core' || bundleKey === 'agency_pro';
  return {
    title: 'Your workspace is being prepared',
    body: `Your ${isAgency ? 'agency account' : 'startup workspace'} is still being created from your subscription. Refresh in a moment and the connectors will appear once provisioning finishes.`,
    ctaLabel: 'Go to dashboard',
    ctaHref: '/dashboard',
  };
}
