import { describe, expect, it } from 'vitest';
import { getEmbeddedVideo, getStandaloneLink } from './content-media';

describe('content media helpers', () => {
  it('builds a YouTube embed url from a watch link', () => {
    expect(getEmbeddedVideo('https://www.youtube.com/watch?v=Q8wVMdwhlh4')).toEqual({
      kind: 'iframe',
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/Q8wVMdwhlh4',
    });
  });

  it('builds a Vimeo embed url', () => {
    expect(getEmbeddedVideo('https://vimeo.com/123456789')).toEqual({
      kind: 'iframe',
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/123456789',
    });
  });

  it('treats direct video files as embeddable media', () => {
    expect(getEmbeddedVideo('https://cdn.example.com/demo.mp4')).toEqual({
      kind: 'file',
      provider: 'direct',
      embedUrl: 'https://cdn.example.com/demo.mp4',
    });
  });

  it('extracts a standalone markdown link from a paragraph node', () => {
    expect(
      getStandaloneLink({
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://www.youtube.com/watch?v=Q8wVMdwhlh4',
            children: [{ type: 'text', value: 'Watch the episode' }],
          },
        ],
      })
    ).toEqual({
      href: 'https://www.youtube.com/watch?v=Q8wVMdwhlh4',
      text: 'Watch the episode',
    });
  });

  it('ignores paragraphs with mixed content', () => {
    expect(
      getStandaloneLink({
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Watch ' },
          {
            type: 'link',
            url: 'https://www.youtube.com/watch?v=Q8wVMdwhlh4',
            children: [{ type: 'text', value: 'this' }],
          },
        ],
      })
    ).toBeNull();
  });
});
