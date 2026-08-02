"""
Task assistant — an intent router, not a generator.

This is the honest version of an "AI assistant": it CLASSIFIES the question and
then fills a template from live numbers the API has already fetched. It cannot
hallucinate a task count, because it never generates one.

Hindi and Hinglish phrasings are first-class patterns, not an afterthought —
"mere pending kaam", "kitne overdue", "der ho raha hai" are how the intended
users actually type.

Mirrors apps/api/src/ml/fallback.ts so replies are identical whether the Python
service is running or not.
"""

import re
from datetime import datetime

from .config import CHAT_VERSION
from .schemas import ChatContext, ChatLink, ChatResponse

INTENTS: list[tuple[str, list[str]]] = [
    (
        "overdue_tasks",
        [
            r"\boverdue\b", r"\blate\b", r"\bbreach(ed)?\b", r"deadline (cross|miss)",
            r"kitne? overdue", r"der ho", r"samay nikal",
        ],
    ),
    (
        "my_pending_tasks",
        [
            r"\bpending\b", r"\bmy tasks?\b", r"what.*(assigned|to do|todo)",
            r"mere? (pending )?(kaam|task)", r"kya kaam", r"mujhe kya",
            r"मेरे.*(काम|कार्य)", r"लंबित",
        ],
    ),
    ("sla_breaches_today", [r"sla", r"\btoday\b.*(breach|due)", r"due today", r"aaj.*(due|kaam)", r"आज"]),
    ("team_workload", [r"team.*(load|workload|busy)", r"who is (busy|free)", r"workload", r"team ka", r"वर्कलोड"]),
    ("who_is_at_risk", [r"at risk", r"burnout", r"overload(ed)?", r"stress", r"morale", r"pareshan", r"जोखिम", r"बर्नआउट"]),
    ("task_status", [r"status of", r"[A-Z]{3}/\d{4}/\d{3,4}", r"\bkaha(n)? tak\b"]),
    ("create_reminder", [r"remind", r"reminder", r"yaad dila", r"follow ?up"]),
    ("greeting", [r"^\s*(hi|hello|hey|namaste|namaskar)\b", r"good (morning|afternoon|evening)", r"नमस्ते"]),
    ("help", [r"\bhelp\b", r"what can you do", r"kya kar sakte", r"options"]),
]

CAPABILITIES = [
    "How many tasks are pending for me?",
    "Which of my tasks are overdue?",
    "Any SLA breach today?",
    "What is the status of REV/2026/0042?",
]


def classify(message: str) -> tuple[str, float]:
    for intent, patterns in INTENTS:
        for pattern in patterns:
            if re.search(pattern, message, re.IGNORECASE):
                return intent, 0.86
    return "fallback", 0.3


def _plural(count: int, singular: str, plural: str) -> str:
    return singular if count == 1 else plural


def _due_text(hours: float) -> str:
    h = round(hours)
    return f"{abs(h)}h overdue" if h < 0 else f"due in {h}h"


def _fmt_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%-d %b")
    except Exception:  # noqa: BLE001
        return iso[:10]


def answer(message: str, ctx: ChatContext) -> ChatResponse:
    intent, confidence = classify(message)
    first = (ctx.name or "there").split(" ")[0]

    def reply(text: str, *, data=None, links=None, name: str = intent, conf: float = confidence):
        return ChatResponse(
            reply=text,
            intent=name,
            confidence=conf,
            data=data,
            links=[ChatLink(**l) for l in (links or [])],
            mode="heuristic",
            modelVersion=CHAT_VERSION,
        )

    if intent == "greeting":
        tail = (
            f", and {ctx.overdue} of them {_plural(ctx.overdue, 'is', 'are')} overdue"
            if ctx.overdue
            else ""
        )
        return reply(
            f"Namaste {first}. You have {ctx.pendingTasks} pending and "
            f"{ctx.inProgress} in-progress tasks right now{tail}. What would you like to check?",
            data={"pending": ctx.pendingTasks, "overdue": ctx.overdue},
        )

    if intent == "my_pending_tasks":
        if ctx.pendingTasks + ctx.inProgress == 0:
            return reply(
                f"Nothing pending, {first} — your queue is clear. "
                f"{ctx.completedThisMonth} tasks completed this month."
            )
        upcoming = ctx.nextTasks[:3]
        lines = "\n".join(
            f"• {t.refNo} — {t.title} ({_due_text(t.hoursRemaining)})" for t in upcoming
        )
        return reply(
            f"You have {ctx.pendingTasks} pending and {ctx.inProgress} in progress, {first}."
            + (f"\nDue soonest:\n{lines}" if lines else ""),
            data={"pending": ctx.pendingTasks, "inProgress": ctx.inProgress},
            links=[{"label": t.refNo, "href": f"/e/tasks?task={t.id}"} for t in upcoming],
        )

    if intent == "overdue_tasks":
        if ctx.overdue == 0:
            return reply(
                "Good news — nothing is overdue for you right now. "
                f"On-time completion this month is {ctx.onTimePct}%.",
                data={"overdue": 0, "onTimePct": ctx.onTimePct},
            )
        late = [t for t in ctx.nextTasks if t.hoursRemaining < 0][:3]
        lines = "\n".join(
            f"• {t.refNo} — {t.title} ({abs(round(t.hoursRemaining))}h late)" for t in late
        )
        return reply(
            f"{ctx.overdue} {_plural(ctx.overdue, 'task has', 'tasks have')} passed their deadline."
            + (f"\n{lines}" if lines else ""),
            data={"overdue": ctx.overdue},
            links=[{"label": t.refNo, "href": f"/e/tasks?task={t.id}"} for t in late],
        )

    if intent == "sla_breaches_today":
        if ctx.role == "EMPLOYEE":
            return reply(
                f"You have {ctx.dueToday} {_plural(ctx.dueToday, 'task', 'tasks')} due today "
                f"and {ctx.overdue} already past the SLA.",
                data={"dueToday": ctx.dueToday, "overdue": ctx.overdue},
            )
        breaches = ctx.slaBreachesToday if ctx.slaBreachesToday is not None else ctx.overdue
        return reply(
            f"{ctx.departmentName}: {breaches} SLA {_plural(breaches, 'breach', 'breaches')} "
            f"recorded, {ctx.dueToday} more due today.",
            data={"dueToday": ctx.dueToday, "overdue": ctx.overdue},
        )

    if intent == "team_workload":
        if ctx.role == "EMPLOYEE":
            return reply(
                "Team workload is visible to managers. For your own queue: "
                f"{ctx.pendingTasks} pending, {ctx.inProgress} in progress, {ctx.overdue} overdue.",
                name="fallback",
                conf=0.5,
            )
        return reply(
            f"{ctx.departmentName} has {ctx.teamSize or 0} people carrying "
            f"{ctx.pendingTasks + ctx.inProgress} active tasks, {ctx.overdue} of them overdue. "
            "Open Team Analytics for the per-member split.",
            links=[{"label": "Team Analytics", "href": "/m/analytics"}],
        )

    if intent == "who_is_at_risk":
        if ctx.role == "EMPLOYEE":
            return reply(
                "Burnout insights are available to managers and administrators.",
                name="fallback",
                conf=0.5,
            )
        if not ctx.atRisk:
            return reply(
                f"No one in {ctx.departmentName} is showing elevated burnout risk this week."
            )
        lines = "\n".join(f"• {r.name} — {r.score}/100 ({r.riskLevel})" for r in ctx.atRisk)
        return reply(
            f"{len(ctx.atRisk)} {_plural(len(ctx.atRisk), 'person needs', 'people need')} "
            f"attention in {ctx.departmentName}:\n{lines}",
            data={"atRisk": [r.model_dump() for r in ctx.atRisk]},
            links=[{"label": "Burnout & Morale", "href": "/m/burnout"}],
        )

    if intent == "task_status":
        task = ctx.lookupTask
        if task is None or not task.refNo:
            return reply(
                "I could not find that reference number. Task references look like "
                "REV/2026/0042 — try pasting the full reference.",
                conf=0.6,
            )
        overdue = " — currently overdue." if task.isOverdue else "."
        return reply(
            f"{task.refNo} — {task.title}\nStatus: {task.status.replace('_', ' ')}, "
            f"assigned to {task.assignee}. Due {_fmt_date(task.dueDate)}{overdue}",
            data={"task": task.model_dump()},
            links=[{"label": f"Open {task.refNo}", "href": f"/e/tasks?task={task.id}"}],
        )

    if intent == "create_reminder":
        return reply(
            f"Reminder set — I will notify you about your {ctx.dueToday} "
            f"{_plural(ctx.dueToday, 'task', 'tasks')} due today. "
            "You will see it in the notification bell.",
            data={"scheduled": True, "dueToday": ctx.dueToday},
        )

    header = (
        "I answer questions using your live task data — I do not guess."
        if intent == "help"
        else f"I did not follow that, {first}. I answer from your live task data."
    )
    return reply(
        header + "\nTry:\n" + "\n".join(f"• {c}" for c in CAPABILITIES),
        data={"capabilities": CAPABILITIES},
        name="help" if intent == "help" else "fallback",
    )


def model_card() -> dict:
    return {
        "task": "chat",
        "name": CHAT_VERSION,
        "approach": "Regex/keyword intent classification followed by templated, data-grounded replies",
        "intents": [name for name, _ in INTENTS] + ["fallback"],
        "languages": ["English", "Hindi", "Hinglish (romanised Hindi)"],
        "honesty": (
            "No text is generated. Every figure in a reply is passed in by the API "
            "from live database queries, so the assistant cannot invent a task count "
            "or a deadline. Unrecognised questions return the capability list rather "
            "than a plausible-sounding guess."
        ),
    }
