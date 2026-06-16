# Transcript: "log yesterday's work"

A typical agent flow for logging a finished block of work against a project, using
names instead of ids. All values below are illustrative; ids come back from the
calls themselves.

## 1. Plan the change (read-only)

```json
{ "name": "clockify_plan_change", "arguments": { "goal": "log yesterday's work" } }
```

Receipt (abridged) — the plan is read-only and explains the next tools:

```json
{
  "ok": true,
  "action": "clockify_plan_change",
  "entity": "plan",
  "data": {
    "intent": "log finished work",
    "plan": [
      { "step": 1, "tool": "clockify_create_work_package", "mutates": true, "requiresConfirmation": false },
      { "step": 2, "tool": "clockify_log_work", "mutates": true, "requiresConfirmation": false }
    ]
  },
  "next": [{ "tool": "clockify_create_work_package", "reason": "First step: ..." }]
}
```

## 2. Create or reuse the work objects

```json
{ "name": "clockify_create_work_package", "arguments": { "project": "Website", "task": "Implementation", "tag": "Deep Work" } }
```

Receipt carries `changed.created`/`changed.reused` and the ids to reuse:

```json
{ "ok": true, "action": "clockify_create_work_package", "ids": { "projectId": "p1", "taskId": "t1" },
  "changed": { "reused": [{ "type": "project", "id": "p1", "name": "Website" }] },
  "next": [{ "tool": "clockify_log_work", "args": { "project_id": "p1", "task_id": "t1" } }] }
```

## 3. Log the finished entry (use the returned ids + a relative date)

```json
{ "name": "clockify_log_work", "arguments": { "project_id": "p1", "task_id": "t1",
  "description": "Implemented the import flow", "date": "yesterday",
  "start": "09:00", "end": "12:30" } }
```

Receipt: `{ "ok": true, "action": "clockify_log_work", "ids": { "entryId": "e1" },
"changed": { "created": [{ "type": "time_entry", "id": "e1" }] } }`.

To review what you logged: `clockify_review_day { "date": "yesterday" }`.
