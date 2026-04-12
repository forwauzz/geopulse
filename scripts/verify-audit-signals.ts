function parseArgs(argv: string[]): { baseUrl: string | null } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
    index += 1;
  }

  return {
    baseUrl: values.get('base-url') ?? null,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function hasToken(text: string, token: string): boolean {
  return text.toLowerCase().includes(token.toLowerCase());
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string; headers: Headers }> {
  const response = await fetch(url, { redirect: 'follow' });
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
    headers: response.headers,
  };
}

function printCheck(name: string, ok: boolean, detail: string): void {
  const prefix = ok ? '[pass]' : '[fail]';
  console.log(`${prefix} ${name}: ${detail}`);
}

function findLineContaining(text: string, token: string): string | null {
  return text.split(/\r?\n/).find((line) => hasToken(line, token)) ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(
    args.baseUrl ?? process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com'
  );

  const [home, robots, llms] = await Promise.all([
    fetchText(baseUrl),
    fetchText(`${baseUrl}/robots.txt`),
    fetchText(`${baseUrl}/llms.txt`),
  ]);

  const homepageRobotsMatch = home.text.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
  const homepageRobots = homepageRobotsMatch?.[1]?.trim() ?? null;
  const homepageCanonicalMatch = home.text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const homepageCanonical = homepageCanonicalMatch?.[1]?.trim() ?? null;

  const headersToCheck = [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
  ] as const;

  console.log(`base_url: ${baseUrl}`);
  printCheck('homepage', home.ok, `status ${home.status}`);
  printCheck('robots.txt', robots.ok, `status ${robots.status}`);
  printCheck('llms.txt', llms.ok, `status ${llms.status}`);

  for (const header of headersToCheck) {
    const value = home.headers.get(header);
    printCheck(`header:${header}`, Boolean(value), value ?? 'missing');
  }

  printCheck('homepage canonical', Boolean(homepageCanonical), homepageCanonical ?? 'missing');
  printCheck(
    'homepage robots meta',
    !homepageRobots || (!hasToken(homepageRobots, 'noindex') && !hasToken(homepageRobots, 'nofollow')),
    homepageRobots ?? 'missing'
  );

  const robotBotChecks = [
    'ClaudeBot',
    'Google-Extended',
    'GPTBot',
  ] as const;

  const robotBotFailures = robotBotChecks.map((bot) => {
    const botLine = findLineContaining(robots.text, bot);
    const blocked = botLine ? hasToken(botLine, 'disallow') : false;
    printCheck(`robots allow:${bot}`, !blocked, botLine ?? 'not referenced');
    return blocked ? 1 : 0;
  });

  const hasLlmsContent = llms.ok && llms.text.trim().length > 0;
  const hasContentDate = hasToken(home.text, 'dateModified') || hasToken(home.text, 'datePublished');

  printCheck('llms content', hasLlmsContent, `${llms.text.trim().length} bytes`);
  printCheck('homepage content date', hasContentDate, 'content date signal');

  const failures = [
    !home.ok,
    !robots.ok,
    !llms.ok,
    ...headersToCheck.map((header) => !home.headers.get(header)),
    !homepageCanonical,
    Boolean(homepageRobots && (hasToken(homepageRobots, 'noindex') || hasToken(homepageRobots, 'nofollow'))),
    ...robotBotFailures.map((value) => value === 1),
    !hasLlmsContent,
    !hasContentDate,
  ].filter(Boolean).length;

  if (failures > 0) {
    console.error(`audit signal verification failed with ${failures} issue(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
