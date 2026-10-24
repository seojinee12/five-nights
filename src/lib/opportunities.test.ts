import { describe, expect, it } from "vitest";
import { PROJECTS, RESEARCH } from "./launchpad";
import {
  inferTags,
  inferType,
  parseYear,
  profileFromStudent,
  rankOpportunities,
  rankSourced,
  type OpportunityProfile,
  type SourcedOpportunity,
  type StudentLike,
} from "./opportunities";

// Live-style results: only name, what, and url, like Gemini search returns.
const live = (name: string, what: string, url: string, sub?: string): SourcedOpportunity => ({
  name,
  what,
  url,
  sub,
});

const POOL: SourcedOpportunity[] = [
  ...RESEARCH.map((r) => live(r.name, r.what, r.url, r.pi)),
  ...PROJECTS.map((p) => live(p.name, p.what, p.url)),
  live(
    "Hardware and embedded summer internships",
    "Hardware, firmware, and embedded internship roles for engineering students.",
    "https://career.ucsd.edu/hardware",
  ),
  live(
    "Bioengineering faculty lab research",
    "Join a bioengineering lab working on medical devices and tissue engineering.",
    "https://ugresearch.ucsd.edu/bioe",
  ),
  live(
    "Biomedical and life-science internships",
    "Biotech and medical device internships for bioengineering students.",
    "https://career.ucsd.edu/biomed",
  ),
  live(
    "DiamondHacks",
    "A beginner-friendly hackathon with mentors and workshops.",
    "https://diamondhacks.acmucsd.com/",
  ),
  live(
    "Engineering scholarships",
    "Campus scholarships and funding for engineering students.",
    "https://fas.ucsd.edu/",
  ),
];

// Mirrors the demo student: first-year UCSD EE.
const SEOJIN: StudentLike = {
  id: "seojin",
  year: "Freshman",
  major: "Electrical Engineering",
  courses: [{ name: "Intro to Electrical & Computer Engineering" }, { name: "Physics: Mechanics" }],
  tasks: [{ title: "IEEE Quarterly Project: line-follower", category: "project" }],
  longTerm: [{ text: "Land a summer research or intern role" }],
  interests: [
    "Robotics and embedded systems",
    "Wearable and sensor hardware",
    "Undergraduate research",
  ],
  skills: [
    "C++ (intro level)",
    "Python (basic scripting)",
    "Circuit basics",
    "Arduino basics",
    "Git",
  ],
  goals: [
    { title: "Start research at UCSD by spring quarter" },
    { title: "Land a hardware or embedded summer internship after the first year" },
  ],
  preferences: { opportunityTypes: ["research", "internship", "project-team"] },
  resume: {
    coursework: ["ECE 5: Introduction to Electrical and Computer Engineering"],
    skills: ["Arduino", "Breadboard circuits"],
    projects: [
      {
        title: "Line-following robot",
        bullets: [
          "Built a robot car using an Arduino and infrared sensors.",
          "Wrote the control loop in C++.",
        ],
      },
    ],
    activities: [
      {
        title: "Member",
        org: "High school robotics club",
        bullets: ["Helped wire and test sensors."],
      },
    ],
  },
};

const BIOE: OpportunityProfile = {
  year: "Sophomore",
  major: "Bioengineering",
  interests: ["Medical devices", "Tissue engineering"],
  skills: ["Python", "Lab safety", "PCR"],
  goals: ["Biotech internship next summer"],
};

const rank = (profile: OpportunityProfile) => rankOpportunities(POOL, profile);
const names = (list: { name: string }[], n: number) => list.slice(0, n).map((r) => r.name);

describe("rankOpportunities", () => {
  it("returns scores from 0 to 100, sorted high to low, each with a type and a why line", () => {
    for (const profile of [profileFromStudent(SEOJIN), BIOE, {}]) {
      const ranked = rank(profile);
      const scores = ranked.map((r) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      for (const r of ranked) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(r.typeLabel.length).toBeGreaterThan(0);
        expect(r.why.length).toBeGreaterThan(0);
      }
    }
  });

  it("puts robotics, embedded, and research opportunities first for a first-year EE student", () => {
    const ranked = rank(profileFromStudent(SEOJIN));
    const top = names(ranked, 6);
    expect(top).toContain("Engineers for Exploration");
    expect(top).toContain("Hardware and embedded summer internships");
    expect(top).toContain("IEEE at UC San Diego — Quarterly Projects");
    const score = (name: string) => ranked.find((r) => r.name === name)?.score ?? -1;
    expect(score("Engineers for Exploration")).toBeGreaterThan(
      score("Bioengineering faculty lab research") + 25,
    );
    expect(score("Existential Robotics Laboratory")).toBeGreaterThan(
      score("Biomedical and life-science internships"),
    );
    expect(ranked[0]?.why).toMatch(/first-years/);
  });

  it("ranks bioengineering opportunities first for a sophomore bioengineering student", () => {
    const top = names(rank(BIOE), 3);
    expect(top).toContain("Biomedical and life-science internships");
    expect(top).toContain("Bioengineering faculty lab research");
    expect(names(rank(BIOE), 5)).not.toContain("Triton Robotics");
  });

  it("gives different top results to different students", () => {
    expect(rank(profileFromStudent(SEOJIN))[0]?.name).not.toBe(rank(BIOE)[0]?.name);
  });

  it("does not crash on an empty profile and keeps the source order for ties", () => {
    for (const profile of [
      {},
      { year: "???", major: "", interests: [], goals: [] },
      profileFromStudent({}),
    ]) {
      const ranked = rank(profile);
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
    }
    const blank = rank({});
    expect(names(blank, 4)).toEqual(names(POOL, 4));
    expect(new Set(blank.slice(0, 4).map((r) => r.score)).size).toBe(1);
  });

  it("drops duplicates by name or URL and keeps the better score", () => {
    const ranked = rankSourced(
      {
        research: RESEARCH.map((r) => live(r.name, r.what, r.url, r.pi)),
        projects: [
          ...PROJECTS,
          live("E4E again", "Same page under another name.", "https://e4e.ucsd.edu"),
        ],
      },
      profileFromStudent(SEOJIN),
    );
    const e4e = ranked.filter((r) => /exploration|e4e/i.test(r.name));
    expect(e4e).toHaveLength(1);
    expect(new Set(ranked.map((r) => r.name.toLowerCase())).size).toBe(ranked.length);
  });

  it("ranks closed applications lower and says so", () => {
    const open = live(
      "Robotics team",
      "Student robotics team. Applications are open.",
      "https://a.example.edu/open",
    );
    const closed = live(
      "Robotics team two",
      "Student robotics team. Recruitment is closed until winter.",
      "https://b.example.edu/closed",
    );
    const [first, second] = rankOpportunities([closed, open], {
      year: "First year",
      interests: ["robotics"],
    });
    expect(first?.url).toBe(open.url);
    expect(second?.why).toMatch(/closed/);
  });

  it("scales down a stretch for a first-year more than for a junior", () => {
    const lab = live(
      "Robotics lab",
      "For juniors and seniors in robotics research.",
      "https://lab.example.edu/",
    );
    const base = { major: "Electrical Engineering", interests: ["robotics research"] };
    const first = rankOpportunities([lab], { ...base, year: "First year" })[0];
    const junior = rankOpportunities([lab], { ...base, year: "Junior" })[0];
    expect(junior!.score).toBeGreaterThan(first!.score);
    expect(first?.why).not.toMatch(/open to first-years/);
  });
});

describe("inference for live results", () => {
  it("infers the type from the name, URL, and description", () => {
    expect(
      inferType(
        live(
          "San Diego Supercomputer Center",
          "Lists undergraduate internships.",
          "https://www.sdsc.edu/education/internships.html",
        ),
      ),
    ).toBe("internship");
    expect(
      inferType(
        live(
          "Jacobs School student organizations",
          "Directory of undergraduate engineering organizations.",
          "https://jacobs.ucsd.edu/clubs",
        ),
      ),
    ).toBe("club");
    expect(
      inferType(
        live("DiamondHacks", "A beginner-friendly hackathon.", "https://diamondhacks.acmucsd.com/"),
      ),
    ).toBe("hackathon");
    expect(
      inferType(
        live(
          "Engineering scholarships",
          "Funding for students.",
          "https://fas.ucsd.edu/scholarships",
        ),
      ),
    ).toBe("scholarship");
    expect(
      inferType(
        live("Existential Robotics Laboratory", "Robot perception.", "https://erl.ucsd.edu/"),
      ),
    ).toBe("research");
  });

  it("falls back to the list it came from, then to project team, when nothing matches", () => {
    expect(
      inferType({
        name: "Mystery",
        what: "Something.",
        url: "https://x.example.edu",
        listHint: "research",
      }),
    ).toBe("research");
    expect(inferType({ name: "Mystery", what: "Something.", url: "https://x.example.edu" })).toBe(
      "project",
    );
  });

  it("respects an explicit type and explicit tags", () => {
    expect(
      inferType({ name: "Lab", what: "A lab.", url: "https://x.example.edu", type: "event" }),
    ).toBe("event");
    expect(
      inferTags({ name: "Lab", what: "A lab.", url: "https://x.example.edu", tags: ["custom"] }),
    ).toEqual(["custom"]);
  });

  it("finds topic tags in the text", () => {
    const tags = inferTags(
      live("Robotics lab", "Embedded systems, sensors, and firmware.", "https://x.example.edu"),
    );
    expect(tags).toEqual(
      expect.arrayContaining(["robotics", "embedded systems", "sensors", "firmware"]),
    );
  });

  it("skips items without a name or URL instead of throwing", () => {
    const ranked = rankOpportunities(
      [
        live("", "x", "https://x.example.edu"),
        live("No link", "x", ""),
        live("Fine", "A robotics team.", "https://f.example.edu"),
      ],
      {},
    );
    expect(names(ranked, 5)).toEqual(["Fine"]);
  });
});

describe("profileFromStudent and parseYear", () => {
  it("reads year words", () => {
    expect(parseYear("Freshman")).toBe(1);
    expect(parseYear("Sophomore")).toBe(2);
    expect(parseYear("3rd year")).toBe(3);
    expect(parseYear("Senior")).toBe(4);
    expect(parseYear("")).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });

  it("tolerates a student with none of the optional fields", () => {
    expect(() => profileFromStudent({ major: "Engineering" })).not.toThrow();
    expect(profileFromStudent({}).goals).toEqual([]);
  });

  it("uses interests, goals, and resume text for the demo student", () => {
    const p = profileFromStudent(SEOJIN);
    expect(p.interests).toContain("Wearable and sensor hardware");
    expect(p.goals).toEqual(
      expect.arrayContaining(["Start research at UCSD by spring quarter", "project team"]),
    );
    expect(p.context?.join(" ")).toMatch(/Line-following robot/);
    expect(p.context?.join(" ")).toMatch(/robotics club/);
    expect(p.skills).toContain("Arduino basics");
    expect(p.context).toContain("Breadboard circuits");
  });

  it("ignores the demo student's personal fields for the custom 'me' student", () => {
    const p = profileFromStudent({
      ...SEOJIN,
      id: "me",
      major: "Bioengineering",
      tasks: [],
      longTerm: [],
    });
    expect(p.interests).toEqual([]);
    expect(p.skills).toEqual([]);
    expect(p.context?.join(" ")).not.toMatch(/robot/i);
    expect(p.major).toBe("Bioengineering");
  });
});

describe("resume privacy", () => {
  const RESUME_TEXT = [
    "Line-following robot",
    "Built a robot car using an Arduino and infrared sensors.",
    "Wrote the control loop in C++.",
    "High school robotics club",
    "Helped wire and test sensors.",
    "ECE 5: Introduction to Electrical and Computer Engineering",
    "Breadboard circuits",
  ];

  it("never puts resume text in a rendered field", () => {
    const profile = profileFromStudent(SEOJIN);
    expect(profile.context?.join(" ")).toContain("Line-following robot");
    const ranked = rank(profile);
    const rendered = ranked
      .map((r) => `${r.typeLabel} ${r.name} ${r.sub} ${r.why}`)
      .join("\n")
      .toLowerCase();
    for (const line of RESUME_TEXT) expect(rendered).not.toContain(line.toLowerCase());
  });

  it("uses the resume as context for ranking only", () => {
    const withResume = rank(profileFromStudent(SEOJIN));
    const without = rank(profileFromStudent((({ resume: _resume, ...rest }) => rest)(SEOJIN)));
    const score = (list: { name: string; score: number }[], name: string) =>
      list.find((r) => r.name === name)?.score ?? 0;
    expect(score(withResume, "Engineers for Exploration")).toBeGreaterThanOrEqual(
      score(without, "Engineers for Exploration"),
    );
    for (const r of withResume) expect(r.why).not.toMatch(/resume/i);
  });
});
