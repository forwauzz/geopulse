export const MONTHLY_MONITORING_OFFER = {
  plan: 'monthly' as const,
  priceDollars: 39,
  valueProps: [
    { icon: 'autorenew', text: 'A fresh audit and private report every month' },
    { icon: 'trending_up', text: 'See what improved, declined, or changed' },
    { icon: 'task_alt', text: 'Know the highest-priority action to take next' },
    { icon: 'mail', text: 'Delivered automatically—nothing to manage' },
  ],
} as const;
