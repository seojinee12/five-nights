"""
Free time versus pseudo-free time for one week.

Pseudo-free is transition time: the ten minutes between two classes, or a short
gap that is really travel between two places. A short gap that is not a
transition stays free. It is just too short to put a task in.
"""

from __future__ import annotations

from typing import Iterable, List, Optional

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def to_minutes(hhmm: str) -> int:
    hour, minute = hhmm.split(":")
    return int(hour) * 60 + int(minute)


def from_minutes(minutes: int) -> str:
    minutes = max(0, min(minutes, 24 * 60))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def format_span(minutes: int) -> str:
    hours, mins = divmod(max(minutes, 0), 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _gap_kind(previous: dict, nxt: dict, minutes: int) -> Optional[str]:
    if minutes <= 0:
        return None
    previous_class = previous.get("kind") == "class"
    next_class = nxt.get("kind") == "class"
    previous_location = (previous.get("location") or "").strip().lower()
    next_location = (nxt.get("location") or "").strip().lower()
    locations_differ = bool(previous_location and next_location and previous_location != next_location)
    class_transition = previous_class and next_class and minutes <= 20
    travel_transition = (
        locations_differ
        and minutes <= 20
        and previous.get("kind") in {"class", "commitment"}
        and nxt.get("kind") in {"class", "commitment", "focus"}
    )
    if class_transition or travel_transition:
        return "pseudo"
    if minutes < 5:
        return None
    if minutes < 20:
        return "free_short"
    return "free"


def _gap_detail(kind: str, previous: dict, nxt: dict, minutes: int) -> str:
    if kind == "pseudo":
        return (
            f"Pseudo-free · {format_span(minutes)} · transition between {previous['title']} and {nxt['title']}. "
            "This time is on the clock and is not usable work time."
        )
    if kind == "free_short":
        return (
            f"Free · {format_span(minutes)} · open, and not a transition. Too short to schedule a task."
        )
    travel = ""
    previous_location = (previous.get("location") or "").strip()
    next_location = (nxt.get("location") or "").strip()
    if previous_location and next_location and previous_location.lower() != next_location.lower():
        travel = f" Includes getting from {previous_location} to {next_location}."
    return f"Free · {format_span(minutes)} · open time you can use.{travel}"


def day_timeline(items: Iterable[dict], day: str, day_start: str = "08:00", day_end: str = "21:30") -> List[dict]:
    """Build one day's rows: events, clock tasks, free time, and pseudo-free transitions."""
    start_bound = to_minutes(day_start)
    end_bound = to_minutes(day_end)
    occupied = []
    all_day = []
    for item in items:
        if item.get("day") != day:
            continue
        if item.get("all_day"):
            all_day.append(item)
            continue
        if not item.get("start") or not item.get("end"):
            continue
        begin = to_minutes(item["start"])
        finish = to_minutes(item["end"])
        if finish <= begin:
            continue
        occupied.append({**item, "begin": begin, "finish": finish})
    occupied.sort(key=lambda row: (row["begin"], row["finish"]))
    merged: List[dict] = []
    for row in occupied:
        if merged and row["begin"] < merged[-1]["finish"] and row["title"] == merged[-1]["title"]:
            merged[-1]["finish"] = max(merged[-1]["finish"], row["finish"])
            continue
        merged.append(row)

    rows: List[dict] = []
    for item in all_day:
        rows.append(
            {
                "kind": "all_day",
                "start": "",
                "end": "",
                "title": item["title"],
                "detail": "All day. It does not block a clock hour.",
                "minutes": 0,
                "task_id": item.get("task_id"),
            }
        )
    cursor = start_bound
    previous = {"title": "the start of the day", "kind": "open", "location": ""}
    for row in merged:
        gap = row["begin"] - cursor
        if cursor == start_bound and gap >= 5:
            kind = "free" if gap >= 20 else "free_short"
            detail = (
                f"Free · {format_span(gap)} · open before {row['title']}. Not a transition."
                if kind == "free"
                else f"Free · {format_span(gap)} · open before {row['title']}. Not a transition, and too short to schedule."
            )
            rows.append(
                {
                    "kind": kind,
                    "start": from_minutes(cursor),
                    "end": from_minutes(row["begin"]),
                    "title": "Free" if kind == "free" else "Free, short",
                    "detail": detail,
                    "minutes": gap,
                    "task_id": None,
                }
            )
        elif cursor != start_bound:
            kind = _gap_kind(previous, row, gap)
            if kind:
                rows.append(
                    {
                        "kind": kind,
                        "start": from_minutes(cursor),
                        "end": from_minutes(row["begin"]),
                        "title": "Pseudo-free" if kind == "pseudo" else ("Free" if kind == "free" else "Free, short"),
                        "detail": _gap_detail(kind, previous, row, gap),
                        "minutes": gap,
                        "task_id": None,
                    }
                )
        rows.append(
            {
                "kind": row.get("kind") or "commitment",
                "start": from_minutes(row["begin"]),
                "end": from_minutes(row["finish"]),
                "title": row["title"],
                "detail": row.get("location") or row.get("detail") or "",
                "minutes": row["finish"] - row["begin"],
                "task_id": row.get("task_id"),
            }
        )
        cursor = max(cursor, row["finish"])
        previous = row
    if merged and end_bound - cursor >= 20:
        rows.append(
            {
                "kind": "free",
                "start": from_minutes(cursor),
                "end": from_minutes(end_bound),
                "title": "Free",
                "detail": f"Free · {format_span(end_bound - cursor)} · open after {previous['title']}.",
                "minutes": end_bound - cursor,
                "task_id": None,
            }
        )
    elif not merged:
        return rows
    return rows


def week_minutes(rows_by_day: dict) -> dict:
    totals = {"free": 0, "pseudo": 0, "free_short": 0}
    for rows in rows_by_day.values():
        for row in rows:
            if row["kind"] in totals:
                totals[row["kind"]] += row["minutes"]
    return totals
