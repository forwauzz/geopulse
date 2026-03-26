import type { AuditCheck, CheckContext, CheckResult } from '../../lib/interfaces/audit';

export const altTextCheck: AuditCheck = {
  id: 'alt-text',
  name: 'Image alt text coverage',
  weight: 3,
  category: 'extractability',
  run(ctx: CheckContext): CheckResult {
    const { totalImages, imagesWithoutAlt } = ctx.signals;

    if (totalImages === 0) {
      return {
        id: 'alt-text',
        passed: true,
        status: 'PASS',
        finding: 'No images detected in the sampled HTML.',
      };
    }

    const coverage = ((totalImages - imagesWithoutAlt) / totalImages) * 100;
    const passed = imagesWithoutAlt === 0;

    if (passed) {
      return {
        id: 'alt-text',
        passed: true,
        status: 'PASS',
        finding: `All ${String(totalImages)} images have alt text — AI models can interpret image context.`,
      };
    }

    return {
      id: 'alt-text',
      passed: false,
      status: coverage >= 50 ? 'WARNING' : 'FAIL',
      finding: `${String(imagesWithoutAlt)} of ${String(totalImages)} images are missing alt text (${String(Math.round(coverage))}% coverage).`,
      fix: 'Add descriptive alt attributes to all meaningful images so AI models and screen readers can interpret them.',
    };
  },
};
