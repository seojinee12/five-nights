"""
Gemini drafts changes to the planner. Nothing here is applied until the person confirms.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from models.schemas import (
    GeminiTurn,
    PlanProposal,
    Planner,
    PriorityLevel,
    StudentProfile,
    TaskCategory,
    TaskTiming,
    WorkTask,
)
from services.gemini_service import GEMINI_MODEL, GeminiService
from services.planner_data import inferred_priority, sort_tasks

logger = logging.getLogger(__name__)


class PlannerAssistant:
    def __init__(self, gemini: GeminiService):
        self.gemini = gemini

    def propose(self, message: str, planner: Planner, profile: StudentProfile, intent: str = "edit") -> GeminiTurn:
        if not self.gemini.client:
            return self._offline(message, planner, profile, intent)
        try:
            from google.genai import types

            prompt = self._prompt(message, planner, profile, intent)
            response = self.gemini.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeminiTurn,
                    temperature=0.3,
                ),
            )
            turn = GeminiTurn.model_validate(json.loads(response.text))
            return self._normalize(turn)
        except Exception as exc:
            logger.error("Gemini proposal failed: %s", exc)
            fallback = self._offline(message, planner, profile, intent)
            fallback.reply = f"{fallback.reply} Gemini could not finish the live draft, so this is the local suggestion."
            return fallback

    def read_material(
        self,
        payload: bytes,
        mime_type: str,
        filename: str,
        planner: Planner,
        profile: StudentProfile,
    ) -> GeminiTurn:
        text = ""
        if mime_type.startswith("text/") or filename.lower().endswith((".txt", ".md", ".csv")):
            text = payload.decode("utf-8", errors="replace")[:20000]
        if not self.gemini.client:
            if not text:
                return GeminiTurn(
                    reply="A PDF or image needs the Gemini key to read. Upload a .txt export, or add the key and try the file again.",
                    needs_confirmation=False,
                )
            return self._offline(f"Integrate this document into the week:\n{text[:4000]}", planner, profile, "parse_text")
        try:
            from google.genai import types

            instruction = self._prompt(
                "Read this syllabus, major requirement list, or notes. Add the real deadlines and study work to the week. Keep every existing task that still matters.",
                planner,
                profile,
                "parse_text",
            )
            parts = [instruction]
            if text:
                parts.append(text)
            else:
                parts.append(types.Part.from_bytes(data=payload, mime_type=mime_type or "application/pdf"))
            response = self.gemini.client.models.generate_content(
                model=GEMINI_MODEL,
                contents=parts,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeminiTurn,
                    temperature=0.2,
                ),
            )
            return self._normalize(GeminiTurn.model_validate(json.loads(response.text)))
        except Exception as exc:
            logger.error("Gemini document read failed: %s", exc)
            if text:
                return self._offline(f"Integrate this document into the week:\n{text[:4000]}", planner, profile, "parse_text")
            return GeminiTurn(
                reply="I could not read that file. Try a .txt export, or a smaller PDF.",
                needs_confirmation=False,
            )

    def _prompt(self, message: str, planner: Planner, profile: StudentProfile, intent: str) -> str:
        return f"""
You are LaunchPad's editor for {profile.display_name}. Persona: {profile.persona}.
School: {profile.university or "unspecified"}. Studying: {profile.major or "unspecified"}.
Classes: {", ".join(profile.current_classes) or "none listed"}.
Focus areas, in priority order: {", ".join(profile.focus_areas) or "academia, career"}.
Grade goal: {profile.gpa_goal}. Career aim: {profile.career_goal or "unspecified"}.
Hours they can give outside class: {profile.free_hours_per_week}.

Intent: {intent}
What they said:
{message}

Current planner JSON:
{planner.model_dump_json()}

Rules:
1. You are proposing. The reply must say what you would change. Never say the change is already saved.
2. Set needs_confirmation true only when the proposal actually changes tasks, goals, events, or profile fields.
3. A question with no edit gets needs_confirmation false and an empty proposal.
4. Academia and career outrank projects and recovery unless the person sets an explicit High, Medium, or Low. Set explicit_priority true only when they name a discrete priority.
5. timing clock means a real day, start, and end on the weekly calendar. timing hour_goal is a weekly total such as "study 20 hours" with no clock time. timing untimed is for things like "go to the gym".
6. when is this_week or upcoming. Long-term goals are reminders, not calendar blocks.
7. Do not schedule work into the short transition between classes.
8. If they are behind, protect academia and career, shrink hour goals, and move lower work to upcoming.
9. If they are ahead, you may pull one upcoming academia or career task into this week.
10. If goals changed, keep the goals they already saved and adjust tasks so the week still serves the short-term goals.
11. If they ask to track hours, set show_hour_tracker true. Otherwise leave it null.
12. If they ask to hide the productivity bar, set productivity_bar_visible false.
13. Do not invent UC San Diego courses unless persona is demo or those courses are already on the profile.
14. When replace_tasks is true, return the full task list, keeping ids of tasks you did not mean to delete.
"""

    def _normalize(self, turn: GeminiTurn) -> GeminiTurn:
        proposal = turn.proposal
        if proposal is None:
            turn.needs_confirmation = False
            return turn
        changes = any(
            [
                proposal.replace_tasks,
                proposal.replace_short_goals,
                proposal.replace_long_goals,
                bool(proposal.add_events),
                proposal.gpa_goal is not None,
                proposal.career_goal is not None,
                proposal.classes is not None,
                proposal.focus_areas is not None,
                proposal.free_hours_per_week is not None,
                proposal.show_hour_tracker is not None,
                proposal.productivity_bar_visible is not None,
                proposal.productivity_aim is not None,
            ]
        )
        turn.needs_confirmation = bool(turn.needs_confirmation and changes)
        if not changes:
            turn.proposal = None
            turn.needs_confirmation = False
        return turn

    def _offline(self, message: str, planner: Planner, profile: StudentProfile, intent: str) -> GeminiTurn:
        text = (message or "").strip()
        lowered = text.lower()
        tasks = [task.model_copy(deep=True) for task in planner.tasks]
        if intent == "pace_behind" or any(word in lowered for word in ("behind", "overwhelmed", "too much")):
            return self._pace(tasks, behind=True, profile=profile)
        if intent == "pace_ahead" or "ahead" in lowered:
            return self._pace(tasks, behind=False, profile=profile)
        if "track" in lowered and "hour" in lowered:
            proposal = PlanProposal(
                summary="Show a simple hour log on hour-total tasks.",
                why="You asked for an hour tracker. It stays off until you apply this.",
                show_hour_tracker=True,
            )
            return GeminiTurn(reply=proposal.summary, needs_confirmation=True, proposal=proposal)
        if "hide" in lowered and "bar" in lowered:
            proposal = PlanProposal(
                summary="Hide the productivity bar.",
                why="You can turn it back on in Settings.",
                productivity_bar_visible=False,
            )
            return GeminiTurn(reply=proposal.summary, needs_confirmation=True, proposal=proposal)
        if intent == "goals_changed":
            return GeminiTurn(
                reply="The goal list is updated. I would keep this week's academia and career blocks, and leave anything without a clock time in Upcoming.",
                needs_confirmation=False,
            )
        if not text or text.endswith("?") and not any(word in lowered for word in ("add", "move", "change", "schedule", "set")):
            return GeminiTurn(
                reply=f"I can change the week, the goals, or a priority when you want. Right now nothing is waiting to apply.",
                needs_confirmation=False,
            )
        priority = PriorityLevel.MEDIUM
        explicit = False
        if "high priority" in lowered or "priority high" in lowered:
            priority = PriorityLevel.HIGH
            explicit = True
        elif "low priority" in lowered or "priority low" in lowered:
            priority = PriorityLevel.LOW
            explicit = True
        timing = TaskTiming.UNTIMED
        when = "this_week"
        hours = 1.5
        if "hour" in lowered and any(token in lowered for token in ("total", "this week", "hours")):
            timing = TaskTiming.HOUR_GOAL
            hours = 5
        if any(word in lowered for word in ("gym", "later", "upcoming", "next week")):
            when = "upcoming"
        category = TaskCategory.ACADEMIC if "academia" in (profile.focus_areas or []) else TaskCategory.CAREER
        if "career" in lowered or "email" in lowered or "internship" in lowered:
            category = TaskCategory.CAREER
        if not explicit:
            priority = inferred_priority(category, profile.focus_areas or [])
        tasks.append(
            WorkTask(
                id=f"note_{uuid.uuid4().hex[:8]}",
                title=text[:80],
                description=text,
                category=category,
                priority=priority,
                explicit_priority=explicit,
                timing=timing,
                when=when,
                estimated_hours=hours,
            )
        )
        proposal = PlanProposal(
            summary="Add that to the list.",
            why="Nothing is saved until you apply it. Higher priority stays higher in the list.",
            replace_tasks=True,
            tasks=sort_tasks(tasks),
        )
        return GeminiTurn(
            reply="I would add that note to the planner. Apply it if it looks right.",
            needs_confirmation=True,
            proposal=proposal,
        )

    def _pace(self, tasks: List[WorkTask], behind: bool, profile: StudentProfile) -> GeminiTurn:
        if behind:
            for task in tasks:
                if task.timing == TaskTiming.HOUR_GOAL:
                    task.estimated_hours = max(1.0, round(task.estimated_hours * 0.75, 1))
                elif task.category not in {TaskCategory.ACADEMIC, TaskCategory.CAREER} and task.when == "this_week":
                    task.when = "upcoming"
                    if task.timing == TaskTiming.CLOCK:
                        task.timing = TaskTiming.UNTIMED
                        task.day = None
                        task.start = None
                        task.end = None
            summary = "You are behind. I would shrink the weekly hour totals and move the lower work to Upcoming."
            why = "Academia and career stay on this week. The calendar blocks for classes stay put."
        else:
            moved = False
            for task in tasks:
                if task.when == "upcoming" and task.category in {TaskCategory.ACADEMIC, TaskCategory.CAREER}:
                    task.when = "this_week"
                    moved = True
                    break
            summary = (
                "You are ahead. I would bring one upcoming academia or career task onto this week."
                if moved
                else "You are ahead, and there is no upcoming academia or career task to pull forward."
            )
            why = "The extra room should go to the same priorities, not to filling the minutes between classes."
        if not behind and "no upcoming" in summary:
            return GeminiTurn(reply=summary, needs_confirmation=False)
        proposal = PlanProposal(summary=summary, why=why, replace_tasks=True, tasks=tasks)
        return GeminiTurn(reply=summary, needs_confirmation=True, proposal=proposal)
