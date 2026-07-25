export const TEAM_AVATARS = {
  'Maya Brooks': '/team/maya-brooks.webp',
  Maya: '/team/maya-brooks.webp',
  'Noah Carter': '/team/noah-carter.webp',
  Noah: '/team/noah-carter.webp',
  'Priya Shah': '/team/priya-shah.webp',
  Priya: '/team/priya-shah.webp',
  'Elena Park': '/team/elena-park.webp',
  Elena: '/team/elena-park.webp',
  'Sofia Chen': '/team/sofia-chen.webp',
  Sofia: '/team/sofia-chen.webp',
  'Jordan Reyes': '/team/jordan-reyes.webp',
  Jordan: '/team/jordan-reyes.webp',
  'Marcus Reed': '/team/marcus-reed.webp',
  Marcus: '/team/marcus-reed.webp',
} as const;

export function teamAvatar(owner: string): string | null {
  return TEAM_AVATARS[owner as keyof typeof TEAM_AVATARS] ?? null;
}
