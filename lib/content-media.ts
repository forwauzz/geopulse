export type EmbeddedVideo =
  | {
      readonly kind: 'iframe';
      readonly provider: 'youtube' | 'vimeo';
      readonly embedUrl: string;
    }
  | {
      readonly kind: 'file';
      readonly provider: 'direct';
      readonly embedUrl: string;
    };

type MarkdownNode = {
  readonly type?: string;
  readonly url?: string;
  readonly children?: MarkdownNode[];
  readonly value?: string;
};

function normalizeUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function readYouTubeVideoId(url: URL): string | null {
  const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();

  if (hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id?.trim() || null;
  }

  if (hostname !== 'youtube.com' && hostname !== 'm.youtube.com') {
    return null;
  }

  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v');
    return id?.trim() || null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'embed' || segments[0] === 'shorts') {
    return segments[1]?.trim() || null;
  }

  return null;
}

function readVimeoVideoId(url: URL): string | null {
  const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (hostname !== 'vimeo.com' && hostname !== 'player.vimeo.com') {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const candidate = segments[segments.length - 1];
  return candidate && /^\d+$/.test(candidate) ? candidate : null;
}

function isDirectVideoUrl(url: URL): boolean {
  return /\.(mp4|webm|ogg)$/i.test(url.pathname);
}

export function getEmbeddedVideo(href: string): EmbeddedVideo | null {
  const url = normalizeUrl(href);
  if (!url) return null;

  const youtubeId = readYouTubeVideoId(url);
  if (youtubeId) {
    return {
      kind: 'iframe',
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
    };
  }

  const vimeoId = readVimeoVideoId(url);
  if (vimeoId) {
    return {
      kind: 'iframe',
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
    };
  }

  if (isDirectVideoUrl(url)) {
    return {
      kind: 'file',
      provider: 'direct',
      embedUrl: href,
    };
  }

  return null;
}

function extractNodeText(node: MarkdownNode): string {
  if (typeof node.value === 'string') return node.value;
  if (!Array.isArray(node.children)) return '';
  return node.children.map(extractNodeText).join('');
}

export function getStandaloneLink(node: MarkdownNode | undefined): { href: string; text: string } | null {
  if (!node || !Array.isArray(node.children) || node.children.length !== 1) {
    return null;
  }

  const [child] = node.children;
  if (!child || child.type !== 'link' || typeof child.url !== 'string') {
    return null;
  }

  return {
    href: child.url,
    text: extractNodeText(child).trim(),
  };
}
