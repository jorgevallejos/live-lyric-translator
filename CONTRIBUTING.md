# Development Workflow

This project follows strict **Red → Green → Refactor** development.

## Process

1. Define the expected behavior.
2. Write failing tests first.
3. Do not modify production code until tests fail for the correct reason.
4. Implement the smallest change needed to pass tests.
5. Refactor only after tests are green.
6. Refactoring must not change behavior.
7. Commit only when tests are green.

## Testing Philosophy

- Prefer **behavior tests** over implementation-detail tests.
- Extract **pure functions** when logic becomes difficult to test.
- Do not mix feature work, bug fixes, and refactoring in the same step unless explicitly requested.
- If a change is too large, break it into smaller Red → Green → Refactor iterations.

Every development cycle should follow:

Expected behavior → Red → Green → Refactor → Summary