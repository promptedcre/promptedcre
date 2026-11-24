import { Tag } from "@/components/chips";
import { ButtonLink, Logo, TextLink } from "@/components/ui";
import { ENTERPRISE, FREE_ACTION, PRO, freePlan, type FreeCounts, type Plan, type PlanItem } from "@/lib/plans";

// The three plans (decisions 120 to 127, made simpler by 134 to 138), as three cards in the
// order a firm grows: Free, which is live, then Pro and Enterprise, which are coming soon.
// Every word is lib/plans.ts's; every figure on the Free card is counted from the catalog. A
// card reads top to bottom: its name and state (a solid "Live" chip, or the dashed chip the
// site uses for "not yet"), its promise in one short line, then its list, one name to a line
// and nothing under it. Free's "Set up your agent" sits above its list and is the page's one
// filled control; the paid cards have no button and no form for now (decision 127): their
// chip says what there is to say.

// A line: its name, a link where it has a page (decision 138), with the company's own mark
// beside it when the name says the company (D218). The mark is decorative: the name says it.
// The mark and name are a block flex row: an inline-flex box sits on the line's baseline and
// made the lines with a mark a few pixels taller than the rest.
function ItemName({ item }: { item: PlanItem }) {
  const name = item.href ? (
    <TextLink href={item.href} tone="accent">
      {item.name}
    </TextLink>
  ) : (
    item.name
  );
  if (!item.logo) return <>{name}</>;
  return (
    <span className="flex items-center gap-2">
      <Logo id={item.logo.id} name={item.logo.name} size="sm" />
      {name}
    </span>
  );
}

// No drawn label over the list (decision 134): the chip says whether it is live or planned,
// and a screen reader hears the list's name.
function PlanList({ plan }: { plan: Plan }) {
  return (
    <ul id={`${plan.id}-list`} aria-label={plan.listTitle} className="pl-part pl-list m-0 list-none">
      {plan.items.map((item) => (
        <li key={item.name} className="type-body-s border-b border-line py-3 text-text first:pt-0 last:border-b-0 last:pb-0">
          <ItemName item={item} />
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ plan, action }: { plan: Plan; action?: { text: string; href: string } }) {
  return (
    <li className="pl-card" data-plan={plan.id}>
      <div className="pl-part pl-head">
        {/* a step smaller where three cards share 1024 px, so "Coming soon" fits beside "Enterprise" */}
        <h2 id={`plan-${plan.id}`} className="type-title-l lg:type-title-m xl:type-title-l m-0 text-text">
          {plan.name}
        </h2>
        {plan.live ? (
          <Tag tone="agent" dot>
            {plan.chip}
          </Tag>
        ) : (
          <Tag dashed>{plan.chip}</Tag>
        )}
      </div>
      <p className="pl-part pl-promise type-body m-0 text-text">{plan.promise}</p>
      <div className="min-w-0">
        {action && (
          <div className="pl-part pl-action">
            <ButtonLink href={action.href} className="w-full">
              {action.text}
            </ButtonLink>
          </div>
        )}
        <PlanList plan={plan} />
      </div>
    </li>
  );
}

export function PlanCards({ counts, className }: { counts: FreeCounts; className?: string }) {
  return (
    <div className={className}>
      <ul aria-label="The three plans" className="pl-cards">
        <PlanCard plan={freePlan(counts)} action={FREE_ACTION} />
        <PlanCard plan={PRO} />
        <PlanCard plan={ENTERPRISE} />
      </ul>
    </div>
  );
}
