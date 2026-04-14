import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getEmbeddedVideo, getStandaloneLink } from '@/lib/content-media';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

function renderHeading(level: 1 | 2 | 3 | 4 | 5 | 6, children: React.ReactNode) {
  const text = extractText(children);
  const id = slugify(text);

  if (level === 1) return <h2 id={id}>{children}</h2>;
  if (level === 2) return <h3 id={id}>{children}</h3>;
  if (level === 3) return <h4 id={id}>{children}</h4>;
  if (level === 4) return <h5 id={id}>{children}</h5>;
  return <h6 id={id}>{children}</h6>;
}

export function BlogArticleBody({ markdown }: { markdown: string }) {
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    h1: ({ children }) => renderHeading(1, children),
    h2: ({ children }) => renderHeading(2, children),
    h3: ({ children }) => renderHeading(3, children),
    h4: ({ children }) => renderHeading(4, children),
    h5: ({ children }) => renderHeading(5, children),
    h6: ({ children }) => renderHeading(6, children),
    img: ({ src, alt, title }) => {
      if (!src) return null;
      return (
        <figure className="my-8">
          <img
            src={src}
            alt={alt ?? ''}
            title={title ?? undefined}
            loading="lazy"
            className="w-full rounded-2xl border border-outline-variant/40"
          />
          {title ? (
            <figcaption className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              {title}
            </figcaption>
          ) : null}
        </figure>
      );
    },
    p: ({ node, children }) => {
      const standaloneLink = getStandaloneLink(node as any);
      const embeddedVideo = standaloneLink ? getEmbeddedVideo(standaloneLink.href) : null;

      if (!embeddedVideo || !standaloneLink) {
        return <p>{children}</p>;
      }

      const label = standaloneLink.text || standaloneLink.href;

      if (embeddedVideo.kind === 'file') {
        return (
          <figure className="my-8">
            <video
              controls
              preload="metadata"
              className="w-full rounded-2xl border border-white/15 bg-black"
            >
              <source src={embeddedVideo.embedUrl} />
            </video>
            <figcaption className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              {label}
            </figcaption>
          </figure>
        );
      }

      return (
        <figure className="my-8">
          <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black pb-[56.25%]">
            <iframe
              src={embeddedVideo.embedUrl}
              title={label}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <figcaption className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            {label}
          </figcaption>
        </figure>
      );
    },
  };

  return (
    <div className="prose max-w-none prose-headings:font-headline prose-headings:text-on-background prose-p:text-on-surface prose-li:text-on-surface prose-strong:text-on-background prose-a:text-primary prose-code:bg-surface-container prose-code:text-on-background prose-pre:bg-surface-container-high prose-pre:text-on-background prose-figcaption:text-on-surface-variant">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
