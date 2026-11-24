import { Tag } from "@/components/chips";
import { ButtonLink, Logo, TextLink } from "@/components/ui";
import { ENTERPRISE, FREE_ACTION, PRO, freePlan, type FreeCounts, type Plan, type PlanItem } from "@/lib/plans";

// The three plans (decisions 120 to 127), as three cards in the order a firm grows: Free, which
// is live, then Pro and Enterprise, which are coming soon. Every word is lib/plans.ts's; every
// figure on the Free card is counted from the catalog. A card reads top to bottom: its name and
// state (a solid "Live" chip, or the dashed chip the site uses for "not yet"), who it is for,
// what it promises in one sentence, then its list. Free's "Set up your agent" sits above its
// list and is the page's one filled control; the paid cards have no button and no form for now
// (decision 127): their chip says what there is to say.

// A line's name, with the company's own mark beside it (D218): in the name when the name says
// it ("The MCP connector"), beside the name with its word when it does not ("GitHub").
function ItemName({ item }: { item: PlanItem }) {
  if (!item.logo) return <>{item.name}</>;
  const mark = <Logo id={item.logo.id} name={item.logo.name} size="sm" />;
  if (item.logo.inTitle)
    return (
      <span className="inline-flex items-center gap-2">
        {mark}
        {item.name}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span>{item.name}</span>
      <span className="inline-flex items-center gap-2 text-muted">
        {mark}
        {item.logo.name}
      </span>
    </span>
  );
}

function PlanList({ plan }: { plan: Plan }) {
  const titleId = `${plan.id}-list`;
  return (
    <div className="pl-part pl-list">
      <h3 id={titleId} className="type-label m-0 text-faint">
        {plan.listTitle}
      </h3>
      <dl aria-labelledby={titleId} className="m-0 mt-1">
        {plan.items.map((item) => (
          <div key={item.name} className="border-b border-line py-3 last:border-b-0 last:pb-0">
            <dt className="type-label text-text">
              <ItemName item={item} />
            </dt>
            <dd className="type-body-s m-0 mt-1 text-muted">
              {item.text}
              {item.link && (
                <>
                  {" "}
                  <TextLink href={item.link.href} tone="accent">
                    {item.link.text}
                  </TextLink>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
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
      <p className="pl-part pl-who type-body-s m-0 text-muted">{plan.who}</p>
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
