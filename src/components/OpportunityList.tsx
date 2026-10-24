import { useEffect, useState } from "react";
import { Info, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SCORING_EXPLAINER, type RankedOpportunity } from "@/lib/opportunities";

const TIP_CLASS = "max-w-xs border bg-popover text-popover-foreground shadow-md";
const FOCUS_CLASS =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The "Best fits for you" heading, an info icon with the short scoring tip, and the fuller description. */
export function OpportunitiesHeading({
  onFindMore,
  finding = false,
  message,
}: {
  /** When set, a small "Find more" button shows in the heading row. */
  onFindMore?: () => void;
  finding?: boolean;
  /** A short result line shown under the heading row. */
  message?: string | null;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Collapsible>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold">Best fits for you</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="What the score means"
                  className={`-m-1 inline-flex p-1 text-muted-foreground hover:text-foreground ${FOCUS_CLASS}`}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent className={TIP_CLASS}>{SCORING_EXPLAINER.short}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3">
            {onFindMore && (
              <button
                type="button"
                onClick={() => {
                  if (!finding) onFindMore();
                }}
                aria-disabled={finding}
                className={`inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:text-muted-foreground ${FOCUS_CLASS}`}
              >
                <Search className="size-3" aria-hidden="true" />
                {finding ? "Finding…" : "Find more"}
              </button>
            )}
            <CollapsibleTrigger
              className={`text-xs text-muted-foreground hover:text-foreground ${FOCUS_CLASS}`}
            >
              How is this scored?
            </CollapsibleTrigger>
          </div>
        </div>
        <div role="status" aria-live="polite">
          {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
        </div>
        <CollapsibleContent
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
        </CollapsibleContent>
      </Collapsible>
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
  expandSignal = 0,
}: {
  items: RankedOpportunity[];
  visible?: number;
  /** Opens the "See N more" expander each time this number changes to a new value above 0. */
  expandSignal?: number;
}) {
  const rest = items.slice(visible);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (expandSignal > 0) setOpen(true);
  }, [expandSignal]);
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.slice(0, visible).map((item) => (
          <OpportunityCard key={item.url} item={item} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details
          className="group"
          open={open}
          onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
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
