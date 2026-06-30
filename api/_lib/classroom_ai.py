"""Server-side Claude actions for Finlingo Classroom.

Four modes, all behind a single endpoint (`api/classroom-ai.py`):

  * generate_assignment  — build a 5-question concept challenge
  * evaluate_teachback   — grade one "explain it in your own words" answer
  * group_insight        — summarize an ANONYMIZED/aggregated group result
  * followup_activity    — propose a short remediation activity for a gap

The Anthropic key is read server-side only (never shipped to the browser).
Every model call uses tool-use so the output is structured, then we validate /
repair it before returning — malformed data is rejected rather than rendered.

Privacy: the caller (the leader's browser) only ever sends aggregated counts and
anonymized teach-it-back excerpts. No student names reach this module or Claude.
"""

import json
import os
import socket
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _lib.common import (  # noqa: E402
    ANTHROPIC_MESSAGES_URL,
    ANTHROPIC_MODEL,
    ANTHROPIC_VERSION,
    anthropic_api_key,
    ask_log,
)

SUPPORTED_TOPICS = [
    "Diversification",
    "Inflation",
    "Bond prices and yields",
    "Interest rates and growth stocks",
    "Risk and volatility",
    "Correlation",
    "Reading a market chart",
]
DIFFICULTIES = ["beginner", "intermediate"]

_SYSTEM = (
    "You write concise, accurate beginner/intermediate financial-literacy "
    "assessment content for FinLingo Classroom. You teach concepts plainly. "
    "You never give personalized investment advice, never recommend specific "
    "securities, and never make personal, psychological, or financial judgments "
    "about a learner. Return only the requested tool."
)


class ClassroomAIError(Exception):
    def __init__(self, message, *, public_message=None, status=502, retryable=False):
        super().__init__(message)
        self.public_message = public_message or message
        self.status = status
        self.retryable = retryable


# ── Low-level Claude call (tool-use → validated dict) ───────────────────────

def _call_claude(tool_name, schema, prompt, *, max_tokens=1600, timeout=55):
    api_key = anthropic_api_key()
    if not api_key:
        raise ClassroomAIError(
            "Missing ANTHROPIC_API_KEY",
            public_message="Finlingo's AI is not configured on this server.",
            status=503,
        )
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "system": _SYSTEM,
        "messages": [{"role": "user", "content": prompt}],
        "tools": [{
            "name": tool_name,
            "description": "Return the structured result.",
            "input_schema": schema,
        }],
        "tool_choice": {"type": "tool", "name": tool_name},
    }
    request = urllib.request.Request(
        ANTHROPIC_MESSAGES_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
            "accept": "application/json",
            "user-agent": "FinLingo/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        ask_log("classroom-ai anthropic http error", exc.code, raw[:200])
        if exc.code in {401, 403}:
            raise ClassroomAIError(
                "Anthropic credentials rejected",
                public_message="Finlingo's AI credentials were rejected.",
                status=502,
            ) from exc
        retryable = exc.code in {429, 502, 503, 504}
        raise ClassroomAIError(
            f"Anthropic HTTP {exc.code}",
            public_message=(
                "Finlingo's AI is busy right now. Please try again in a moment."
                if retryable else "Finlingo's AI could not complete this request."
            ),
            status=502,
            retryable=retryable,
        ) from exc
    except (TimeoutError, socket.timeout) as exc:
        raise ClassroomAIError(
            "Anthropic timeout",
            public_message="That took longer than expected. Please try again.",
            status=504, retryable=True,
        ) from exc
    except OSError as exc:
        raise ClassroomAIError(
            "Network failure",
            public_message="Network problem reaching Finlingo's AI. Please retry.",
            status=502, retryable=True,
        ) from exc

    for block in body.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == tool_name:
            value = block.get("input")
            if isinstance(value, dict):
                return value
    raise ClassroomAIError(
        "No structured tool output",
        public_message="Finlingo's AI returned an unexpected response. Please retry.",
        status=502, retryable=True,
    )


# ── Small validation helpers ────────────────────────────────────────────────

def _clean_str(value, fallback="", limit=600):
    if not isinstance(value, str):
        return fallback
    out = value.strip()
    return out[:limit] if out else fallback


def _slug(value, fallback="skill"):
    base = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value or ""))
    base = "-".join(part for part in base.split("-") if part)
    return base or fallback


def _coerce_mcq(raw, qid, default_skill):
    prompt = _clean_str(raw.get("prompt"))
    choices = raw.get("choices")
    if not prompt or not isinstance(choices, list):
        return None
    choices = [_clean_str(c, limit=240) for c in choices if isinstance(c, str) and c.strip()]
    if len(choices) < 2:
        return None
    choices = choices[:4]
    try:
        answer_index = int(raw.get("answerIndex"))
    except (TypeError, ValueError):
        return None
    if not (0 <= answer_index < len(choices)):
        return None
    return {
        "id": qid,
        "type": "mcq",
        "skill": _clean_str(raw.get("skill"), default_skill, 60),
        "prompt": prompt,
        "choices": choices,
        "answerIndex": answer_index,
        "explanation": _clean_str(raw.get("explanation"), "", 600),
    }


# ── Mode: generate_assignment ───────────────────────────────────────────────

_ASSIGNMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "objectives": {"type": "array", "items": {"type": "string"}},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "skill": {"type": "string"},
                    "prompt": {"type": "string"},
                    "choices": {"type": "array", "items": {"type": "string"}},
                    "answerIndex": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
                "required": ["skill", "prompt", "choices", "answerIndex", "explanation"],
            },
        },
        "teachBackPrompt": {"type": "string"},
        "teachBackObjective": {"type": "string"},
    },
    "required": ["title", "objectives", "questions"],
}


def generate_assignment(payload):
    topic = _clean_str(payload.get("topic"), limit=80) or "Inflation"
    difficulty = (payload.get("difficulty") or "beginner").lower()
    if difficulty not in DIFFICULTIES:
        difficulty = "beginner"
    teach_it_back = bool(payload.get("teachItBack"))
    audience = _clean_str(payload.get("audience"), "a general adult audience", 80)
    n_mcq = 4 if teach_it_back else 5

    prompt = (
        f"Create a short financial-literacy concept challenge on the topic "
        f"\"{topic}\" at {difficulty} difficulty for {audience}.\n\n"
        f"Produce exactly {n_mcq} multiple-choice questions. Each must have a "
        f"clear `skill` tag (2-4 words naming the sub-skill being tested), a "
        f"`prompt`, exactly 4 plausible `choices`, the `answerIndex` (0-3) of the "
        f"correct choice, and a one-sentence `explanation`. Vary the skills so the "
        f"results reveal where a group struggles. Keep language plain and avoid "
        f"specific investment recommendations.\n"
    )
    if teach_it_back:
        prompt += (
            "Also provide a `teachBackPrompt` asking the learner to explain the "
            "core concept in their own words, and a `teachBackObjective` stating "
            "the single learning objective that answer should demonstrate.\n"
        )
    prompt += "Also return 2-3 short `objectives` for the whole assignment."

    data = _call_claude("create_assignment", _ASSIGNMENT_SCHEMA, prompt, max_tokens=2200)

    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list):
        raise ClassroomAIError(
            "No questions returned",
            public_message="Finlingo couldn't build a valid assignment. Please try again.",
            status=502, retryable=True,
        )
    questions = []
    for i, raw in enumerate(raw_questions):
        if not isinstance(raw, dict):
            continue
        q = _coerce_mcq(raw, f"q{len(questions) + 1}", _slug(topic))
        if q:
            questions.append(q)
        if len(questions) >= n_mcq:
            break
    if len(questions) < n_mcq:
        raise ClassroomAIError(
            f"Only {len(questions)} valid questions",
            public_message="Finlingo couldn't build a complete assignment. Please try again.",
            status=502, retryable=True,
        )

    objectives = [
        _clean_str(o, limit=160) for o in (data.get("objectives") or [])
        if isinstance(o, str) and o.strip()
    ][:3] or [f"Understand the basics of {topic}."]

    content = {
        "title": _clean_str(data.get("title"), f"{topic} Concept Challenge", 120),
        "topic": topic,
        "difficulty": difficulty,
        "objectives": objectives,
        "teachItBack": teach_it_back,
        "questions": questions,
        "source": "claude",
    }

    if teach_it_back:
        tb_prompt = _clean_str(data.get("teachBackPrompt"),
                               f"In your own words, explain {topic}.", 240)
        tb_obj = _clean_str(data.get("teachBackObjective"),
                            objectives[0], 240)
        content["questions"].append({
            "id": f"q{len(questions) + 1}",
            "type": "teachback",
            "skill": _slug(topic) + "-explain",
            "prompt": tb_prompt,
            "objective": tb_obj,
            "explanation": "",
        })

    return {"ok": True, "assignment": content}


# ── Mode: evaluate_teachback ────────────────────────────────────────────────

_EVAL_SCHEMA = {
    "type": "object",
    "properties": {
        "understood": {"type": "boolean"},
        "score": {"type": "number"},
        "strengths": {"type": "string"},
        "missing": {"type": "string"},
        "feedback": {"type": "string"},
    },
    "required": ["understood", "score", "feedback"],
}


def evaluate_teachback(payload):
    objective = _clean_str(payload.get("objective"), "the concept", 300)
    source = _clean_str(payload.get("sourceExplanation"), "", 800)
    answer = _clean_str(payload.get("response"), "", 1200)
    if not answer:
        # Nothing to grade — return a neutral, non-blocking result.
        return {"ok": True, "evaluation": {
            "understood": False, "score": 0.0,
            "strengths": "", "missing": "",
            "feedback": "No explanation was provided.",
        }}

    prompt = (
        "Evaluate a learner's short explanation against a single learning "
        "objective. Judge ONLY conceptual understanding of the idea — never make "
        "personal, psychological, or financial judgments about the learner.\n\n"
        f"Learning objective: {objective}\n"
        + (f"Reference explanation: {source}\n" if source else "")
        + f"\nLearner's explanation:\n\"\"\"\n{answer}\n\"\"\"\n\n"
        "Return: `understood` (did they grasp the core idea?), `score` 0.0-1.0, "
        "`strengths` (what they explained well, one short phrase), `missing` "
        "(important ideas they left out, one short phrase), and a concise, "
        "encouraging `feedback` message of 1-2 sentences."
    )
    data = _call_claude("evaluate_explanation", _EVAL_SCHEMA, prompt, max_tokens=700, timeout=45)
    try:
        score = float(data.get("score"))
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(1.0, score))
    return {"ok": True, "evaluation": {
        "understood": bool(data.get("understood")),
        "score": round(score, 2),
        "strengths": _clean_str(data.get("strengths"), "", 240),
        "missing": _clean_str(data.get("missing"), "", 240),
        "feedback": _clean_str(data.get("feedback"), "Thanks for your explanation.", 400),
    }}


# ── Mode: group_insight ─────────────────────────────────────────────────────

_INSIGHT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "primaryGap": {"type": "string"},
        "recommendedFocus": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
    },
    "required": ["summary", "primaryGap", "recommendedFocus", "confidence"],
}


def group_insight(payload):
    topic = _clean_str(payload.get("topic"), "this topic", 80)
    objectives = [
        _clean_str(o, limit=160) for o in (payload.get("objectives") or [])
        if isinstance(o, str) and o.strip()
    ][:5]
    response_count = int(payload.get("responseCount") or 0)
    skill_stats = payload.get("skillStats") or []
    choice_dist = payload.get("choiceDistribution") or []
    excerpts = [
        _clean_str(e, limit=280) for e in (payload.get("teachbackExcerpts") or [])
        if isinstance(e, str) and e.strip()
    ][:12]
    explanations = payload.get("correctExplanations") or []

    prompt = (
        "You are analyzing ANONYMOUS, aggregated results from a group of learners "
        f"who completed a short assessment on \"{topic}\". No names are included. "
        "Identify the group's shared learning pattern. Do not infer anything about "
        "individuals.\n\n"
        f"Learning objectives: {json.dumps(objectives)}\n"
        f"Total graded responses: {response_count}\n"
        f"Per-skill correctness (skill, correct, total): {json.dumps(skill_stats)[:1500]}\n"
        f"Answer distribution per question: {json.dumps(choice_dist)[:1500]}\n"
        f"Correct explanations for reference: {json.dumps(explanations)[:1200]}\n"
        + (f"Anonymized teach-it-back excerpts: {json.dumps(excerpts)[:1500]}\n" if excerpts else "")
        + "\nReturn a short `summary` of what the group understands, the single "
        "`primaryGap` (the most important shared misunderstanding), a concrete "
        "`recommendedFocus` for a follow-up, and a `confidence` of low/medium/high "
        "based on how much data supports the pattern."
    )
    data = _call_claude("group_insight", _INSIGHT_SCHEMA, prompt, max_tokens=900, timeout=50)
    confidence = (data.get("confidence") or "medium").lower()
    if confidence not in {"low", "medium", "high"}:
        confidence = "medium"
    return {"ok": True, "insight": {
        "summary": _clean_str(data.get("summary"), "", 600),
        "primaryGap": _clean_str(data.get("primaryGap"), "", 300),
        "recommendedFocus": _clean_str(data.get("recommendedFocus"), "", 300),
        "confidence": confidence,
    }}


# ── Mode: followup_activity ─────────────────────────────────────────────────

_FOLLOWUP_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "explanation": {"type": "string"},
        "chartPrompt": {"type": "string"},
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "skill": {"type": "string"},
                    "prompt": {"type": "string"},
                    "choices": {"type": "array", "items": {"type": "string"}},
                    "answerIndex": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
                "required": ["skill", "prompt", "choices", "answerIndex", "explanation"],
            },
        },
        "teachBackPrompt": {"type": "string"},
        "teachBackObjective": {"type": "string"},
    },
    "required": ["title", "explanation", "questions", "teachBackPrompt"],
}


def followup_activity(payload):
    topic = _clean_str(payload.get("topic"), "this topic", 80)
    gap = _clean_str(payload.get("gap"), "the group's main gap", 300)
    objectives = [
        _clean_str(o, limit=160) for o in (payload.get("objectives") or [])
        if isinstance(o, str) and o.strip()
    ][:5]

    prompt = (
        f"A group studying \"{topic}\" has this shared learning gap: \"{gap}\".\n"
        f"Original objectives: {json.dumps(objectives)}\n\n"
        "Design a short remediation activity that targets exactly this gap. "
        "Return a `title`, a tight `explanation` (a 2-minute plain-English read "
        "of the misunderstood idea), an optional `chartPrompt` describing a simple "
        "chart-based check if one helps, exactly 2 multiple-choice `questions` "
        "(each with skill, prompt, 4 choices, answerIndex 0-3, explanation), a "
        "`teachBackPrompt`, and a `teachBackObjective`."
    )
    data = _call_claude("build_followup", _FOLLOWUP_SCHEMA, prompt, max_tokens=1800, timeout=55)

    questions = []
    for raw in (data.get("questions") or []):
        if not isinstance(raw, dict):
            continue
        q = _coerce_mcq(raw, f"q{len(questions) + 1}", _slug(topic))
        if q:
            questions.append(q)
        if len(questions) >= 2:
            break
    if len(questions) < 2:
        raise ClassroomAIError(
            "Follow-up missing questions",
            public_message="Finlingo couldn't build the follow-up. Please try again.",
            status=502, retryable=True,
        )

    tb_prompt = _clean_str(data.get("teachBackPrompt"),
                           f"In your own words, explain {topic}.", 240)
    tb_obj = _clean_str(data.get("teachBackObjective"), gap, 240)
    questions.append({
        "id": f"q{len(questions) + 1}",
        "type": "teachback",
        "skill": _slug(topic) + "-explain",
        "prompt": tb_prompt,
        "objective": tb_obj,
        "explanation": "",
    })

    activity = {
        "title": _clean_str(data.get("title"), f"{topic}: targeted review", 120),
        "topic": topic,
        "difficulty": "beginner",
        "objectives": objectives or [gap],
        "teachItBack": True,
        "explanation": _clean_str(data.get("explanation"), "", 1200),
        "chartPrompt": _clean_str(data.get("chartPrompt"), "", 400),
        "questions": questions,
        "source": "claude-followup",
    }
    return {"ok": True, "activity": activity}


# ── Dispatch ────────────────────────────────────────────────────────────────

_MODES = {
    "generate_assignment": generate_assignment,
    "evaluate_teachback": evaluate_teachback,
    "group_insight": group_insight,
    "followup_activity": followup_activity,
}


def handle_classroom_ai(payload):
    mode = (payload or {}).get("mode")
    fn = _MODES.get(mode)
    if not fn:
        return {"error": "Unknown classroom action."}, 400
    try:
        return fn(payload), 200
    except ClassroomAIError as exc:
        ask_log("classroom-ai error", mode, str(exc))
        return {"error": exc.public_message, "retryable": exc.retryable}, exc.status
    except Exception as exc:  # noqa: BLE001 - last-resort guard, keep functions resilient
        ask_log("classroom-ai unexpected", mode, repr(exc))
        return {"error": "Something went wrong. Please try again."}, 500
