import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SCORING_EXPLAINER, type RankedOpportunity } from "@/lib/opportunities";

const TIP_CLASS = "max-w-xs border bg-popover text-popover-foreground shadow-md";
const FOCUS_CLASS =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The "Best fits for you" heading, an info icon with the short scoring tip, and the fuller description. */
export function OpportunitiesHeading() {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative">
        <div className="flex min-h-6 items-center gap-1.5 pr-40">
          <h2 className="font-semibold">Best fits for you</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="How is this scored?"
                className={`-m-1 inline-flex p-1 text-muted-foreground hover:text-foreground ${FOCUS_CLASS}`}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className={TIP_CLASS}>{SCORING_EXPLAINER.short}</TooltipContent>
          </Tooltip>
        </div>
        <details>
          <summary
            className={`absolute right-0 top-0 flex h-6 cursor-pointer list-none items-center text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden ${FOCUS_CLASS}`}
          >
            How is this scored?
          </summary>
          <div
            data-testid="scoring-explainer"
            className="mt-2 space-y-1.5 border-l pl-3 text-xs text-muted-foreground"
          >
            <p>{SCORING_EXPLAINER.intro}</p>
            <ul className="space-y-1">
              {SCORING_EXPLAINER.factors.map((f) => (
                <li key={f.label}>
                  <span className="font-medium text-foreground">
                    {f.label} (up to {f.points}):
                  </span>{" "}
                  {f.text}
                </li>
              ))}
              <li>
                <span className="font-medium text-foreground">
                  {SCORING_EXPLAINER.reductions.label}:
                </span>{" "}
                {SCORING_EXPLAINER.reductions.text}
              </li>
            </ul>
          </div>
        </details>
      </div>
    </TooltipProvider>
  );
}

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
