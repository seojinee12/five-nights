"""
LaunchPad: a weekly planner.

This week and Upcoming replace the old four-week list. Gemini and Grok can
change the plan, the goals, and the profile, and they wait for a yes first.
"""

from __future__ import annotations

import json
import os
import uuid
from html import escape
from pathlib import Path
from typing import Dict, List, Optional

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

from models.schemas import (
    CalendarEvent,
    ChatMessage,
    Goal,
    PlanProposal,
    Planner,
    PriorityLevel,
    StudentProfile,
    TaskCategory,
    TaskTiming,
    WorkTask,
)
from services.calendar_import import parse_calendar_bytes
from services.gemini_service import GeminiService
from services.grok_service import GrokService
from services.opportunity_ranker import rank_opportunities, refine_reasons
from services.planner_ai import PlannerAssistant
from services.planner_data import (
    build_demo_planner,
    build_personal_planner,
    calendar_items,
    demo_profile,
    inferred_priority,
    proposal_from_diff,
    sort_tasks,
)
from services.ucsd_catalog import UCSDCatalogService, UCSD_EE_CATALOG
from services.week_time import DAY_NAMES, day_timeline, format_span, week_minutes

STORE_PATH = Path(__file__).resolve().parent / "data" / "profiles.json"
FOCUS_ORDER = ("academia", "career", "projects", "recovery")
FOCUS_COPY = {
    "academia": ("Academia", "Classes, grades, and study time"),
    "career": ("Career", "Internships, labs, applications, and people to contact"),
    "projects": ("Projects", "Builds and side work"),
    "recovery": ("Recovery", "Rest, movement, and time that stays yours"),
}
GRADE_POINTS = {"A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7, "C+": 2.3, "C": 2.0, "C-": 1.7, "D": 1.0, "F": 0.0}
LABS = [
    ("Engineers for Exploration", "Prof. Curt Schurgers and Prof. Ryan Kastner", "Hardware, sensors, and field projects.", "https://e4e.ucsd.edu/", "e4e.ucsd.edu"),
    ("Contextual Robotics Institute", "Prof. Henrik Christensen", "Mobile robots, vision, and autonomous systems.", "https://contextualrobotics.ucsd.edu/", "contextualrobotics.ucsd.edu"),
    ("Existential Robotics Laboratory", "Prof. Nikolay Atanasov", "Perception, state estimation, and mapping.", "https://erl.ucsd.edu/", "erl.ucsd.edu"),
    ("Pamela Cosman Lab", "Prof. Pamela Cosman", "Wireless media and engineering education.", "https://cosman.ucsd.edu/", "cosman.ucsd.edu"),
    ("San Diego Supercomputer Center", "Undergraduate internships", "High-performance computing and data.", "https://interns.sdsc.edu/", "interns.sdsc.edu"),
]
RANKED_LABS = {"Engineers for Exploration", "Contextual Robotics Institute", "Existential Robotics Laboratory", "Pamela Cosman Lab"}  # shown in the ranked list
TEAMS = [
    ("IEEE at UCSD — Quarterly Projects", "Beginner teams, funded hardware, Jacobs Hall.", "https://ieeeatucsd.org/projects/quarterly", "ieeeatucsd.org/projects/quarterly"),
    ("E4E student projects", "Open recruitment for field hardware.", "https://e4e.ucsd.edu/", "e4e.ucsd.edu"),
    ("SDSC student cluster training", "A path into the internship program.", "https://www.sdsc.edu/education/internships.html", "sdsc.edu/education/internships"),
    ("Triton Robosub beginner track", "Firmware and sensors, with a mentor.", "https://tritonrobosub.com/", "tritonrobosub.com"),
]
SETTING_FIELDS = [
    ("productivity_bar", "Productivity bar"),
    ("weekly_calendar", "Weekly calendar and free time"),
    ("this_week_tasks", "Tasks for this week"),
    ("upcoming_tasks", "Upcoming tasks"),
    ("short_goals", "Short-term goals"),
    ("long_goals", "Long-term reminders"),
    ("classes", "Classes"),
    ("career", "Career"),
    ("assistant", "Gemini and Grok"),
    ("bring_in", "Calendar and syllabus import"),
]

st.set_page_config(page_title="LaunchPad", page_icon="✦", layout="wide", initial_sidebar_state="collapsed")
st.markdown(
    """
    <style>
    .block-container { padding-top: 1.3rem; padding-bottom: 6.5rem; max-width: 1080px; }
    .lp-title { font-size: 2.2rem; font-weight: 720; letter-spacing: -0.04em; line-height: 1.12; color: #1C1917; margin: 0 0 0.35rem 0; }
    .lp-sub { font-size: 1.02rem; line-height: 1.5; color: #57534E; margin: 0 0 1rem 0; }
    .lp-kicker { font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; color: #78716C; margin-bottom: 0.25rem; }
    .demo-banner, .aside-card, .soft-card { border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; }
    .demo-banner { background: #E7F0EA; border: 1px solid #C9DDD2; }
    .aside-card, .soft-card { background: #FFFCF8; border: 1px solid #E7E0D6; }
    .confirm-card { background: #F4F0E6; border: 1px solid #E0D3B8; border-radius: 16px; padding: 14px 16px; margin: 8px 0 14px 0; }
    .free-row { color: #1F6B4A; }
    .pseudo-row { color: #9A3412; }
    hr.soft { border: none; border-top: 1px solid #E7E0D6; margin: 0.35rem 0 0.7rem 0; }
    div.st-key-corner_switch { position: fixed !important; bottom: 0; left: 0; right: 0; z-index: 1000000; width: 100% !important; background: rgba(243, 238, 230, 0.96); border-top: 1px solid #E7E0D6; padding: 10px 18px 12px 18px; }
    div.st-key-corner_switch button { background: #1C1917 !important; color: #F6F1E8 !important; border: none !important; border-radius: 999px !important; width: fit-content !important; }
    div.st-key-corner_switch button p { color: #F6F1E8 !important; }
    footer { visibility: hidden; }
    </style>
    """,
    unsafe_allow_html=True,
)


def load_store() -> Dict[str, dict]:
    if not STORE_PATH.exists():
        return {}
    try:
        data = json.loads(STORE_PATH.read_text())
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def write_store(data: Dict[str, dict]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(data, indent=2))


def init_state() -> None:
    if "gemini_service" not in st.session_state:
        st.session_state.gemini_service = GeminiService()
    if "grok_service" not in st.session_state:
        st.session_state.grok_service = GrokService()
    if "assistant" not in st.session_state:
        st.session_state.assistant = PlannerAssistant(st.session_state.gemini_service)
    st.session_state.setdefault("signed_in", False)
    st.session_state.setdefault("screen", "landing")
    st.session_state.setdefault("mode", "personal")
    st.session_state.setdefault("profile", None)
    st.session_state.setdefault("planner", None)
    st.session_state.setdefault("proposal", None)
    st.session_state.setdefault("chat", [])
    st.session_state.setdefault("personal_bundle", None)
    st.session_state.setdefault("profile_key", None)
    st.session_state.setdefault("calendar_preview", None)
    if st.session_state.signed_in and st.session_state.profile is not None and st.session_state.planner is None:
        if st.session_state.mode == "demo":
            st.session_state.planner = build_demo_planner()
        else:
            st.session_state.planner = build_personal_planner(st.session_state.profile)


def service_line() -> str:
    gemini = "Gemini is live" if os.getenv("GEMINI_API_KEY") else "Gemini is in practice mode"
    grok = "Grok is live" if os.getenv("XAI_API_KEY") else "Grok is in practice mode"
    return f"{gemini} · {grok}"


def focus_phrase(areas: List[str]) -> str:
    labels = [FOCUS_COPY[area][0].lower() for area in FOCUS_ORDER if area in areas]
    if not labels:
        return "this week"
    if len(labels) == 1:
        return labels[0]
    return ", ".join(labels[:-1]) + " and " + labels[-1]


def parse_list(text: str) -> List[str]:
    items: List[str] = []
    for chunk in text.replace(",", "\n").splitlines():
        item = chunk.strip()
        if item and item not in items:
            items.append(item)
    return items


def clear_prefixed(*prefixes: str) -> None:
    for key in list(st.session_state.keys()):
        if any(str(key).startswith(prefix) for prefix in prefixes):
            del st.session_state[key]


def snapshot_bundle() -> dict:
    return {
        "profile": st.session_state.profile.model_copy(deep=True),
        "planner": st.session_state.planner.model_copy(deep=True),
        "chat": [message.model_copy() for message in st.session_state.chat],
        "profile_key": st.session_state.profile_key,
    }


def persist_personal() -> None:
    if st.session_state.mode != "personal" or not st.session_state.signed_in:
        return
    profile: Optional[StudentProfile] = st.session_state.profile
    planner: Optional[Planner] = st.session_state.planner
    if profile is None or planner is None or profile.persona == "demo":
        return
    name = profile.display_name.strip()
    if not name:
        return
    data = load_store()
    previous = st.session_state.profile_key
    new_key = name.lower()
    if previous and previous != new_key:
        data.pop(previous, None)
    data[new_key] = {"profile": profile.model_dump(), "planner": planner.model_dump()}
    write_store(data)
    st.session_state.profile_key = new_key


def profile_signature(profile: StudentProfile) -> tuple:
    return (
        tuple(profile.focus_areas),
        tuple(profile.current_classes),
        profile.free_hours_per_week,
        (profile.career_goal or "").strip(),
        profile.major.strip(),
        tuple(profile.interests),
        round(profile.gpa_goal, 2),
    )


def start_personal(profile: StudentProfile) -> None:
    previous = st.session_state.profile if st.session_state.mode == "personal" else None
    same = (
        previous is not None
        and st.session_state.planner is not None
        and profile_signature(previous) == profile_signature(profile)
    )
    planner = st.session_state.planner if same else build_personal_planner(profile)
    if same:
        planner.summary = f"{profile.display_name}, this week follows {focus_phrase(profile.focus_areas)}."
    st.session_state.mode = "personal"
    st.session_state.signed_in = True
    st.session_state.screen = "app"
    st.session_state.profile = profile
    st.session_state.planner = planner
    st.session_state.proposal = None
    st.session_state.chat = [ChatMessage(role="assistant", content=f"Welcome, {profile.display_name}. Tell me what to change, and I’ll ask before I apply it.")]
    if not same:
        clear_prefixed("task_", "pri_", "settings_", "day_pick")
    persist_personal()
    st.rerun()


def open_saved(record: dict, key: str) -> None:
    profile = StudentProfile.model_validate(record["profile"])
    profile.persona = "personal"
    planner = Planner.model_validate(record["planner"]) if record.get("planner") else build_personal_planner(profile)
    st.session_state.mode = "personal"
    st.session_state.signed_in = True
    st.session_state.screen = "app"
    st.session_state.profile = profile
    st.session_state.planner = planner
    st.session_state.proposal = None
    st.session_state.profile_key = key
    st.session_state.chat = [ChatMessage(role="assistant", content=f"Welcome back, {profile.display_name}.")]
    clear_prefixed("task_", "pri_", "settings_", "day_pick")
    st.rerun()


def enter_demo() -> None:
    if st.session_state.signed_in and st.session_state.mode == "personal" and st.session_state.profile and st.session_state.planner:
        st.session_state.personal_bundle = snapshot_bundle()
    else:
        st.session_state.personal_bundle = None
    st.session_state.mode = "demo"
    st.session_state.screen = "app"
    st.session_state.profile = demo_profile()
    st.session_state.planner = build_demo_planner()
    st.session_state.proposal = None
    st.session_state.calendar_preview = None
    st.session_state.chat = [ChatMessage(role="assistant", content="Welcome, Seojin. This example week keeps academia and career first. I’ll ask before I change it.")]
    clear_prefixed("task_demo_", "pri_demo_", "day_pick_demo")
    st.rerun()


def exit_demo() -> None:
    bundle = st.session_state.personal_bundle
    st.session_state.mode = "personal"
    st.session_state.proposal = None
    st.session_state.calendar_preview = None
    if bundle:
        st.session_state.profile = bundle["profile"]
        st.session_state.planner = bundle["planner"]
        st.session_state.chat = bundle["chat"]
        st.session_state.profile_key = bundle["profile_key"]
        st.session_state.signed_in = True
        st.session_state.screen = "app"
    else:
        st.session_state.profile = None
        st.session_state.planner = None
        st.session_state.chat = []
        st.session_state.signed_in = False
        st.session_state.screen = "landing"
    st.rerun()


def apply_proposal(proposal: PlanProposal) -> None:
    planner: Planner = st.session_state.planner
    profile: StudentProfile = st.session_state.profile
    if proposal.replace_tasks:
        planner.tasks = proposal.tasks
    if proposal.replace_short_goals:
        planner.short_goals = proposal.short_goals
    if proposal.replace_long_goals:
        planner.long_goals = proposal.long_goals
    seen = {(event.title, event.day, event.start, event.end) for event in planner.events}
    for event in proposal.add_events:
        key = (event.title, event.day, event.start, event.end)
        if key not in seen:
            planner.events.append(event)
            seen.add(key)
    if proposal.gpa_goal is not None:
        profile.gpa_goal = float(proposal.gpa_goal)
    if proposal.career_goal is not None:
        profile.career_goal = proposal.career_goal
    if proposal.classes is not None:
        profile.current_classes = list(proposal.classes)
    if proposal.focus_areas:
        profile.focus_areas = list(proposal.focus_areas)
    if proposal.free_hours_per_week is not None:
        profile.free_hours_per_week = int(proposal.free_hours_per_week)
    if proposal.show_hour_tracker is not None:
        planner.show_hour_tracker = bool(proposal.show_hour_tracker)
    if proposal.productivity_bar_visible is not None:
        planner.settings.productivity_bar = bool(proposal.productivity_bar_visible)
    if proposal.productivity_aim:
        planner.productivity_aim = proposal.productivity_aim
    st.session_state.proposal = None
    clear_prefixed("task_", "pri_")
    persist_personal()


def stage_turn(turn) -> None:
    st.session_state.chat.append(ChatMessage(role="assistant", content=turn.reply))
    if turn.needs_confirmation and turn.proposal is not None:
        st.session_state.proposal = turn.proposal
    else:
        st.session_state.proposal = None


def tasks_for(planner: Planner, when: str) -> List[WorkTask]:
    rows = [task for task in planner.tasks if task.when == when]
    if when == "this_week":
        rows = [task for task in rows if task.timing != TaskTiming.CLOCK]
    return sort_tasks(rows)


def render_corner() -> None:
    in_demo = st.session_state.mode == "demo"
    label = "Back to my planner" if in_demo and st.session_state.personal_bundle else ("Back to the start" if in_demo else "Freshman engineering example")
    icon = ":material/arrow_back:" if in_demo else ":material/school:"
    if st.button(label, key="corner_switch", icon=icon):
        exit_demo() if in_demo else enter_demo()


def render_landing() -> None:
    editing = bool(st.session_state.signed_in and st.session_state.profile is not None and st.session_state.mode == "personal")
    profile: Optional[StudentProfile] = st.session_state.profile if editing else None
    st.markdown('<p class="lp-kicker">LaunchPad</p>', unsafe_allow_html=True)
    if editing:
        st.markdown('<p class="lp-title">Change what this planner pays attention to.</p>', unsafe_allow_html=True)
    else:
        st.markdown('<p class="lp-title">Plan the week you actually have.</p>', unsafe_allow_html=True)
        st.markdown(
            '<p class="lp-sub">Start with your name. Academia and career are checked because those are the usual pair. '
            "The freshman engineering example is the button along the bottom, and that student is called Seojin.</p>",
            unsafe_allow_html=True,
        )
    saved = load_store()
    if saved and not editing:
        st.markdown("**Already on this computer**")
        columns = st.columns(min(3, len(saved)))
        for index, (key, record) in enumerate(saved.items()):
            saved_name = record.get("profile", {}).get("display_name", key)
            with columns[index % len(columns)]:
                if st.button(f"Continue as {saved_name}", key=f"continue_{key}", width="stretch"):
                    open_saved(record, key)
    left, right = st.columns([1.35, 0.85], gap="large")
    with left:
        with st.form("planner_setup"):
            name = st.text_input("What should I call you?", value=profile.display_name if profile else "", placeholder="Your name")
            st.markdown("**What should this planner pay attention to?**")
            box_a, box_b = st.columns(2)
            checks = {}
            with box_a:
                checks["academia"] = st.checkbox("Academia", value=("academia" in profile.focus_areas) if profile else True, help=FOCUS_COPY["academia"][1])
                checks["projects"] = st.checkbox("Projects", value=("projects" in profile.focus_areas) if profile else False, help=FOCUS_COPY["projects"][1])
            with box_b:
                checks["career"] = st.checkbox("Career", value=("career" in profile.focus_areas) if profile else True, help=FOCUS_COPY["career"][1])
                checks["recovery"] = st.checkbox("Recovery", value=("recovery" in profile.focus_areas) if profile else False, help=FOCUS_COPY["recovery"][1])
            with st.expander("Add school, classes, or a career aim", expanded=False):
                school = st.text_input("School", value=profile.university if profile else "")
                major = st.text_input("What you're studying", value=profile.major if profile else "")
                year_options = ["Not specified", "First year", "Second year", "Third year", "Fourth year", "Other"]
                year = st.selectbox("Year", year_options, index=year_options.index(profile.year) if profile and profile.year in year_options else 0)
                classes = st.text_area("Classes, one per line", value="\n".join(profile.current_classes) if profile else "", height=80)
                hours = st.slider("Hours you can give this outside class, each week", 4, 40, int(profile.free_hours_per_week) if profile else 10)
                gpa_goal = st.slider("Grade goal", 2.0, 4.0, float(profile.gpa_goal) if profile else 3.8, 0.05)
                career = st.text_input("Career aim", value=(profile.career_goal or "") if profile else "")
                project = st.text_input("A project, if you want one later", value=profile.interests[0] if profile and profile.interests else "")
            submitted = st.form_submit_button("Save and return" if editing else "Build my week", type="primary", width="stretch")
        if submitted:
            chosen = [area for area in FOCUS_ORDER if checks[area]]
            if not name.strip():
                st.error("Add the name you want to be called.")
            elif not chosen:
                st.error("Pick at least one area.")
            else:
                built = StudentProfile(
                    display_name=name.strip(),
                    focus_areas=chosen,
                    persona="personal",
                    university=school.strip(),
                    year="" if year == "Not specified" else year,
                    major=major.strip(),
                    current_classes=parse_list(classes),
                    interests=[project.strip()] if project.strip() else [],
                    free_hours_per_week=int(hours),
                    gpa_goal=float(gpa_goal),
                    career_goal=career.strip(),
                    notes=profile.notes if profile else "",
                    class_grades=dict(profile.class_grades) if profile else {},
                    skills=list(profile.skills) if profile else [],
                )
                start_personal(built)
    with right:
        st.markdown(
            """
            <div class="aside-card">
            <div class="lp-kicker">How the week works</div>
            <p><strong>This week</strong> is the calendar, the hour totals, and the tasks that have to happen now.</p>
            <p><strong>Upcoming</strong> holds things with no clock time, like going to the gym.</p>
            <p><strong>Free</strong> is time you can use. <strong>Pseudo-free</strong> is a transition, such as ten minutes between classes. A short gap that is not a transition stays free.</p>
            <p>Gemini can change the plan. It asks before anything is applied.</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.caption(service_line() + ". Saved on this computer only.")
        if editing and st.button("Cancel and go back", key="cancel_edit"):
            st.session_state.screen = "app"
            st.rerun()


def render_productivity(planner: Planner) -> None:
    if not planner.settings.productivity_bar:
        return
    this_week = [task for task in planner.tasks if task.when == "this_week"]
    done = sum(1 for task in this_week if task.completed)
    total = len(this_week)
    st.markdown(f"**{planner.productivity_aim}**")
    st.progress(0.0 if total == 0 else done / total)
    st.caption(f"{done} of {total} items for this week are done." if total else "Nothing is on this week yet.")


def render_confirmation() -> None:
    proposal: Optional[PlanProposal] = st.session_state.proposal
    if proposal is None:
        return
    st.markdown('<div class="confirm-card">', unsafe_allow_html=True)
    st.markdown(f"**{proposal.summary}**")
    st.caption(proposal.why or "Nothing changes until you apply it.")
    if proposal.replace_tasks:
        for task in sort_tasks(proposal.tasks)[:8]:
            place = "this week" if task.when == "this_week" else "upcoming"
            st.markdown(f"- {task.title} · {place}")
    if proposal.add_events:
        st.caption(f"{len(proposal.add_events)} calendar block(s) would be added.")
    if proposal.show_hour_tracker:
        st.caption("An hour log would turn on for weekly hour totals.")
    yes, no = st.columns(2)
    with yes:
        if st.button("Apply this", key="apply_proposal", type="primary", width="stretch"):
            apply_proposal(proposal)
            st.toast("Applied.")
            st.rerun()
    with no:
        if st.button("Leave it as it is", key="dismiss_proposal", width="stretch"):
            st.session_state.proposal = None
            st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)


def render_task_row(task: WorkTask, profile: StudentProfile) -> None:
    mode = st.session_state.mode
    label = task.title
    if task.timing == TaskTiming.CLOCK and task.start and task.end:
        label = f"{task.start}–{task.end} · {task.title}"
    checked = st.checkbox(label, value=task.completed, key=f"task_{mode}_{task.id}")
    if checked != task.completed:
        task.completed = checked
        persist_personal()
        st.rerun()
    if task.timing == TaskTiming.HOUR_GOAL:
        timing = f"{task.estimated_hours:g}h this week, not pinned to a clock time"
    elif task.timing == TaskTiming.CLOCK and task.day and task.start:
        timing = f"{task.day} {task.start}–{task.end}"
    else:
        timing = "No set time"
    priority_name = task.priority.value if isinstance(task.priority, PriorityLevel) else str(task.priority)
    source = "you set this" if task.explicit_priority else "from your priorities"
    st.caption(f"{priority_name} · {source} · {timing}")
    if task.description:
        st.caption(task.description)
    options = ["Automatic", "High", "Medium", "Low"]
    current = "Automatic" if not task.explicit_priority else priority_name.capitalize()
    choice = st.selectbox("Priority", options, index=options.index(current) if current in options else 0, key=f"pri_{mode}_{task.id}")
    if choice == "Automatic" and task.explicit_priority:
        task.explicit_priority = False
        task.priority = inferred_priority(task.category, profile.focus_areas or [])
        persist_personal()
        st.rerun()
    elif choice != "Automatic":
        level = PriorityLevel(choice.lower())
        if (not task.explicit_priority) or task.priority != level:
            task.explicit_priority = True
            task.priority = level
            persist_personal()
            st.rerun()
    planner: Planner = st.session_state.planner
    if planner.show_hour_tracker and task.timing == TaskTiming.HOUR_GOAL:
        logged = st.number_input("Hours logged", min_value=0.0, max_value=80.0, value=float(task.hours_logged), step=0.5, key=f"log_{mode}_{task.id}")
        if logged != task.hours_logged:
            task.hours_logged = float(logged)
            persist_personal()
    st.markdown('<hr class="soft">', unsafe_allow_html=True)


def render_this_week(profile: StudentProfile, planner: Planner) -> None:
    st.caption(planner.summary)
    if planner.settings.this_week_tasks:
        st.markdown("#### This week, not on the clock")
        floating = [task for task in tasks_for(planner, "this_week") if task.timing != TaskTiming.CLOCK]
        if not floating:
            st.caption("No hour totals or untimed tasks for this week.")
        else:
            for task in floating:
                render_task_row(task, profile)
    if not planner.settings.weekly_calendar:
        return
    st.markdown("#### The week’s hours")
    st.caption("Free time can hold work. Pseudo-free is a transition, like the ten minutes between classes. A short gap that is not a transition is still free, and it is marked too short to schedule.")
    items = calendar_items(planner)
    if not any(not item.get("all_day") for item in items):
        st.info("No fixed times yet. Import a Google Calendar export below and the free hours will show up around your classes.")
        return
    timelines = {day: day_timeline(items, day, planner.day_start, planner.day_end) for day in DAY_NAMES}
    totals = week_minutes(timelines)
    free_col, pseudo_col, short_col = st.columns(3)
    free_col.metric("Free this week", format_span(totals["free"]))
    pseudo_col.metric("Pseudo-free", format_span(totals["pseudo"]))
    short_col.metric("Free, too short", format_span(totals["free_short"]))
    day = st.segmented_control("Day", DAY_NAMES, default="Monday", key=f"day_pick_{st.session_state.mode}")
    chosen = day or "Monday"
    rows = timelines.get(chosen, [])
    if not rows:
        st.caption(f"{chosen} has no fixed times between {planner.day_start} and {planner.day_end}.")
        return
    by_id = {task.id: task for task in planner.tasks}
    for row in rows:
        if row["kind"] == "pseudo":
            st.markdown(f"<span class='pseudo-row'><strong>{row['start']}–{row['end']}</strong> · {row['detail']}</span>", unsafe_allow_html=True)
        elif row["kind"] in {"free", "free_short"}:
            st.markdown(f"<span class='free-row'><strong>{row['start']}–{row['end']}</strong> · {row['detail']}</span>", unsafe_allow_html=True)
        elif row["kind"] == "all_day":
            st.markdown(f"**All day** · {row['title']}")
        elif row.get("task_id") and row["task_id"] in by_id:
            render_task_row(by_id[row["task_id"]], profile)
        else:
            place = f" · {row['detail']}" if row["detail"] else ""
            st.markdown(f"**{row['start']}–{row['end']}** · {row['title']}{place}")
            st.caption(format_span(row["minutes"]))


def render_upcoming(profile: StudentProfile, planner: Planner) -> None:
    st.markdown("#### Upcoming")
    st.caption("Things without a required hour this week. A gym visit stays here until you give it a time.")
    upcoming = tasks_for(planner, "upcoming")
    if not upcoming:
        st.caption("Nothing is waiting past this week.")
    for task in upcoming:
        render_task_row(task, profile)


def remember_goal_change(note: str) -> None:
    persist_personal()
    profile: StudentProfile = st.session_state.profile
    planner: Planner = st.session_state.planner
    with st.spinner("Asking Gemini how the week should make room..."):
        turn = st.session_state.assistant.propose(note, planner, profile, intent="goals_changed")
    stage_turn(turn)


def render_goals(profile: StudentProfile, planner: Planner) -> None:
    if planner.settings.short_goals:
        st.markdown("#### Short-term goals")
        st.caption("These belong to this week and the next few. A goal with a clock time also goes on the weekly calendar.")
        for goal in list(planner.short_goals):
            st.markdown(f"**{goal.title}**")
            if goal.detail:
                st.caption(goal.detail)
            if st.button("Remove", key=f"rm_short_{goal.id}"):
                planner.short_goals = [item for item in planner.short_goals if item.id != goal.id]
                remember_goal_change(f"I removed the short-term goal '{goal.title}'. Adjust this week, and do not put that goal back.")
                st.rerun()
        with st.form("add_short_goal"):
            title = st.text_input("New short-term goal")
            detail = st.text_input("Note", key="short_detail")
            timed = st.checkbox("This one has a time this week")
            day = st.selectbox("Day", DAY_NAMES)
            start = st.text_input("Start", value="15:00")
            end = st.text_input("End", value="16:00")
            st.caption("The day and hours are used only when the time box is checked. Otherwise the goal stays off the clock.")
            if st.form_submit_button("Add short-term goal") and title.strip():
                planner.short_goals.append(Goal(id=f"sg_{uuid.uuid4().hex[:8]}", title=title.strip(), detail=detail.strip(), horizon="short"))
                if timed and start.strip() and end.strip():
                    planner.tasks.append(
                        WorkTask(
                            id=f"sgt_{uuid.uuid4().hex[:8]}",
                            title=title.strip(),
                            description=detail.strip(),
                            category=TaskCategory.ACADEMIC if "academia" in profile.focus_areas else TaskCategory.CAREER,
                            priority=PriorityLevel.HIGH,
                            timing=TaskTiming.CLOCK,
                            when="this_week",
                            day=day,
                            start=start.strip(),
                            end=end.strip(),
                            estimated_hours=1,
                        )
                    )
                remember_goal_change(f"I added a short-term goal: {title.strip()}. Fit the week around the short-term goals without scheduling over class transitions.")
                st.rerun()
    if planner.settings.long_goals:
        st.markdown("#### Long-term reminders")
        st.caption("Monthly or yearly. These are reminders, not appointments.")
        for goal in list(planner.long_goals):
            st.markdown(f"**{goal.title}**")
            if goal.detail:
                st.caption(goal.detail)
            if st.button("Remove", key=f"rm_long_{goal.id}"):
                planner.long_goals = [item for item in planner.long_goals if item.id != goal.id]
                remember_goal_change(f"I removed the long-term reminder '{goal.title}'. Keep it off the calendar.")
                st.rerun()
        with st.form("add_long_goal"):
            title = st.text_input("New reminder")
            detail = st.text_input("Why it matters", key="long_detail")
            if st.form_submit_button("Add reminder") and title.strip():
                planner.long_goals.append(Goal(id=f"lg_{uuid.uuid4().hex[:8]}", title=title.strip(), detail=detail.strip(), horizon="long", category=TaskCategory.CAREER))
                remember_goal_change(f"I added a long-term reminder: {title.strip()}. Do not turn it into a calendar block.")
                st.rerun()


def render_classes(profile: StudentProfile, demo: bool) -> None:
    if demo:
        st.markdown("#### Seojin’s classes")
        st.caption("First-year electrical engineering at UC San Diego. The catalog is part of the example.")
        stats = UCSDCatalogService.calculate_workload_projection(profile.current_classes)
        a, b, c = st.columns(3)
        a.metric("Units", stats["total_units"])
        b.metric("Study hours / week", stats["estimated_weekly_study_hours"])
        c.metric("Pace", stats["academic_intensity"])
        for code in ["ECE 5", "MATH 20A", "PHYS 2A", "ECE 15", "ECE 25", "ECE 35", "MATH 18"]:
            course = UCSD_EE_CATALOG.get(code)
            if course:
                with st.expander(f"{course.code} · {course.title}", expanded=(code == "ECE 5")):
                    st.write(course.description)
                    st.caption(f"About {course.estimated_weekly_workload_hours} hours a week · {course.difficulty_rating}")
        return
    st.markdown("#### Classes")
    st.caption("A syllabus or a major-requirement file can be read in the panel under the tabs. Gemini will ask before it changes the week.")
    if "class_editor" not in st.session_state:
        st.session_state.class_editor = "\n".join(profile.current_classes)
    st.text_area("Classes, one per line", key="class_editor", height=100)
    goal = st.slider("Grade goal", 2.0, 4.0, float(profile.gpa_goal), 0.05, key="gpa_slider")
    if st.button("Save classes and refresh the week", key="save_classes"):
        profile.current_classes = parse_list(st.session_state.class_editor)
        profile.gpa_goal = float(goal)
        current = st.session_state.planner
        kept_events = list(current.events)
        kept_settings = current.settings.model_copy(deep=True)
        tracker = current.show_hour_tracker
        rebuilt = build_personal_planner(profile)
        rebuilt.events = kept_events
        rebuilt.settings = kept_settings
        rebuilt.show_hour_tracker = tracker
        st.session_state.planner = rebuilt
        clear_prefixed("task_personal_", "pri_personal_")
        persist_personal()
        st.rerun()
    if profile.current_classes:
        points = []
        for course in profile.current_classes:
            options = list(GRADE_POINTS)
            saved = profile.class_grades.get(course, "A-")
            if saved not in options:
                saved = "A-"
            choice = st.selectbox(course, options, index=options.index(saved), key=f"grade_{course}")
            profile.class_grades[course] = choice
            points.append(GRADE_POINTS[choice])
        average = sum(points) / len(points)
        st.metric("Equal-weight sketch", f"{average:.2f}", delta=f"{average - profile.gpa_goal:+.2f} vs goal")
        persist_personal()


def render_opportunities(profile: StudentProfile, heading: str) -> None:
    planner: Optional[Planner] = st.session_state.get("planner")
    goals = [g.title for g in (planner.short_goals + planner.long_goals)] if planner else []
    ranked = refine_reasons(rank_opportunities(profile, goals=goals), profile, st.session_state.get("gemini_service"))
    st.markdown(f"#### {heading}")

    def card(item) -> None:
        opp = item.opportunity
        title = f'<a href="{escape(opp.url)}" target="_blank">{escape(opp.title)}</a>' if opp.url else escape(opp.title)
        st.markdown(
            f'<div class="soft-card"><span class="lp-kicker">{escape(opp.type)}</span><br>'
            f'<strong>{title}</strong> · {item.score}/100<br><em>Why: {escape(item.why)}</em></div>',
            unsafe_allow_html=True,
        )

    for item in ranked[:3]:
        card(item)
    if len(ranked) > 3:
        with st.expander(f"See {len(ranked) - 3} more"):
            for item in ranked[3:]:
                card(item)


def render_career(profile: StudentProfile, demo: bool) -> None:
    render_opportunities(profile, "Best fits for you" if demo else "Career")
    if demo:
        st.markdown("#### Labs and teams")
        st.caption("Real UC San Diego pages. Academia still comes first; these are the career step.")
        left, right = st.columns(2, gap="large")
        with left:
            for name, lead, blurb, url, label in LABS:
                if name in RANKED_LABS:
                    continue
                st.markdown(f'<div class="soft-card"><strong>{name}</strong><br>{lead}<br>{blurb}<br><a href="{url}" target="_blank">{label}</a></div>', unsafe_allow_html=True)
        with right:
            for name, blurb, url, label in TEAMS:
                st.markdown(f'<div class="soft-card"><strong>{name}</strong><br>{blurb}<br><a href="{url}" target="_blank">{label}</a></div>', unsafe_allow_html=True)
            with st.expander("Draft a note to a lab"):
                choice = st.selectbox("Who is it to?", [lab[0] for lab in LABS])
                if st.button("Write a draft", key="write_email"):
                    st.session_state.email_box = (
                        f"Dear {choice} team,\n\nI’m Seojin, a first-year electrical engineering student at UC San Diego. "
                        f"I’m in ECE 5, MATH 20A, and PHYS 2A, aiming for a {profile.gpa_goal:.2f}, and I protect that pace before I add extra projects. "
                        f"I’d like to know if a first-year can help with something small this quarter.\n\nThank you,\nSeojin"
                    )
                    st.session_state.show_email = True
                if st.session_state.get("show_email"):
                    st.text_area("Draft", key="email_box", height=220)
        return
    aim = st.text_input("What you want this to move toward", value=profile.career_goal or "", key="career_aim")
    notes = st.text_area("Notes", value=profile.notes or "", key="career_notes", height=100)
    if st.button("Save and ask Gemini to fit the week", key="save_career"):
        profile.career_goal = aim.strip()
        profile.notes = notes
        remember_goal_change(f"My career aim is now: {aim.strip() or 'cleared'}. Adjust this week’s career task, and ask me before anything else changes.")
        st.rerun()


def render_settings(planner: Planner) -> None:
    st.markdown("#### Settings")
    st.caption("Hide anything you don’t want on the page, including the productivity bar. This tab stays so you can turn it back on.")
    for field, label in SETTING_FIELDS:
        current = bool(getattr(planner.settings, field))
        choice = st.checkbox(label, value=current, key=f"settings_{st.session_state.mode}_{field}")
        if choice != current:
            setattr(planner.settings, field, choice)
            persist_personal()
            st.rerun()
    if planner.show_hour_tracker:
        st.caption("The hour log is on because you asked for it. Ask Gemini to turn it off if you want it gone.")


def render_imports(planner: Planner) -> None:
    if not planner.settings.bring_in:
        return
    st.markdown("#### Bring a calendar or a document")
    st.caption("From Google Calendar: Settings, Import & export, Export. That download is a .zip. A single .ics file works too. You’ll preview the times before they join the week.")
    calendar_file = st.file_uploader("Google Calendar export", type=["ics", "zip"], key=f"gcal_{st.session_state.mode}")
    if calendar_file is not None and st.button("Preview this calendar", key="preview_calendar"):
        try:
            st.session_state.calendar_preview = parse_calendar_bytes(calendar_file.getvalue(), calendar_file.name)
        except Exception as exc:
            st.session_state.calendar_preview = []
            st.error(f"That file could not be read as a calendar export. {exc}")
    preview = st.session_state.calendar_preview
    if preview is not None:
        if not preview:
            st.warning("No events for this week were in that file.")
        else:
            st.caption(f"{len(preview)} block(s) found.")
            for event in preview[:12]:
                when = event.day if event.all_day else f"{event.day} {event.start}–{event.end}"
                st.markdown(f"- {when} · {event.title}")
            if st.button("Add these times to my week", key="commit_calendar", type="primary"):
                seen = {(event.title, event.day, event.start, event.end) for event in planner.events}
                for event in preview:
                    key = (event.title, event.day, event.start, event.end)
                    if key not in seen:
                        planner.events.append(event)
                        seen.add(key)
                st.session_state.calendar_preview = None
                persist_personal()
                st.toast("Calendar added.")
                st.rerun()
    st.caption("Syllabi, major requirements, and notes. Gemini reads them and asks before it changes the week.")
    document = st.file_uploader("Syllabus, requirements, or notes", type=["pdf", "txt", "md"], key=f"doc_{st.session_state.mode}")
    if document is not None and st.button("Read this and draft the changes", key="read_document"):
        mime = document.type or "application/octet-stream"
        with st.spinner("Reading..."):
            turn = st.session_state.assistant.read_material(document.getvalue(), mime, document.name, planner, st.session_state.profile)
        st.session_state.chat.append(ChatMessage(role="user", content=f"Read {document.name}"))
        stage_turn(turn)
        st.rerun()


def render_assistant(profile: StudentProfile, planner: Planner) -> None:
    if not planner.settings.assistant:
        return
    st.markdown("#### Gemini and Grok")
    st.caption("Available on every tab. Gemini can change the schedule, the goals, the classes, and the bar. It will ask before it applies anything. Say you’re ahead or behind and it will suggest how the week should move.")
    for message in st.session_state.chat[-4:]:
        with st.chat_message(message.role):
            st.markdown(message.content)
    note = st.text_area("What should change?", key=f"assist_note_{st.session_state.mode}", height=80, placeholder="Example: make the gym low priority and keep it upcoming. Or: I was behind this week.")
    first, second, third, fourth = st.columns(4)
    if first.button("Ask Gemini", key="ask_gemini", type="primary", width="stretch"):
        if note.strip():
            st.session_state.chat.append(ChatMessage(role="user", content=note.strip()))
            with st.spinner("Drafting..."):
                turn = st.session_state.assistant.propose(note.strip(), planner, profile, intent="edit")
            stage_turn(turn)
            st.rerun()
    if second.button("Ask Grok", key="ask_grok", width="stretch"):
        if note.strip():
            st.session_state.chat.append(ChatMessage(role="user", content=note.strip()))
            with st.spinner("Grok is reading the week..."):
                diff = st.session_state.grok_service.advise(note.strip(), planner.tasks, profile)
            proposal = proposal_from_diff(diff, planner)
            st.session_state.chat.append(ChatMessage(role="assistant", content=f"{diff.summary} {diff.mentor_note}"))
            changing = any(action.action in {"postpone", "compress", "drop"} for action in diff.actions)
            st.session_state.proposal = proposal if changing else None
            st.rerun()
    if third.button("I’m ahead", key="pace_ahead", width="stretch"):
        with st.spinner("Looking for room..."):
            turn = st.session_state.assistant.propose("I am ahead of this week’s goals.", planner, profile, intent="pace_ahead")
        st.session_state.chat.append(ChatMessage(role="user", content="I’m ahead of the week."))
        stage_turn(turn)
        st.rerun()
    if fourth.button("I’m behind", key="pace_behind", width="stretch"):
        with st.spinner("Protecting the important work..."):
            turn = st.session_state.assistant.propose("I am behind on this week’s goals.", planner, profile, intent="pace_behind")
        st.session_state.chat.append(ChatMessage(role="user", content="I’m behind on the week."))
        stage_turn(turn)
        st.rerun()


def render_workspace() -> None:
    profile: StudentProfile = st.session_state.profile
    planner: Planner = st.session_state.planner
    demo = st.session_state.mode == "demo"
    if demo:
        st.markdown(
            """
            <div class="demo-banner">
            <strong>This is the freshman engineering example.</strong>
            You are using it as Seojin, a first-year electrical engineering student at UC San Diego.
            Academia and career come first. The week is built to use real free time and to leave class transitions empty.
            Your own planner is untouched.
            </div>
            """,
            unsafe_allow_html=True,
        )
    st.markdown(f'<p class="lp-title">Welcome, {profile.display_name}.</p>', unsafe_allow_html=True)
    detail = " · ".join(part for part in [profile.major, profile.university, profile.year] if part)
    st.caption(detail or f"Paying attention to {focus_phrase(profile.focus_areas)}.")
    if not demo and st.button("Change what I pay attention to", key="edit_focus"):
        st.session_state.screen = "landing"
        st.rerun()
    render_productivity(planner)
    render_confirmation()
    settings = planner.settings
    pages = []
    if settings.weekly_calendar or settings.this_week_tasks:
        pages.append("This week")
    if settings.upcoming_tasks:
        pages.append("Upcoming")
    if settings.short_goals or settings.long_goals:
        pages.append("Goals")
    if settings.classes and ("academia" in profile.focus_areas or demo):
        pages.append("Classes")
    if settings.career and ("career" in profile.focus_areas or demo):
        pages.append("Labs and teams" if demo else "Career")
    pages.append("Settings")
    tabs = st.tabs(pages)
    tab_for = dict(zip(pages, tabs))
    if "This week" in tab_for:
        with tab_for["This week"]:
            render_this_week(profile, planner)
    if "Upcoming" in tab_for:
        with tab_for["Upcoming"]:
            render_upcoming(profile, planner)
    if "Goals" in tab_for:
        with tab_for["Goals"]:
            render_goals(profile, planner)
    if "Classes" in tab_for:
        with tab_for["Classes"]:
            render_classes(profile, demo)
    career_name = "Labs and teams" if demo else "Career"
    if career_name in tab_for:
        with tab_for[career_name]:
            render_career(profile, demo)
    with tab_for["Settings"]:
        render_settings(planner)
    render_imports(planner)
    render_assistant(profile, planner)
    st.caption(service_line())


init_state()
in_demo = st.session_state.mode == "demo"
in_app = in_demo or (st.session_state.signed_in and st.session_state.screen == "app")
if in_app and st.session_state.profile is not None and st.session_state.planner is not None:
    render_workspace()
else:
    if in_demo:
        st.session_state.mode = "personal"
    render_landing()
render_corner()
