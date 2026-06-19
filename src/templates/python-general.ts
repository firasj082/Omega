import type { RuleBlock } from "../types";

export const pythonGeneralTemplate: RuleBlock[] = [
  {
    id: "python-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Python project. Follow PEP 8 and use type hints throughout.",
    order: 0,
  },
  {
    id: "python-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/           → Application source code
tests/         → Test suite
scripts/       → Utility and maintenance scripts
requirements.txt or pyproject.toml → Dependencies`,
    order: 1,
  },
  {
    id: "python-style",
    type: "section",
    title: "Code Style",
    content: `- Type hints on all public functions.
- Follow PEP 8 naming conventions.
- Use virtual environments. Never commit .venv/.
- Docstrings on public classes and functions.
- Prefer pathlib over os.path for file operations.`,
    order: 2,
  },
  {
    id: "python-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `__pycache__/
.venv/
venv/
*.pyc
.env*
.pytest_cache/
.mypy_cache/`,
    order: 3,
  },
];
