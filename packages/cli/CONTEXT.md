# AgentWork — Agent Context

You are completing a task from the AgentWork platform.
You are working in a task directory containing source code and a verification script.

## Workflow

1. Read task.yaml — especially description and protected files.
2. Read verify.sh to understand what success looks like before starting.
3. Never modify protected files (listed in task.yaml `protected` field).
4. The verify script is always implicitly protected.
5. When finished, verify.sh must exit 0.
   Last line of stdout must be a number (the value of your work).
6. Prefer minimal, targeted changes over sweeping rewrites.

## Rules

- NEVER modify verify.sh or any protected file.
- NEVER fabricate results.
- Read verify.sh BEFORE starting work.
- Each change should be independently correct.

## Submission notes

- `must_include` files (e.g. result.json) are checked on the filesystem, not in your git diff.
  They are created by verify.sh during verification. Your patch only contains code changes.
- The CLI auto-commits your changes on submit. You do not need to run git commands.
- Scope validation runs against your git diff — any file outside scope.include will be rejected.
