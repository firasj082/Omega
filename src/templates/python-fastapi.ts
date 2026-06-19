import type { RuleBlock } from "../types";

export const pythonFastapiTemplate: RuleBlock[] = [
  {
    id: "fastapi-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Python FastAPI application. Use async endpoints where I/O-bound operations are involved.",
    order: 0,
  },
  {
    id: "fastapi-structure",
    type: "file-structure",
    title: "File Structure",
    content: `app/
  api/         → Route handlers and routers
  models/      → Pydantic models and DB schemas
  services/    → Business logic layer
  core/        → Config, dependencies, security
tests/         → Pytest test suite`,
    order: 1,
  },
  {
    id: "fastapi-style",
    type: "section",
    title: "Code Style",
    content: `- Use type hints on all function signatures.
- Pydantic models for request/response validation.
- Dependency injection via FastAPI Depends().
- Follow PEP 8. Use ruff or black for formatting.
- Async endpoints for database and external API calls.`,
    order: 2,
  },
  {
    id: "fastapi-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `__pycache__/
.venv/
venv/
*.pyc
.env*
.pytest_cache/`,
    order: 3,
  },
];
