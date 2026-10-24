import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Rocket, Upload, CalendarPlus, Send, AlertTriangle, ExternalLink, Check, Paperclip, Plus, Pin, MoreHorizontal, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  STUDENTS, SEOJIN, sortTasks, findGaps, fmt, timeUse, DAY_START, DAY_END, RESEARCH, PROJECTS,
  type Student, type Category, type Task, type Course, type Reminder,
} from "@/lib/launchpad";
import { importCalendarFile } from "@/lib/calendar-import";
import { applyPatch, type Patch } from "@/lib/patch";
import { classifyPatch, describeSmallPatch } from "@/lib/patchSize";
import { mentorChat, readMaterial, sourceOpportunities } from "@/lib/mentor.functions";
import { rankSourced, profileFromStudent } from "@/lib/opportunities";
import { OpportunitiesHeading, OpportunityList } from "@/components/OpportunityList";

export const Route = createFileRoute("/app")({
  validateSearch: (s: Record<string, unknown>) => ({ u: (s['u'] as string) || "seojin" }),
  head: () => ({
    meta: [
      { title: "My week — LaunchPad" },
      { name: "description", content: "Your weekly schedule, priorities, free time and opportunities." },
      { property: "og:title", content: "My week — LaunchPad" },
      { property: "og:description", content: "Weekly schedule, free time, labs and project teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppPage,
});

const TABS = ["Scheduler", "Working on", "Academics", "Opportunities", "Long-term"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAT_LABEL: Record<Category, string> = { academic: "Academic", career: "Career", project: "Project", fun: "Personal" };

function AppPage() {
  const { u } = Route.useSearch();
  const [custom, setCustom] = useState<Student | null>(null);
  useEffect(() => {
    if (u !== "me") return;
    const p = JSON.parse(localStorage.getItem("lp-profile") || "{}");
    setCustom({ ...SEOJIN, id: "me", name: p.name || "Engineer", major: p.major || "Engineering",
      focus: [...(p.focus || []), ...SEOJIN.focus.filter((f) => !(p.focus || []).includes(f))],
      events: SEOJIN.events.filter((e) => e.kind === "class"), tasks: [], weeklyTargets: [], longTerm: [], statusNote: "Fresh start." });
  }, [u]);
  const base = u === "me" ? custom : STUDENTS.find((s) => s.id === u) ?? SEOJIN;
  const [student, setStudent] = useState<Student | null>(() => (base ? structuredClone(base) : null));
  const [note, setNote] = useState<{ id: number; text: string; patch: Patch | null } | null>(null);
  const studentRef = useRef<Student | null>(null);
  studentRef.current = student;
  const undoLog = useRef(new Map<number, { prev: Student; next: Student }>());
  const undoSeq = useRef(0);
  const calRef = useRef<HTMLInputElement>(null);
  const sylRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!base) return;
    setStudent(structuredClone(base));
    setNote(null);
  }, [base]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Scheduler");
  if (!student) return null;

  const tell = (text: string, patch: Patch | null) => setNote({ id: Date.now(), text, patch });
  const onCalendarFile = async (file: File) => {
    const events = await importCalendarFile(file);
    const lines = events.slice(0, 8).map((event) => `${DAYS[event.day]} ${fmt(event.start)}–${fmt(event.end)} ${event.title}`);
    tell(
      events.length
        ? `I found ${events.length} time${events.length === 1 ? "" : "s"} in ${file.name} for this week.\n${lines.join("\n")}${events.length > 8 ? "\n…" : ""}\n\nSay yes to add them, or no to leave the week as it is.`
        : `I didn't find any timed events for this week in ${file.name}. Nothing was added.`,
      events.length ? { addEvents: events } : null,
    );
  };
  const onSyllabusFile = async (file: File) => {
    const isText = /text|markdown|\.txt$|\.md$/i.test(`${file.type} ${file.name}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const payload = isText
      ? { text: new TextDecoder().decode(bytes) }
      : { base64: toBase64(bytes), mime: file.type || "application/pdf" };
    try {
      const turn = await readMaterial({ data: { name: file.name, mime: payload.mime ?? "text/plain", ...payload, studentName: student.name, major: student.major } });
      tell(turn.reply, turn.patch);
    } catch {
      tell("I couldn't read that file. Nothing was changed.", null);
    }
  };

  const edit = (fn: (current: Student) => Student) => setStudent((current) => (current ? fn(current) : current));
  const applyNow = (patch: Patch): number => {
    const prev = studentRef.current;
    if (!prev) return 0;
    const next = applyPatch(prev, patch);
    const id = ++undoSeq.current;
    undoLog.current.set(id, { prev, next });
    setStudent(next);
    return id;
  };
  // Only undo if nothing else has changed since the patch was applied.
  const undoApplied = (id: number): boolean => {
    const entry = undoLog.current.get(id);
    undoLog.current.delete(id);
    if (!entry || studentRef.current !== entry.next) return false;
    setStudent(entry.prev);
    return true;
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />My setup</Link>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent"><Rocket className="h-4 w-4" />LaunchPad</div>
          <nav className="ml-4 flex gap-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{t}</button>
            ))}
          </nav>
          <div className="ml-auto flex gap-1 text-xs">
            {STUDENTS.map((s) => (
              <Link key={s.id} to="/app" search={{ u: s.id }}
                className={`rounded-full border px-2.5 py-1 ${s.id === student.id ? "bg-accent text-accent-foreground border-accent" : "hover:bg-muted"}`}>
                {s.id === student.id ? `${student.name} · ${student.status}` : `${s.name} · ${s.status}`}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <input ref={calRef} hidden type="file" accept=".ics,.zip,.pdf,.png,.jpg,.jpeg,.txt,text/calendar,application/zip,application/pdf,image/*,text/plain" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void onCalendarFile(file); }} />
      <input ref={sylRef} hidden type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void onSyllabusFile(file); }} />
      <div className="mx-auto grid max-w-[1400px] gap-5 px-5 py-6 lg:grid-cols-[1fr_340px]">
        <main className="min-w-0 space-y-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome, {student.name}</h1>
            <p className="text-sm text-muted-foreground">{student.year} · {student.major} · {student.school} — {student.statusNote}</p>
          </div>
          {tab === "Scheduler" && <Scheduler s={student} onCalendar={() => calRef.current?.click()} onChange={edit} />}
          {tab === "Working on" && <WorkingOn s={student} onChange={edit} />}
          {tab === "Academics" && <Academics s={student} onSyllabus={() => sylRef.current?.click()} onChange={edit} />}
          {tab === "Opportunities" && <Opportunities s={student} />}
          {tab === "Long-term" && <LongTerm s={student} onChange={edit} />}
        </main>
        <Assistant s={student} note={note} onApply={(patch) => setStudent((current) => current ? applyPatch(current, patch) : current)} onApplyNow={applyNow} onUndo={undoApplied} onFile={(file) => void onSyllabusFile(file)} />
      </div>
    </div>
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function Scheduler({ s, onCalendar, onChange }: { s: Student; onCalendar: () => void; onChange: (fn: (current: Student) => Student) => void }) {
  const gaps = useMemo(() => findGaps(s.events, s.status), [s]);
  const use = timeUse(s.events, gaps);
  const tasks = sortTasks(s.tasks, s.focus);
  const save = (task: Task) => onChange((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? task : item) }));
  const max = Math.max(1, use.allocated, use.reallocate, use.recompensate);
  const rows = [
    { label: "Allocated toward your goal", hours: use.allocated, note: "Class and scheduled work already on this week." },
    { label: "Reallocate if you're off task", hours: use.reallocate, note: s.status === "behind" ? "Life plans and unused blocks you can move back to academics." : "Life time you could move if you fall behind." },
    { label: "Recompensate from open time", hours: use.recompensate, note: s.status === "behind" ? "Free time you can take for academics." : "Open time still available this week." },
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={onCalendar} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"><CalendarPlus className="h-4 w-4" />Import Google Calendar</button>
      </div>

      {s.status === "behind" && (
        <div className="flex items-start gap-3 rounded-lg border border-lazy bg-lazy/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-lazy" />
          <div><b>{use.reallocate.toFixed(1)}h you can move</b> while you're behind. The orange blocks are unused weekday time, and the open time below can cover academics.</div>
        </div>
      )}

      <WeekView s={s} gaps={gaps} />

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Up next <span className="font-normal text-muted-foreground text-sm">· by priority</span></h2>
          <ul className="mt-3 divide-y">
            {tasks.map((task) => <TaskBlock key={task.id} task={task} onChange={save} />)}
            {!tasks.length && <li className="py-3 text-sm text-muted-foreground">No tasks yet — tell the assistant what's coming up.</li>}
          </ul>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">This week's time</h2>
          <div className="mt-3 space-y-3">
            {rows.map((row) => (
              <div key={row.label} title={row.note}>
                <div className="flex justify-between gap-3 text-sm"><span>{row.label}</span><span className="font-mono text-xs">{row.hours.toFixed(1)}h</span></div>
                <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, (row.hours / max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function WorkingOn({ s, onChange }: { s: Student; onChange: (fn: (current: Student) => Student) => void }) {
  const pinned = sortTasks(s.tasks.filter((task) => task.pinned), s.focus);
  const save = (task: Task) => onChange((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? task : item) }));
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Working on</h2>
      <p className="text-sm text-muted-foreground">Pinned work stays here. Steps under a task stay with that task.</p>
      <ul className="mt-3 divide-y">
        {pinned.map((task) => <TaskBlock key={task.id} task={task} onChange={save} />)}
        {!pinned.length && <li className="py-3 text-sm text-muted-foreground">Pin a task from the scheduler to keep it here.</li>}
      </ul>
    </section>
  );
}

function TaskBlock({ task, onChange }: { task: Task; onChange: (task: Task) => void }) {
  const steps = task.subtasks ?? [];
  const meta = [task.hours ? `${task.hours}h` : null, task.due ?? "this week", steps.length ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="group flex items-center gap-2 py-1 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${task.category === "academic" ? "bg-class" : task.category === "fun" ? "bg-life" : "bg-task"}`} />
      <input
        value={task.title}
        onChange={(e) => onChange({ ...task, title: e.target.value })}
        className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 hover:border-border focus:border-ring focus:bg-background focus:outline-none"
      />
      {task.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" aria-label="Pinned" />}
      {task.priority === "highest" && <span className="rounded bg-accent px-1.5 text-[10px] font-bold uppercase text-accent-foreground">highest</span>}
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{meta}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Edit ${task.title}`}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <select
              value={task.category}
              onChange={(e) => onChange({ ...task, category: e.target.value as Category })}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
            >
              {(Object.keys(CAT_LABEL) as Category[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CAT_LABEL[cat]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange({ ...task, pinned: !task.pinned })}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold uppercase ${task.pinned ? "bg-accent text-accent-foreground" : "border hover:bg-muted"}`}
            >
              <Pin className="h-3 w-3" />
              {task.pinned ? "Pinned" : "Pin"}
            </button>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Steps</div>
            <ItemList
              className="mt-1 space-y-1"
              items={steps}
              placeholder="Add a subtask"
              onChange={(id, title) => onChange({ ...task, subtasks: steps.map((item) => (item.id === id ? { ...item, title } : item)) })}
              onAdd={(title) => onChange({ ...task, subtasks: [...steps, { id: nid(), title }] })}
            />
          </div>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function ItemList({ items, placeholder, onChange, onAdd, className = "ml-4 mt-2 space-y-1" }: { items: { id: string; title: string }[]; placeholder: string; onChange: (id: string, title: string) => void; onAdd: (title: string) => void; className?: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className={className}>
      {items.map((item) => (
        <input key={item.id} value={item.title} onChange={(e) => onChange(item.id, e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-sm" />
      ))}
      <form onSubmit={(e) => { e.preventDefault(); const title = draft.trim(); if (!title) return; onAdd(title); setDraft(""); }} className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          className="flex-1 rounded-md border bg-background px-2 py-1 text-sm" />
        <button className="rounded-md border px-2 text-xs hover:bg-muted">Add</button>
      </form>
    </div>
  );
}

const nid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function WeekView({ s, gaps }: { s: Student; gaps: ReturnType<typeof findGaps> }) {
  const H = 26; // px per hour
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  const top = (h: number) => (h - DAY_START) * H;
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <h2 className="mr-auto text-base font-semibold">This week</h2>
        <Legend c="bg-class" l="Class" />
        <Legend c="bg-task" l="Task" />
        <Legend c="bg-life" l="Life" />
        <Legend c="hatch-free" l="Free" />
        {gaps.some((g) => g.type === "pseudo") && <Legend c="bg-pseudo" l="Pseudo-free" />}
        {gaps.some((g) => g.type === "lazy") && <Legend c="hatch-lazy" l="Unused" />}
      </div>
      <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1">
        <div />
        {DAYS.map((d) => <div key={d} className="text-center font-mono text-xs text-muted-foreground">{d}</div>)}
        <div className="relative" style={{ height: hours.length * H }}>
          {hours.map((h) => <div key={h} className="absolute right-1 font-mono text-[10px] text-muted-foreground" style={{ top: top(h) - 6 }}>{fmt(h)}</div>)}
        </div>
        {DAYS.map((_, d) => (
          <div key={d} className="relative rounded-md bg-muted/50" style={{ height: hours.length * H }}>
            {gaps.filter((g) => g.day === d).map((g, i) => (
              <div key={i} title={`${g.type} ${fmt(g.start)}–${fmt(g.end)}`}
                className={`absolute inset-x-0.5 rounded-sm ${g.type === "free" ? "hatch-free" : g.type === "lazy" ? "hatch-lazy" : "bg-pseudo"}`}
                style={{ top: top(g.start), height: (g.end - g.start) * H }} />
            ))}
            {s.events.filter((e) => e.day === d).map((e, i) => (
              <div key={i} title={`${e.title} ${fmt(e.start)}–${fmt(e.end)}`}
                className={`absolute inset-x-0.5 overflow-hidden rounded-sm px-1 text-[10px] leading-tight text-primary-foreground ${e.kind === "class" ? "bg-class" : e.kind === "task" ? "bg-task" : "bg-life"}`}
                style={{ top: top(e.start), height: Math.max(12, (e.end - e.start) * H - 1) }}>
                <b>{e.title}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const Legend = ({ c, l }: { c: string; l: string }) => <span className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${c}`} />{l}</span>;

function Academics({ s, onSyllabus, onChange }: { s: Student; onSyllabus: () => void; onChange: (fn: (current: Student) => Student) => void }) {
  const save = (course: Course) => onChange((current) => ({ ...current, courses: current.courses.map((item) => item.code === course.code ? course : item) }));
  return (
    <div className="grid gap-5 md:grid-cols-[260px_1fr]">
      <section className="rounded-xl border bg-card p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">GPA</div>
        <div className="mt-1 text-5xl font-bold">{s.gpa?.toFixed(2) ?? "—"}</div>
        <div className="mt-2 text-sm">Goal <b className="text-accent">{s.gpaGoal.toFixed(1)}+</b></div>
        {s.gpa === null && <p className="mt-2 text-xs text-muted-foreground">First quarter — no GPA yet. Every A this term sets your baseline.</p>}
        <button onClick={onSyllabus} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><Upload className="h-4 w-4" />Upload syllabus / PDF</button>
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Current courses · UCSD catalog</h2>
        <ul className="mt-3 divide-y">
          {s.courses.map((course) => <CourseBlock key={course.code} course={course} onChange={save} />)}
        </ul>
        <a href="https://catalog.ucsd.edu/curric/ECE.html" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">UCSD ECE catalog <ExternalLink className="h-3 w-3" /></a>
      </section>
    </div>
  );
}

function CourseBlock({ course, onChange }: { course: Course; onChange: (course: Course) => void }) {
  const [pane, setPane] = useState<"tasks" | "short" | "long">("tasks");
  const [open, setOpen] = useState(false);
  const count = (course.subtasks?.length ?? 0) + (course.goals?.length ?? 0);
  const panes = [
    ["tasks", "Tasks"],
    ["short", "Short-term"],
    ["long", "Long-term"],
  ] as const;
  const horizon = pane === "short" ? "short" : "long";
  return (
    <li className="py-3 text-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="w-24 font-mono font-semibold">{course.code}</span>
        <span className="flex-1">{course.name}</span>
        {count > 0 && !open && <span className="font-mono text-xs text-muted-foreground">{count} items</span>}
        <span className="font-mono text-xs text-muted-foreground">{course.units}u</span>
        <span className="w-8 text-right font-semibold">{course.grade ?? "IP"}</span>
      </button>
      {open && (
        <>
          <div className="mt-2 flex gap-1 text-xs">
            {panes.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPane(id)}
                className={`rounded-md px-2 py-1 ${pane === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>
            ))}
          </div>
          {pane === "tasks" ? (
            <ItemList
              items={course.subtasks ?? []}
              placeholder="Add a coursework step"
              onChange={(id, title) => onChange({ ...course, subtasks: (course.subtasks ?? []).map((item) => item.id === id ? { ...item, title } : item) })}
              onAdd={(title) => onChange({ ...course, subtasks: [...(course.subtasks ?? []), { id: nid(), title }] })}
            />
          ) : (
            <ItemList
              items={(course.goals ?? []).filter((goal) => goal.horizon === horizon)}
              placeholder={pane === "short" ? "Add a short-term goal" : "Add a long-term goal"}
              onChange={(id, title) => onChange({ ...course, goals: (course.goals ?? []).map((goal) => goal.id === id ? { ...goal, title } : goal) })}
              onAdd={(title) => onChange({ ...course, goals: [...(course.goals ?? []), { id: nid(), title, horizon }] })}
            />
          )}
        </>
      )}
    </li>
  );
}

function Opportunities({ s }: { s: Student }) {
  const [research, setResearch] = useState(RESEARCH);
  const [projects, setProjects] = useState(PROJECTS);
  useEffect(() => {
    sourceOpportunities()
      .then((lists) => {
        if (!lists) return;
        if (lists.research.length)
          setResearch(
            lists.research.map((item) => ({
              name: item.name,
              pi: item.sub ?? "",
              what: item.what,
              url: item.url,
            })),
          );
        if (lists.projects.length) setProjects(lists.projects);
      })
      .catch(() => undefined);
  }, []);
  const ranked = useMemo(
    () =>
      rankSourced(
        {
          research: research.map((r) => ({ name: r.name, sub: r.pi, what: r.what, url: r.url })),
          projects,
        },
        profileFromStudent(s),
      ),
    [research, projects, s],
  );
  return (
    <div className="space-y-3">
      <OpportunitiesHeading />
      <OpportunityList items={ranked} />
    </div>
  );
}

function LongTerm({ s, onChange }: { s: Student; onChange: (fn: (current: Student) => Student) => void }) {
  const save = (reminder: Reminder) => onChange((current) => ({ ...current, longTerm: current.longTerm.map((item) => item.id === reminder.id ? reminder : item) }));
  const add = (horizon: Reminder["horizon"], text: string) => onChange((current) => ({ ...current, longTerm: [...current.longTerm, { id: nid(), text, horizon }] }));
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <GoalColumn title="Monthly reminders" items={s.longTerm.filter((item) => item.horizon === "month")} onEdit={save} onAdd={(text) => add("month", text)} />
      <GoalColumn title="Yearly goals" items={s.longTerm.filter((item) => item.horizon === "year")} onEdit={save} onAdd={(text) => add("year", text)} />
    </div>
  );
}

function GoalColumn({ title, items, onEdit, onAdd }: { title: string; items: Reminder[]; onEdit: (reminder: Reminder) => void; onAdd: (text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={() => setAdding((open) => !open)} className="ml-auto rounded-md border px-2 py-1 hover:bg-muted" aria-label={`Add to ${title}`}><Plus className="h-4 w-4" /></button>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 shrink-0 text-accent" />
            <input value={item.text} onChange={(e) => onEdit({ ...item, text: e.target.value })} className="flex-1 rounded-md border bg-background px-2 py-1" />
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
      </ul>
      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); const text = draft.trim(); if (!text) return; onAdd(text); setDraft(""); setAdding(false); }} className="mt-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a goal" className="flex-1 rounded-md border bg-background px-2 py-1 text-sm" />
          <button className="rounded-md border px-2 text-xs hover:bg-muted">Add</button>
        </form>
      )}
    </section>
  );
}

type Msg = { me: boolean; text: string; undoId?: number | undefined };

function Assistant({ s, note, onApply, onApplyNow, onUndo, onFile }: { s: Student; note: { id: number; text: string; patch: Patch | null } | null; onApply: (patch: Patch) => void; onApplyNow: (patch: Patch) => number; onUndo: (id: number) => boolean; onFile: (file: File) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Patch | null>(null);
  const seenNote = useRef(0);
  // Live events, so the overlap check below sees the schedule as it is when the reply lands.
  const eventsRef = useRef(s.events);
  eventsRef.current = s.events;
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMsgs([{ me: false, text: `Hi ${s.name}! I'm Grok. Tell me about schedule changes, or say if you're ahead or behind — I'll make small changes right away and ask before bigger ones.` }]), [s.id]);
  useEffect(() => {
    if (!note || seenNote.current === note.id) return;
    seenNote.current = note.id;
    setMsgs((current) => [...current, { me: false, text: note.text }]);
    setPending(note.patch);
  }, [note]);
  const send = () => {
    const raw = text.trim();
    if (!raw) return;
    setText("");
    setMsgs((current) => [...current, { me: true, text: raw }]);
    if (pending && /^(yes|yep|apply|do it|add them|add it)\b/i.test(raw)) {
      onApply(pending);
      setPending(null);
      setMsgs((current) => [...current, { me: false, text: "Applied. The week now includes that change." }]);
      return;
    }
    if (pending && /^(no|nope|leave it)\b/i.test(raw)) {
      setPending(null);
      setMsgs((current) => [...current, { me: false, text: "Left the week as it is." }]);
      return;
    }
    const snapshot = { name: s.name, major: s.major, status: s.status, statusNote: s.statusNote, focus: s.focus, courses: s.courses, events: s.events, tasks: s.tasks, weeklyTargets: s.weeklyTargets, longTerm: s.longTerm };
    void mentorChat({ data: { model: "Grok", message: raw, student: snapshot } }).then((turn) => {
      if (turn.patch && turn.size === "small" && classifyPatch(turn.patch, eventsRef.current) === "small") {
        const undoId = onApplyNow(turn.patch);
        setPending(null);
        setMsgs((current) => [...current, { me: false, text: turn.reply }, { me: false, text: `Added ${describeSmallPatch(turn.patch!)}.`, undoId }]);
        return;
      }
      setPending(turn.patch);
      setMsgs((current) => [...current, { me: false, text: turn.reply }]);
    }).catch(() => setMsgs((current) => [...current, { me: false, text: "I couldn't reach the mentor. Nothing was changed." }]));
  };
  const undo = (index: number, id: number) => {
    const ok = onUndo(id);
    setMsgs((current) => [
      ...current.map((m, i) => (i === index ? { ...m, undoId: undefined } : m)),
      { me: false, text: ok ? "Undone." : "That changed since I added it, so I left it alone." },
    ]);
  };
  return (
    <aside className="flex h-[calc(100vh-110px)] flex-col rounded-xl border bg-card lg:sticky lg:top-5">
      <div className="flex items-center gap-2 border-b p-3">
        <b className="text-sm">Mentor</b>
        <span className="ml-auto rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Grok</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {msgs.map((m, i) => (
          <div key={i} className={m.me ? "ml-8 rounded-lg bg-primary p-2.5 text-primary-foreground" : "mr-4"}>
            {m.text}
            {m.undoId !== undefined && (
              <button type="button" onClick={() => undo(i, m.undoId!)} className="ml-2 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">Undo</button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t p-3">
        <input ref={fileRef} hidden type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border px-2 text-muted-foreground hover:bg-muted" aria-label="Upload a file"><Paperclip className="h-4 w-4" /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="I have a midterm Thursday…" className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={send} className="rounded-md bg-accent px-3 text-accent-foreground"><Send className="h-4 w-4" /></button>
      </div>
    </aside>
  );
}
