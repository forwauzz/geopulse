import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-headline prose-headings:text-on-background prose-p:text-on-surface-variant prose-li:text-on-surface-variant prose-strong:text-on-background prose-a:text-primary prose-code:text-on-background prose-pre:bg-surface-container-low prose-pre:text-on-background">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

