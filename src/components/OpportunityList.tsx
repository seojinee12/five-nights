import type { RankedOpportunity } from "@/lib/opportunities";

function OpportunityCard({ item }: { item: RankedOpportunity }) {
  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.typeLabel}</div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold hover:underline"
        >
          {item.name}
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{item.score}/100</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{item.why}</p>
    </li>
  );
}

/** The top three opportunities, with the rest behind a "See N more" expander. */
export function OpportunityList({
  items,
  visible = 3,
}: {
  items: RankedOpportunity[];
  visible?: number;
}) {
  const rest = items.slice(visible);
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.slice(0, visible).map((item) => (
          <OpportunityCard key={item.url} item={item} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            See {rest.length} more
          </summary>
          <ul className="mt-3 space-y-3">
            {rest.map((item) => (
              <OpportunityCard key={item.url} item={item} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
