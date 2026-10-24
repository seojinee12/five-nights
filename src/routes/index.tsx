import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Rocket, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LaunchPad — Your first-year engineering mentor" },
      { name: "description", content: "Adaptive scheduling, research labs and beginner project teams for new engineering students." },
      { property: "og:title", content: "LaunchPad — Your first-year engineering mentor" },
      { property: "og:description", content: "Adaptive scheduling, research labs and beginner project teams for new engineers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const FOCUS = [
  { id: "academic", label: "Academics" },
  { id: "career", label: "Career & research" },
  { id: "project", label: "Projects" },
  { id: "fun", label: "Personal life" },
];

function Landing() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [major, setMajor] = useState("Electrical Engineering");
  const [focus, setFocus] = useState<string[]>(["academic", "career"]);

  const start = () => {
    localStorage.setItem("lp-profile", JSON.stringify({ name: name || "Engineer", major, focus }));
    nav({ to: "/app", search: { u: "me" } });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent">
          <Rocket className="h-4 w-4" /> LaunchPad
        </div>
        <h1 className="mt-4 text-5xl font-bold leading-[1.05] tracking-tight">
          Your first year,<br />engineered.
        </h1>
        <p className="mt-4 text-muted-foreground">
          A planner and mentor that fits classes, career, projects and life into one week — and adjusts when life changes.
        </p>

        <div className="mt-10 space-y-5 rounded-xl border bg-card p-6">
          <label className="block">
            <span className="text-sm font-medium">What should we call you?</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">School</span>
              <select className="mt-1 w-full rounded-md border bg-background px-3 py-2"><option>UC San Diego</option></select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Major</span>
              <select value={major} onChange={(e) => setMajor(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2">
                <option>Electrical Engineering</option><option>Computer Engineering</option>
                <option>Mechanical Engineering</option><option>Bioengineering</option>
              </select>
            </label>
          </div>
          <div>
            <span className="text-sm font-medium">What do you want to pay attention to?</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOCUS.map((f) => {
                const on = focus.includes(f.id);
                return (
                  <button key={f.id} onClick={() => setFocus(on ? focus.filter((x) => x !== f.id) : [...focus, f.id])}
                    className={`rounded-full border px-3 py-1 text-sm transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={start} className="w-full rounded-md bg-accent py-2.5 font-semibold text-accent-foreground hover:opacity-90">
            Create my plan
          </button>
        </div>
      </div>

      <Link to="/app" search={{ u: "seojin" }}
        className="fixed bottom-5 left-5 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90">
        <GraduationCap className="h-4 w-4" /> Try the demo student
      </Link>
    </main>
  );
}
