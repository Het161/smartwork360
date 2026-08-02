"""Request/response contracts. Mirrors the TypeScript types in apps/api/src/ml/."""

from typing import Any, Literal

from pydantic import BaseModel, Field

Mode = Literal["model", "heuristic"]
Label = Literal["POSITIVE", "NEGATIVE", "NEUTRAL"]
Risk = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]


# ---------------------------------------------------------------- sentiment

class SentimentItemIn(BaseModel):
    id: str
    text: str


class SentimentRequest(BaseModel):
    items: list[SentimentItemIn] = Field(default_factory=list)


class SentimentItemOut(BaseModel):
    id: str
    score: float = Field(description="-1.0 (most negative) to +1.0 (most positive)")
    label: Label


class SentimentResponse(BaseModel):
    items: list[SentimentItemOut]
    modelVersion: str
    mode: Mode


# ------------------------------------------------------------------ burnout

class BurnoutFeatures(BaseModel):
    activeLoad: float = 0
    overdueCount: float = 0
    afterHoursPct: float = 0
    avgDailyUpdates: float = 0
    negSentimentPct: float = 0


class BurnoutUserIn(BaseModel):
    userId: str
    features: BurnoutFeatures


class BurnoutRequest(BaseModel):
    users: list[BurnoutUserIn] = Field(default_factory=list)


class TopFactor(BaseModel):
    key: str
    label: str
    value: float
    contribution: float


class BurnoutItemOut(BaseModel):
    userId: str
    score: int = Field(ge=0, le=100)
    riskLevel: Risk
    topFactors: list[TopFactor]


class BurnoutResponse(BaseModel):
    items: list[BurnoutItemOut]
    modelVersion: str
    mode: Mode


# ------------------------------------------------------------------ anomaly

class AnomalyRow(BaseModel):
    userId: str
    userName: str = ""
    departmentId: str = ""
    actionsPerHour: float = 0
    nightHourRatio: float = 0
    selfApprovalCount: float = 0
    statusFlipCount: float = 0
    cycleTimeZScore: float = 0
    fastestCycleMinutes: float = 9999
    sampleTaskId: str | None = None
    sampleRefNo: str | None = None


class AnomalyRequest(BaseModel):
    events: list[AnomalyRow] = Field(default_factory=list)


class AnomalyItemOut(BaseModel):
    userId: str
    anomalyScore: float = Field(ge=0, le=1)
    reasons: list[str]
    severity: Risk


class AnomalyResponse(BaseModel):
    items: list[AnomalyItemOut]
    modelVersion: str
    mode: Mode


# --------------------------------------------------------------------- chat

class ChatTaskRef(BaseModel):
    id: str = ""
    refNo: str = ""
    title: str = ""
    dueDate: str = ""
    hoursRemaining: float = 0


class ChatLookupTask(BaseModel):
    id: str = ""
    refNo: str = ""
    title: str = ""
    status: str = ""
    assignee: str = ""
    dueDate: str = ""
    isOverdue: bool = False


class ChatRiskPerson(BaseModel):
    name: str
    score: int
    riskLevel: str


class ChatContext(BaseModel):
    userId: str = ""
    role: str = "EMPLOYEE"
    name: str = ""
    departmentName: str = "your department"
    pendingTasks: int = 0
    inProgress: int = 0
    overdue: int = 0
    dueToday: int = 0
    completedThisMonth: int = 0
    onTimePct: int = 0
    teamSize: int | None = None
    slaBreachesToday: int | None = None
    atRisk: list[ChatRiskPerson] = Field(default_factory=list)
    nextTasks: list[ChatTaskRef] = Field(default_factory=list)
    lookupTask: ChatLookupTask | None = None


class ChatRequest(BaseModel):
    message: str
    context: ChatContext = Field(default_factory=ChatContext)


class ChatLink(BaseModel):
    label: str
    href: str


class ChatResponse(BaseModel):
    reply: str
    intent: str
    confidence: float
    data: dict[str, Any] | None = None
    links: list[ChatLink] = Field(default_factory=list)
    mode: Mode
    modelVersion: str
