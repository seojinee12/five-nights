"""
Starter weeks for a person's own planner and for the Seojin engineering example.
"""

from __future__ import annotations

from typing import Iterable, List

from models.schemas import (
    CalendarEvent,
    FeatureSettings,
    Goal,
    PlanProposal,
    Planner,
    PriorityLevel,
    ScheduleRebalanceDiff,
    StudentProfile,
    TaskCategory,
    TaskTiming,
    WorkTask,
)

PRIORITY_RANK = {PriorityLevel.HIGH: 0, PriorityLevel.MEDIUM: 1, PriorityLevel.LOW: 2}
CATEGORY_RANK = {
    TaskCategory.ACADEMIC: 0,
    TaskCategory.CAREER: 1,
    TaskCategory.PROJECT: 2,
    TaskCategory.WELLNESS: 3,
}


def sort_tasks(tasks: Iterable[WorkTask]) -> List[WorkTask]:
    """Higher priority first. A priority the person set themselves wins ties."""

    def key(task: WorkTask):
        priority = task.priority if isinstance(task.priority, PriorityLevel) else PriorityLevel(task.priority)
        category = task.category if isinstance(task.category, TaskCategory) else TaskCategory(task.category)
        return (
            PRIORITY_RANK.get(priority, 1),
            0 if task.explicit_priority else 1,
            CATEGORY_RANK.get(category, 4),
            task.title,
        )

    return sorted(tasks, key=key)


def inferred_priority(category: TaskCategory, focus: List[str]) -> PriorityLevel:
    if category == TaskCategory.ACADEMIC and "academia" in focus[:2]:
        return PriorityLevel.HIGH
    if category == TaskCategory.CAREER and "career" in focus[:2]:
        return PriorityLevel.HIGH
    if category == TaskCategory.WELLNESS:
        return PriorityLevel.LOW
    return PriorityLevel.MEDIUM


def build_personal_planner(profile: StudentProfile) -> Planner:
    focus = profile.focus_areas or ["academia", "career"]
    tasks: List[WorkTask] = []
    classes = profile.current_classes or []
    if "academia" in focus:
        study_hours = max(4, min(profile.free_hours_per_week, 6 + 2 * len(classes)))
        class_note = ", ".join(classes) if classes else "your classes"
        tasks.append(
            WorkTask(
                id="study_hours",
                title=f"Study {study_hours:g} hours outside class",
                description=f"A weekly total for {class_note}. It is not pinned to a clock time. Place the hours in free time, not in the gaps between classes.",
                category=TaskCategory.ACADEMIC,
                priority=inferred_priority(TaskCategory.ACADEMIC, focus),
                timing=TaskTiming.HOUR_GOAL,
                when="this_week",
                estimated_hours=float(study_hours),
            )
        )
    if "career" in focus:
        aim = (profile.career_goal or "the career step you care about").strip()
        tasks.append(
            WorkTask(
                id="career_step",
                title="One concrete step on the career aim",
                description=aim,
                category=TaskCategory.CAREER,
                priority=inferred_priority(TaskCategory.CAREER, focus),
                timing=TaskTiming.UNTIMED,
                when="this_week",
                estimated_hours=1.5,
            )
        )
    if "projects" in focus:
        project = profile.interests[0] if profile.interests else "the project you named"
        tasks.append(
            WorkTask(
                id="project_later",
                title=f"Move {project} forward",
                description="Upcoming, with no clock time yet.",
                category=TaskCategory.PROJECT,
                priority=inferred_priority(TaskCategory.PROJECT, focus),
                timing=TaskTiming.UNTIMED,
                when="upcoming",
                estimated_hours=2.0,
            )
        )
    if "recovery" in focus:
        tasks.append(
            WorkTask(
                id="gym",
                title="Go to the gym",
                description="No set time. It stays off the calendar until you give it one.",
                category=TaskCategory.WELLNESS,
                priority=PriorityLevel.LOW,
                timing=TaskTiming.UNTIMED,
                when="upcoming",
                estimated_hours=1.0,
            )
        )
    name = profile.display_name or "You"
    return Planner(
        summary=f"{name}, this week follows {', '.join(focus)}. Fixed times show up after a calendar import.",
        productivity_aim="Finish the high-priority work in the time that is actually free.",
        tasks=tasks,
        short_goals=[
            Goal(
                id="short_pace",
                title="Keep this week pointed at the grade goal" if "academia" in focus else "Finish the main task this week",
                detail=f"Grade goal {profile.gpa_goal:.2f}." if "academia" in focus else "",
                horizon="short",
                category=TaskCategory.ACADEMIC if "academia" in focus else TaskCategory.CAREER,
            )
        ],
        long_goals=[
            Goal(
                id="long_reminder",
                title=profile.career_goal.strip() if profile.career_goal else "Remember the longer aim",
                detail="A monthly or yearly reminder. It does not take a slot on the week.",
                horizon="long",
                category=TaskCategory.CAREER,
            )
        ] if (profile.career_goal or "career" in focus) else [],
    )


def build_demo_planner() -> Planner:
    """Seojin's example week: academia and career first, transitions left empty."""
    events = [
        CalendarEvent(id="mon_ece", title="ECE 5 lecture", day="Monday", start="09:00", end="09:50", location="Center Hall", kind="class", source="demo"),
        CalendarEvent(id="mon_math", title="MATH 20A lecture", day="Monday", start="10:00", end="10:50", location="Warren Lecture Hall", kind="class", source="demo"),
        CalendarEvent(id="mon_phys", title="PHYS 2A discussion", day="Monday", start="11:00", end="11:50", location="York Hall", kind="class", source="demo"),
        CalendarEvent(id="tue_lab", title="ECE 5 lab", day="Tuesday", start="09:00", end="11:50", location="Jacobs Hall", kind="class", source="demo"),
        CalendarEvent(id="wed_ece", title="ECE 5 lecture", day="Wednesday", start="09:00", end="09:50", location="Center Hall", kind="class", source="demo"),
        CalendarEvent(id="wed_math", title="MATH 20A lecture", day="Wednesday", start="10:00", end="10:50", location="Warren Lecture Hall", kind="class", source="demo"),
        CalendarEvent(id="thu_phys", title="PHYS 2A lab", day="Thursday", start="09:00", end="10:50", location="York Hall", kind="class", source="demo"),
        CalendarEvent(id="fri_math", title="MATH 20A discussion", day="Friday", start="10:00", end="10:50", location="Warren Lecture Hall", kind="class", source="demo"),
    ]
    tasks = [
        WorkTask(
            id="study_20",
            title="Study 20 hours outside class",
            description="The week's study total. Put these hours in free blocks. Do not spend the ten minutes between classes.",
            category=TaskCategory.ACADEMIC,
            priority=PriorityLevel.HIGH,
            timing=TaskTiming.HOUR_GOAL,
            when="this_week",
            estimated_hours=20,
        ),
        WorkTask(
            id="mon_study",
            title="MATH 20A problem set",
            description="Timed study in the free window after PHYS 2A, at the library.",
            category=TaskCategory.ACADEMIC,
            priority=PriorityLevel.HIGH,
            timing=TaskTiming.CLOCK,
            when="this_week",
            estimated_hours=1.5,
            day="Monday",
            start="13:10",
            end="14:40",
            location="Geisel Library",
        ),
        WorkTask(
            id="mon_email",
            title="Draft two lab emails",
            description="Career work in the same library, after a short pause that is not a class transition.",
            category=TaskCategory.CAREER,
            priority=PriorityLevel.HIGH,
            timing=TaskTiming.CLOCK,
            when="this_week",
            estimated_hours=0.7,
            day="Monday",
            start="14:50",
            end="15:30",
            location="Geisel Library",
        ),
        WorkTask(
            id="tue_career",
            title="Send the lab emails",
            description="Uses the long free stretch after ECE 5 lab. Travel to the student center fits inside it.",
            category=TaskCategory.CAREER,
            priority=PriorityLevel.HIGH,
            timing=TaskTiming.CLOCK,
            when="this_week",
            estimated_hours=1.0,
            day="Tuesday",
            start="16:00",
            end="17:00",
            location="Price Center",
        ),
        WorkTask(
            id="wed_practice",
            title="Timed MATH 20A practice",
            description="Sits in Wednesday's open afternoon.",
            category=TaskCategory.ACADEMIC,
            priority=PriorityLevel.HIGH,
            timing=TaskTiming.CLOCK,
            when="this_week",
            estimated_hours=1.5,
            day="Wednesday",
            start="13:00",
            end="14:30",
            location="Geisel Library",
        ),
        WorkTask(
            id="gym",
            title="Go to the gym",
            description="No clock time. It stays an upcoming task instead of pretending to have an hour.",
            category=TaskCategory.WELLNESS,
            priority=PriorityLevel.LOW,
            timing=TaskTiming.UNTIMED,
            when="upcoming",
            estimated_hours=1.0,
        ),
        WorkTask(
            id="robot_later",
            title="Robot build, next open stretch",
            description="Worth doing, and not this week's constraint. Academia and career stay ahead of it.",
            category=TaskCategory.PROJECT,
            priority=PriorityLevel.MEDIUM,
            timing=TaskTiming.UNTIMED,
            when="upcoming",
            estimated_hours=3.0,
        ),
    ]
    return Planner(
        summary=(
            "Seojin keeps academia and career in the same week. Free hours get real work. "
            "The minutes between classes stay empty on purpose."
        ),
        productivity_aim="Excel at the classes and the career step in the same week, and leave transitions alone.",
        events=events,
        tasks=tasks,
        short_goals=[
            Goal(id="g_gpa", title="Stay on a 3.85 pace through the MATH 20A midterm", detail="This is what the free afternoon blocks are for.", horizon="short", category=TaskCategory.ACADEMIC),
            Goal(id="g_email", title="Send two lab emails before Friday", detail="E4E and the Contextual Robotics Institute.", horizon="short", category=TaskCategory.CAREER),
        ],
        long_goals=[
            Goal(id="g_year", title="Hold a 3.85 for the year", detail="A reminder, not a block on this week.", horizon="long", category=TaskCategory.ACADEMIC),
            Goal(id="g_spring", title="A research conversation by spring quarter", detail="The emails this week are the small version of this.", horizon="long", category=TaskCategory.CAREER),
        ],
        settings=FeatureSettings(),
        day_start="08:00",
        day_end="21:30",
    )


def demo_profile() -> StudentProfile:
    return StudentProfile(
        display_name="Seojin",
        focus_areas=["academia", "career", "projects", "recovery"],
        persona="demo",
        university="UC San Diego",
        school_catalog="UCSD Jacobs School of Engineering (ECE)",
        year="First year",
        major="Electrical Engineering",
        current_classes=["ECE 5", "MATH 20A", "PHYS 2A"],
        skills=["C++", "Circuit basics", "Git"],
        interests=["Robotics and embedded systems"],
        free_hours_per_week=22,
        gpa_goal=3.85,
        career_goal="A research spot or a hardware internship, without letting the courses slip",
        class_grades={"ECE 5": "A", "MATH 20A": "A-", "PHYS 2A": "A-"},
    )


def calendar_items(planner: Planner) -> List[dict]:
    """Events plus clock tasks, in the shape the week view expects."""
    items = []
    for event in planner.events:
        items.append(
            {
                "day": event.day,
                "start": event.start,
                "end": event.end,
                "title": event.title,
                "location": event.location,
                "kind": event.kind,
                "all_day": event.all_day,
                "detail": event.location,
                "task_id": None,
            }
        )
    for task in planner.tasks:
        if task.timing != TaskTiming.CLOCK or task.when != "this_week":
            continue
        items.append(
            {
                "day": task.day,
                "start": task.start,
                "end": task.end,
                "title": task.title,
                "location": task.location,
                "kind": "focus",
                "all_day": False,
                "detail": task.description,
                "task_id": task.id,
            }
        )
    return items


def proposal_from_diff(diff: ScheduleRebalanceDiff, planner: Planner) -> PlanProposal:
    """Turn a Grok rebalance into a change that still waits for confirmation."""
    tasks = [task.model_copy(deep=True) for task in planner.tasks]
    by_id = {task.id: task for task in tasks}
    for action in diff.actions:
        task = by_id.get(action.task_id or "")
        if task is None:
            continue
        if action.action in {"postpone", "drop"} and task.category != TaskCategory.ACADEMIC:
            task.when = "upcoming"
            if task.timing == TaskTiming.CLOCK:
                task.timing = TaskTiming.UNTIMED
                task.day = None
                task.start = None
                task.end = None
        elif action.action == "compress":
            task.estimated_hours = max(0.5, round(task.estimated_hours * 0.75, 1))
    return PlanProposal(
        summary=diff.summary,
        why=diff.mentor_note,
        replace_tasks=True,
        tasks=tasks,
    )
