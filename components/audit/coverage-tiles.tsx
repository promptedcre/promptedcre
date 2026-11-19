import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { Disclosure, Marks, TextLink, cx } from "@/components/ui";
import type { CoverageTile } from "./data";

// CoverageTiles: what audits cover, phase by phase of a firm's life, as ruled rows on
// plain ground. Each row leads with the phase and its state, drawn the way the whole site
// draws state: a solid chip for a written audit, a dashed one for an outlined audit (its
// planned checks one fold away) and for the phases with no audit yet. Every phase of a
// firm's life shows once. Every row comes from siteFacts (audits, notAudited, phases). Pure.

const ROW = "grid gap-x-8 gap-y-3 border-b border-line py-4 md:grid-cols-[11rem_minmax(0,1fr)_14rem]";

function Phase({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-col md:items-start">
      <span className="type-label text-text">{label}</span>
      {children}
    </p>
  );
}

export function CoverageTiles({ tiles, aside, className }: { tiles: CoverageTile[]; aside?: ReactNode; className?: string }) {
  const none = tiles.filter((t) => t.kind === "none");
  const unlisted = tiles.filter((t) => t.kind === "unlisted");
  return (
    <div className={cx("min-w-0", className)}>
      <ul className="m-0 list-none border-t border-line-strong p-0">
        {tiles.map((t) =>
          t.kind === "written" ? (
            <li key={t.phase + t.audit.slug} className={ROW}>
              <Phase label={t.phaseLabel}>
                <Tag>Written</Tag>
              </Phase>
              <div className="min-w-0">
                <h3 className="type-title-s m-0 text-text">{t.audit.title}</h3>
                <p className="type-body-s measure m-0 mt-1 text-muted">{t.audit.summary}</p>
              </div>
              <div className="min-w-0">
                <p className="type-body-s m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted">
                  <Marks marks={t.audit.marks} label={`${t.audit.checks} checks, written`} />
                  {t.audit.checks} checks
                </p>
                <p className="type-body-s m-0 mt-2">
                  <TextLink href={t.audit.href} tone="accent">
                    Open the audit playbook
                  </TextLink>
                </p>
              </div>
            </li>
          ) : t.kind === "outlined" ? (
            <li key={t.phase + t.slug} className={ROW}>
              <Phase label={t.phaseLabel}>
                <Tag dashed>Outlined</Tag>
              </Phase>
              <div className="min-w-0 md:col-span-2">
                <h3 className="type-title-s m-0 text-text">{t.title}</h3>
                <p className="type-body-s measure m-0 mt-1 text-muted">{t.summary}</p>
                <Disclosure size="sm" summary={`The ${t.planned.length} checks it will have`} summaryClassName="type-body-s text-muted" bodyClassName="pb-1">
                  <ol className="type-body-s measure m-0 grid list-decimal gap-1 pl-6 text-muted">
                    {t.planned.map((title, i) => (
                      <li key={i}>{title}</li>
                    ))}
                  </ol>
                </Disclosure>
              </div>
            </li>
          ) : null,
        )}
        {none.length > 0 && (
          <li className={ROW}>
            <Phase label={none.map((t) => t.phaseLabel).join(", ")}>
              <Tag dashed>Not covered yet</Tag>
            </Phase>
            <p className="type-body-s m-0 text-muted md:col-span-2">No audit yet. Every score lists these as not covered.</p>
          </li>
        )}
        {unlisted.length > 0 && (
          <li className={ROW}>
            <Phase label={unlisted.map((t) => t.phaseLabel).join(", ")}>
              <Tag dashed>No audit listed</Tag>
            </Phase>
            <p className="type-body-s m-0 text-muted md:col-span-2">The catalog lists no audit for these phases.</p>
          </li>
        )}
      </ul>
      {aside && <div className="mt-6">{aside}</div>}
    </div>
  );
}
