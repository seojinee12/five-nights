"""
Import a Google Calendar export into this week's fixed blocks.

Google Calendar's Settings → Import & export → Export downloads a .zip of .ics
files. A single .ics file also works. Weekly events land on their weekdays.
One-off events land on this week only.
"""

from __future__ import annotations

import io
import re
import zipfile
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from models.schemas import CalendarEvent

LOCAL_TZ = ZoneInfo("America/Los_Angeles")
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
BYDAY = {
    "MO": "Monday",
    "TU": "Tuesday",
    "WE": "Wednesday",
    "TH": "Thursday",
    "FR": "Friday",
    "SA": "Saturday",
    "SU": "Sunday",
}


def monday_of(day: Optional[date] = None) -> date:
    current = day or date.today()
    return current - timedelta(days=current.weekday())


def _unfold(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n[ \t]", "", text)


def _prop(line: str) -> tuple[str, str, str]:
    """Return (name, params, value) for one unfolded ICS line."""
    if ":" not in line:
        return "", "", ""
    head, value = line.split(":", 1)
    parts = head.split(";")
    return parts[0].upper(), ";".join(parts[1:]), value.strip()


def _parse_dt(raw: str, params: str) -> Optional[datetime]:
    value = raw.strip()
    if not value:
        return None
    if "VALUE=DATE" in params.upper() or re.fullmatch(r"\d{8}", value):
        try:
            return datetime.strptime(value[:8], "%Y%m%d")
        except ValueError:
            return None
    stamp = value[:15]
    try:
        parsed = datetime.strptime(stamp, "%Y%m%dT%H%M%S")
    except ValueError:
        return None
    if value.endswith("Z"):
        return parsed.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ).replace(tzinfo=None)
    return parsed


def _hhmm(moment: datetime) -> str:
    return moment.strftime("%H:%M")


def _kind_for(title: str) -> str:
    lowered = title.lower()
    if re.search(r"\b([a-z]{2,5}\s?\d{1,3}[a-z]?)\b", lowered) or any(
        word in lowered for word in ("lecture", "lab", "discussion", "seminar", "class", "section")
    ):
        return "class"
    return "commitment"


def _events_from_ics(text: str, week_monday: date) -> List[CalendarEvent]:
    events: List[CalendarEvent] = []
    week_end = week_monday + timedelta(days=7)
    chunks = re.split(r"BEGIN:VEVENT", _unfold(text))[1:]
    for index, chunk in enumerate(chunks):
        body = chunk.split("END:VEVENT", 1)[0]
        fields: dict[str, tuple[str, str]] = {}
        for line in body.split("\n"):
            name, params, value = _prop(line.strip())
            if name:
                fields[name] = (params, value)
        title = fields.get("SUMMARY", ("", "Busy"))[1] or "Busy"
        location = fields.get("LOCATION", ("", ""))[1].replace("\\,", ",").replace("\\n", " ")
        start_params, start_raw = fields.get("DTSTART", ("", ""))
        end_params, end_raw = fields.get("DTEND", ("", ""))
        start = _parse_dt(start_raw, start_params)
        end = _parse_dt(end_raw, end_params) if end_raw else None
        if start is None:
            continue
        all_day = "VALUE=DATE" in start_params.upper() or re.fullmatch(r"\d{8}", start_raw or "") is not None
        rule = fields.get("RRULE", ("", ""))[1].upper()
        days: List[str] = []
        if "FREQ=WEEKLY" in rule or "FREQ=DAILY" in rule:
            match = re.search(r"BYDAY=([A-Z,]+)", rule)
            if match:
                days = [BYDAY[token] for token in match.group(1).split(",") if token in BYDAY]
            elif "FREQ=DAILY" in rule:
                days = DAY_NAMES[:]
            else:
                days = [DAY_NAMES[start.weekday()]]
        elif week_monday <= start.date() < week_end:
            days = [DAY_NAMES[start.weekday()]]
        if not days:
            continue
        if all_day:
            for day_name in days:
                events.append(
                    CalendarEvent(
                        id=f"gcal_{index}_{day_name[:2].lower()}",
                        title=title,
                        day=day_name,
                        all_day=True,
                        location=location,
                        kind="commitment",
                        source="google_calendar",
                    )
                )
            continue
        if end is None:
            end = start + timedelta(hours=1)
        elif end <= start and end.date() == start.date():
            continue
        duration = end - start
        if duration.days >= 1 and not all_day:
            duration = timedelta(hours=1)
        stop = start + duration
        for day_name in days:
            events.append(
                CalendarEvent(
                    id=f"gcal_{index}_{day_name[:2].lower()}_{_hhmm(start).replace(':', '')}",
                    title=title,
                    day=day_name,
                    start=_hhmm(start),
                    end=_hhmm(stop),
                    location=location,
                    kind=_kind_for(title),
                    source="google_calendar",
                )
            )
    return events


def parse_calendar_bytes(payload: bytes, filename: str = "", week_monday: Optional[date] = None) -> List[CalendarEvent]:
    """Read an .ics file or a Google Calendar .zip export."""
    week = monday_of(week_monday)
    texts: List[str] = []
    name = (filename or "").lower()
    if name.endswith(".zip") or payload[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            for info in archive.infolist():
                if info.filename.lower().endswith(".ics"):
                    texts.append(archive.read(info).decode("utf-8", errors="replace"))
    else:
        texts.append(payload.decode("utf-8", errors="replace"))
    found: List[CalendarEvent] = []
    seen = set()
    for text in texts:
        for event in _events_from_ics(text, week):
            key = (event.title, event.day, event.start, event.end, event.all_day)
            if key in seen:
                continue
            seen.add(key)
            found.append(event)
    return found
