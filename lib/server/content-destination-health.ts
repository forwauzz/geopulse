import type { PaymentApiEnv } from '@/lib/server/cf-env';
import type { ContentDestinationRow } from '@/lib/server/content-destination-admin-data';
import { hasContentDestinationAdapter } from '@/lib/server/content-destination-adapters';

export type ResolvedContentDestinationHealth = {
  readonly availabilityStatus: 'available' | 'not_configured' | 'plan_blocked' | 'api_unavailable' | 'disabled';
  readonly availabilityReason: string | null;
  readonly readyToPush: boolean;
};

export function evaluateContentDestinationHealth(
  destination: ContentDestinationRow,
  env: PaymentApiEnv
): ResolvedContentDestinationHealth {
  if (!destination.enabled) {
    return {
      availabilityStatus: 'disabled',
      availabilityReason:
        destination.availability_reason ?? 'Disabled manually from the content admin dashboard.',
      readyToPush: false,
    };
  }

  if (!destination.supports_api_publish) {
    return {
      availabilityStatus: 'api_unavailable',
      availabilityReason:
        destination.availability_reason ?? 'This destination does not support API publishing.',
      readyToPush: false,
    };
  }

  if (!hasContentDestinationAdapter(destination.provider_name)) {
    return {
      availabilityStatus: 'api_unavailable',
      availabilityReason: `No live adapter is implemented yet for ${destination.provider_name}.`,
      readyToPush: false,
    };
  }

  if (destination.availability_status === 'plan_blocked') {
    return {
      availabilityStatus: 'plan_blocked',
      availabilityReason: destination.availability_reason,
      readyToPush: false,
    };
  }

  if (destination.provider_name === 'kit') {
    if (!env.KIT_API_KEY) {
      return {
        availabilityStatus: 'not_configured',
        availabilityReason: 'KIT_API_KEY is missing, so draft pushes cannot be sent to Kit.',
        readyToPush: false,
      };
    }

    return {
      availabilityStatus: 'available',
      availabilityReason: 'Kit adapter is configured and ready for draft pushes.',
      readyToPush: true,
    };
  }

  if (destination.provider_name === 'buttondown') {
    if (!env.BUTTONDOWN_API_KEY) {
      return {
        availabilityStatus: 'not_configured',
        availabilityReason:
          'BUTTONDOWN_API_KEY is missing, so draft pushes cannot be sent to Buttondown.',
        readyToPush: false,
      };
    }

    return {
      availabilityStatus: 'available',
      availabilityReason: 'Buttondown adapter is configured and ready for draft pushes.',
      readyToPush: true,
    };
  }

  if (destination.provider_name === 'ghost') {
    if (!env.GHOST_ADMIN_API_URL) {
      return {
        availabilityStatus: 'not_configured',
        availabilityReason:
          'GHOST_ADMIN_API_URL is missing, so draft pushes cannot be sent to Ghost.',
        readyToPush: false,
      };
    }
    if (!env.GHOST_ADMIN_API_KEY) {
      return {
        availabilityStatus: 'not_configured',
        availabilityReason:
          'GHOST_ADMIN_API_KEY is missing, so draft pushes cannot be sent to Ghost.',
        readyToPush: false,
      };
    }

    return {
      availabilityStatus: 'available',
      availabilityReason: 'Ghost adapter is configured and ready for draft pushes.',
      readyToPush: true,
    };
  }

  return {
    availabilityStatus: 'api_unavailable',
    availabilityReason: destination.availability_reason,
    readyToPush: false,
  };
}
