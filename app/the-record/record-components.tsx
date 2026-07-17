import fs from "node:fs/promises";
import Image from "next/image";
import { imageSize } from "image-size";
import type { MDXComponents } from "mdx/types";
import { resolveRecordAssetPath } from "../../lib/record";

// Markdown images: ![Alt text](/record/<slug>/file.jpg "Optional caption").
// Rendered through next/image; intrinsic dimensions are read from the file at
// build time so authors never type width/height. Span-based so it stays valid
// inside the paragraph MDX wraps images in.
async function RecordImage({ src, alt, title, slug }: { src?: string; alt?: string; title?: string; slug: string }) {
  if (!src) throw new Error("Record image is missing a src.");
  if (!alt?.trim()) {
    throw new Error(`Record image ${src} is missing alt text. Write it as ![what the image shows](${src}).`);
  }
  const file = resolveRecordAssetPath(slug, src);
  const buffer = await fs.readFile(file);
  const { width, height } = imageSize(buffer);
  return (
    <span className="record-figure">
      <Image src={src} alt={alt} width={width} height={height} sizes="(max-width: 860px) 100vw, 790px" />
      {title ? <span className="record-figcaption">{title}</span> : null}
    </span>
  );
}

// Responsive 16:9 embed via privacy-enhanced endpoints. Lazy-loaded, never autoplays.
export function Video({ id, provider, title }: { id: string; provider: "youtube" | "vimeo"; title: string }) {
  if (!id || !/^[\w-]+$/.test(id)) throw new Error(`<Video> id ${JSON.stringify(id)} is not a valid video id.`);
  if (!title?.trim()) throw new Error(`<Video id="${id}"> requires a title (used by screen readers).`);
  let src: string;
  if (provider === "youtube") src = `https://www.youtube-nocookie.com/embed/${id}`;
  else if (provider === "vimeo") src = `https://player.vimeo.com/video/${id}?dnt=1`;
  else throw new Error(`<Video> provider must be "youtube" or "vimeo", got ${JSON.stringify(provider)}.`);
  return (
    <div className="record-video">
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

// Native <video> for short repo-hosted clips only. Controls on, never autoplays.
export function Clip({ src, slug }: { src: string; slug: string }) {
  resolveRecordAssetPath(slug, src);
  return <video className="record-clip" src={src} controls preload="metadata" playsInline />;
}

export function createRecordComponents(slug: string): MDXComponents {
  return {
    img: ((props) => <RecordImage {...props} slug={slug} />) as MDXComponents["img"],
    Video,
    Clip: ({ src }: { src: string }) => <Clip src={src} slug={slug} />
  };
}
