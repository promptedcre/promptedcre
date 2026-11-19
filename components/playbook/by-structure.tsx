import type { ReactNode } from "react";
import type { StructureGroup } from "@/lib/compute/playbook-facts";

// ByStructure: a value that may change with the structure switch. Drawn once when
// every structure agrees; otherwise once per group, each marked data-s with the
// structures it is for, so the page root's switch shows one. `as` picks the wrapper
// for block content (a span cannot hold a list).
export function ByStructure<T>({
  groups,
  render,
  as: Tag = "span",
}: {
  groups: StructureGroup<T>[];
  render: (value: T) => ReactNode;
  as?: "span" | "div";
}) {
  const only = groups.length === 1 ? groups[0] : undefined;
  if (only) return <>{render(only.value)}</>;
  return (
    <>
      {groups.map((g) => (
        <Tag key={g.structures.join(" ")} data-s={g.structures.join(" ")}>
          {render(g.value)}
        </Tag>
      ))}
    </>
  );
}
