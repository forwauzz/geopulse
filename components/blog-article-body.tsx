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

export function BlogArticleBody({ markdown }: { markdown: string }) {
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    h1: ({ children }) => {
      const text = extractText(children);
      return <h1 id={slugify(text)}>{children}</h1>;
    },
    h2: ({ children }) => {
      const text = extractText(children);
      return <h2 id={slugify(text)}>{children}</h2>;
    },
    h3: ({ children }) => {
      const text = extractText(children);
      return <h3 id={slugify(text)}>{children}</h3>;
    },
    img: ({ src, alt, title }) => {
      if (!src) return null;
      return (
        <figure className="my-8">
          <img
            src={src}
            alt={alt ?? ''}
            title={title ?? undefined}
            loading="lazy"
            className="w-full rounded-2xl border border-white/15"
          />
          {title ? (
            <figcaption className="mt-3 text-sm leading-relaxed text-zinc-300">
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
            <figcaption className="mt-3 text-sm leading-relaxed text-zinc-300">
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
          <figcaption className="mt-3 text-sm leading-relaxed text-zinc-300">
            {label}
          </figcaption>
        </figure>
      );
    },
  };

  return (
    <div className="prose prose-invert max-w-none prose-headings:font-headline prose-headings:text-white prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-white prose-a:text-sky-300 prose-code:text-white prose-pre:bg-zinc-900 prose-pre:text-white prose-figcaption:text-zinc-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}


