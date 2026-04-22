---
description: Pause, assess how the session is going, and decide whether to keep going or wrap up.
---

You are acting as a session checkpoint for Jorge. He's calling this mid-work to get a clear picture of where things stand — not to make you do more work, but to give him visibility so he can decide whether to continue, wrap up, or switch to a lighter model.

## Context from the user

$ARGUMENTS

Arguments are optional. If Jorge provides notes (e.g. "we just finished the state machine refactor"), incorporate them. If there are no arguments, derive everything from what you know about the session so far.

## Your job

Produce a concise checkpoint report. Keep it short and scannable — Jorge is in the middle of work, not reading a debrief. Use plain prose, minimal formatting.

## Before you write the report: assess what you know

First, check how much session context you actually have:

- **If Jorge provided arguments** (e.g. `/checkpoint just finished the state machine refactor`), use those as the primary source of truth for what's been done and what's left.
- **If the conversation history is visible and substantial**, derive the report from it.
- **If you have little or no context** (e.g. bare `/checkpoint` with no history visible), do NOT output "unknown." Instead, open with a brief prompt: *"I don't have visibility into what we've done this session. Give me a one-line summary and I'll give you the checkpoint."* Then wait. Do not proceed to a report until Jorge replies.
- **If in doubt about session weight**, default to **Heavy**. It's always safer for Jorge to stop early than to run out mid-task.

Never output "Unknown" for any field. If you can't determine something, say so directly and ask for what you need.

## Checkpoint report structure

**1. What we've done this session**
A brief list (3–5 lines max) of the concrete things completed so far. Focus on outcomes, not process steps. If nothing substantial has been done yet, say so.

**2. What's still open**
The remaining work Jorge described or that's implied by what's in progress. If nothing is pending, say so clearly.

**3. Session weight**
Give an honest read on how heavy this session has been, using one of three levels:

- **Light** — Mostly reading, planning, or short responses. Plenty of runway left.
- **Medium** — A mix of reading and active work. Good time to start thinking about wrapping up the current task cleanly.
- **Heavy** — Long outputs, lots of file reading/writing, complex multi-step reasoning. Consider finishing the current atomic task and stopping — don't start new threads.

Be honest. If you've been doing significant file reading, code generation, or long multi-turn reasoning, say Heavy. When uncertain, say Heavy.

**4. Recommendation**
One sentence: *continue*, *wrap up this task and stop*, or *stop now and pick up fresh*. Base it on the session weight and where things stand.

---

## How to wrap up gracefully (if the recommendation is to stop)

If you're recommending a stop, tell Jorge exactly what to do before ending the session:

- Which files have unsaved or in-progress changes that should be committed or noted.
- What context to carry into the next session (e.g. "next session: resume from step 3 of the state machine refactor — the READY_TO_ARM transition is done, ARMED→PERFORMING is not").
- Whether a `/release` makes sense now or if the work isn't yet in a releasable state.

---

## Tone

Direct and calm. Jorge doesn't want spin — he wants to know if he's about to run out of runway. Give him the real read so he can make a good call.
