export const MSP_EXAMPLE = {
  domain: 'northstar-it.example',
  score: 62,
  grade: 'D',
  categories: [
    { label: 'Technical access', score: 84 },
    { label: 'Service clarity', score: 58 },
    { label: 'Trust evidence', score: 55 },
    { label: 'Structured data', score: 49 },
  ],
  findings: [
    {
      status: 'pass',
      label: 'Public pages are accessible',
      observation:
        'The example site allows supported search and AI retrieval agents to access its public service pages.',
      nextStep:
        'Keep access rules explicit and recheck after hosting, firewall, or robots.txt changes.',
    },
    {
      status: 'needs_work',
      label: 'Service-area evidence is ambiguous',
      observation:
        'The example pages mention several cities, but do not consistently connect each location to the services delivered there.',
      nextStep:
        'Add concise service-area statements to the relevant managed IT, cybersecurity, and support pages.',
    },
    {
      status: 'needs_work',
      label: 'Business identity is incomplete in structured data',
      observation:
        'The example Organization markup identifies the company but omits useful relationships such as service area and verified profile links.',
      nextStep:
        'Complete and validate the business entity markup using only public, accurate company information.',
    },
  ],
} as const;
