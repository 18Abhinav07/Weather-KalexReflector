# Orchestrator Guide for Multi-Agent Collaboration

## Purpose

This guide ensures that **multiple autonomous agents can collaborate on a shared codebase** without losing context or overwriting each other's work. It enforces disciplined planning, documentation, and transparent communication before, during, and after any code change.
follow instructions in the cip/ and the ai-requirements/ read them before starting to code.

All agents must adhere strictly to this guide when participating in development.

---

## Shared Context Management

Agents **must not operate independently** of one another. All work must flow through the shared planning and documentation lifecycle outlined below.

### 📂 `docs/` Folder — Source of Truth

Agents must use the `docs/` folder to record **all plans, decisions, changes, and issues**.

#### Subdirectories:

- `docs/future/`:  
  Store **design proposals** and **unstarted plans** here. Every task must begin by documenting its intent in this folder before any code is written.

- `docs/working/`:  
  Store **currently active work-in-progress documents** here. This should reflect the latest state of ongoing work.

- `docs/completed/`:  
  Upon task completion, move the finalized documentation here, summarizing:
  - What was changed
  - Why it was changed
  - Any trade-offs or constraints observed

- `docs/issues.md`:  
  Log all known issues that arise during agent execution. Include context, error logs, and reproduction notes.  
  If integrated with GitHub, agents **should open issues** via API when possible, tagging appropriately.

---

## Agent Task Workflow

All agents must follow this structured protocol:

### 1. Before Starting Work

- Read the current state of the `docs/` folder (especially `working/` and `issues.md`)
- Document your task intent in `docs/future/<your-task>.md`:
  - Brief description
  - Design plan
  - Affected components
  - Any questions or clarifications needed

- Wait for confirmation or feedback before proceeding (if required)

### 2. During Work

- Move your file to `docs/working/<your-task>.md`
- Update this file **continuously**:
  - Key decisions made
  - Design changes applied
  - Unexpected issues or deviations
  - Partial results, if applicable

- Log any discovered problems in `docs/issues.md`

### 3. After Completing Task

- Summarize the change in your working doc:
  - What exactly changed
  - Justification
  - Any open issues left
- Move the document to `docs/completed/<your-task>.md`
- Clean up stale or outdated entries from `docs/working/` or `docs/future/`

---

## Operational Rules & Constraints

Agents **must** follow these rules strictly:

- **Never run `npm build`, deploy, or execute test pipelines.**  
  Only the **human reviewer** is authorized to run and validate agent code.

- **Never modify external state or perform irreversible actions.**  
  Always simulate and document side effects instead of performing them.

- **Log all issues in `docs/issues.md` or open a GitHub issue if API access is available.**  
  Tag issues with source task, filename, and brief description.

- **Never assume implicit knowledge.**  
  Always document what you are doing and why.

- **No silent commits.**  
  All changes must be accompanied by a documentation update describing:
  - Intent
  - Effect
  - Open questions (if any)

---

## Review and Merge Process

- Agents do not merge to main/trunk directly.
- All work must go through a documentation-first process and await human validation.
- PRs or code changes that lack corresponding documentation in `docs/completed/` will be rejected.

---

## Guidelines Summary

- Plan before coding
- Document as you go
- Commit only after documenting intent and results
- Coordinate changes, never overwrite each other
- Follow development phase principles if applicable (see `orchestrator_guide.md`, `phase_guides/`)

---

## Rules 
- use logger.info only for informative logs.
- use string formatter with json.stringfy instead of passing object in logs as argument 

---

**Enforcement Note**:  
Non-compliant agents will be disabled or rolled back. This environment requires structured, auditable, and collaborative agent behavior at all times.
