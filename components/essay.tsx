import { formatDate } from "@/lib/content/dates";
import type { Essay } from "@/lib/content/essays";
import { renderMdx } from "@/lib/content/mdx";
import { mentionsSuicide } from "@/lib/crisis";
import { publicationName } from "@/lib/words";
import { Corrections } from "./Corrections";
import { CrisisSupport } from "./CrisisSupport";
import { ExternalLink } from "./ExternalLink";

/**
 * An essay in the PRD §06 order. A title or subtitle that mentions suicide
 * carries the crisis block right under the header; the body places its own
 * block (the loader requires it).
 */
export function EssayArticle({ essay }: { essay: Essay }) {
  return (
    <article className="wrap essay">
      <Corrections corrections={essay.corrections} />
      <header>
        <h1>{essay.title}</h1>
        {essay.subtitle ? <p className="standfirst">{essay.subtitle}</p> : null}
        <p className="byline">{essay.author}</p>
        <p className="label">
          Published here <time dateTime={essay.publishAt}>{formatDate(essay.publishAt)}</time>
        </p>
        {essay.firstPublishedUrl && essay.firstPublishedAt ? (
          <p className="label">
            First published in <cite>{publicationName(essay.publication)}</cite>,{" "}
            <time dateTime={essay.firstPublishedAt}>{formatDate(essay.firstPublishedAt)}</time>:{" "}
            <ExternalLink href={essay.firstPublishedUrl}>read it there</ExternalLink>
          </p>
        ) : null}
      </header>
      {mentionsSuicide(essay.title, essay.subtitle) ? <CrisisSupport /> : null}
      {essay.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- a reviewed local asset
        <img className="essay-cover" src={`/words/${essay.slug}/${essay.cover.src}`} alt={essay.cover.alt} />
      ) : null}
      <div className="prose">{renderMdx(essay.tree)}</div>
      <footer className="essay-footer">
        {essay.cover ? <p className="label">Cover: {essay.cover.credit}</p> : null}
        {essay.pdf ? (
          <p>
            <a href={`/words/${essay.slug}/${essay.pdf.src}`}>{essay.pdf.label ?? "Download the PDF"}</a>
          </p>
        ) : null}
      </footer>
    </article>
  );
}
