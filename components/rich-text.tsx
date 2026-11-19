import { paragraphs, parseInline } from "@/lib/text";

// RichText: an instruction's own light markup (lib/text.ts) as paragraphs: `code` in the
// mono face on an inset well, **strong** in the text ink, and a link in the site's one
// link style. The caller sets the type role and the ink on the wrapper (`className`).
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs(text).map((p, i) => (
        <p key={i}>
          {parseInline(p).map((part, j) => {
            switch (part.t) {
              case "code":
                return (
                  <code key={j} className="type-code rounded-[2px] bg-inset px-1 text-text">
                    {part.v}
                  </code>
                );
              case "strong":
                return (
                  <strong key={j} className="font-semibold text-text">
                    {part.v}
                  </strong>
                );
              case "link":
                return (
                  <a key={j} href={part.href} className="link" rel="noreferrer">
                    {part.v}
                  </a>
                );
              default:
                return <span key={j}>{part.v}</span>;
            }
          })}
        </p>
      ))}
    </div>
  );
}
