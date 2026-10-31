export function auditCampaignUnavailableResponse(): Response {
  return Response.json(
    {
      error: {
        code: 'service_unavailable',
        message: 'This audit is temporarily unavailable. Please try again shortly.',
      },
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '300',
      },
    },
  );
}
