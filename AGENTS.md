# Project
Mini CRM for construction projects.
Stack: React, TypeScript, Vite, Supabase, PostgreSQL.

## Workflow
- Implement only the explicitly requested stage.
- Do not start subsequent stages.
- Prefer minimal, maintainable solutions.
- Do not add abstractions without a concrete need.
- Keep all database changes in versioned SQL migrations.
- Never expose Supabase secret/service_role keys to the client.
- Never rely on frontend checks for authorization.
- Do not weaken RLS to make a feature work.
- Do not silently change agreed business rules.
- Ask before making decisions that contradict the specification.

## Quality gates
- Run typecheck, lint, tests and build when configured.
- Add automated tests for relevant business rules.
- Document required manual smoke checks.
- Report commands executed and their results.
- Do not claim that a test passed if it was not run.

## Stage completion
At the end of each stage:
1. Summarize implemented changes.
2. List changed files.
3. Report verification results.
4. Provide manual smoke instructions.
5. List known limitations.
6. Stop and wait for approval.

Do not commit or deploy without explicit instruction.
