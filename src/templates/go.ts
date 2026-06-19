import type { RuleBlock } from "../types";

export const goTemplate: RuleBlock[] = [
  {
    id: "go-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Go project. Follow standard Go project layout and idiomatic patterns.",
    order: 0,
  },
  {
    id: "go-structure",
    type: "file-structure",
    title: "File Structure",
    content: `cmd/           → Application entry points
internal/      → Private application code
pkg/           → Public library code
api/           → API definitions (OpenAPI, protobuf)
tests/         → Integration tests`,
    order: 1,
  },
  {
    id: "go-style",
    type: "section",
    title: "Code Style",
    content: `- Follow effective Go guidelines.
- Run \`go fmt\` and \`go vet\` before committing.
- Handle all errors explicitly. No ignored errors.
- Use interfaces for dependency injection.
- Table-driven tests for unit tests.`,
    order: 2,
  },
  {
    id: "go-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `vendor/
*.env*
bin/
dist/`,
    order: 3,
  },
];
