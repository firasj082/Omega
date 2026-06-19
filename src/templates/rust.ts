import type { RuleBlock } from "../types";

export const rustTemplate: RuleBlock[] = [
  {
    id: "rust-overview",
    type: "section",
    title: "Project Overview",
    content:
      "This is a Rust project. Follow idiomatic Rust patterns and leverage the type system fully.",
    order: 0,
  },
  {
    id: "rust-structure",
    type: "file-structure",
    title: "File Structure",
    content: `src/
  main.rs or lib.rs  → Entry point
  bin/               → Additional binaries
  modules/           → Feature modules
tests/               → Integration tests
benches/             → Benchmarks`,
    order: 1,
  },
  {
    id: "rust-style",
    type: "section",
    title: "Code Style",
    content: `- Run \`cargo fmt\` and \`cargo clippy\` before committing.
- Prefer Result<T, E> over panics in library code.
- Use \`?\` operator for error propagation.
- Document public APIs with /// doc comments.
- Minimize unsafe blocks. Justify any usage.`,
    order: 2,
  },
  {
    id: "rust-ignore",
    type: "ignore-patterns",
    title: "Ignore Patterns",
    content: `target/
Cargo.lock (for libraries)
*.env*`,
    order: 3,
  },
];
