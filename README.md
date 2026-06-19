# ContextCraft

A desktop application that detects your project type and generates structured AI rules files (CLAUDE.md, .cursorrules, .clinerules) for AI coding tools.

## Features

- **Automatic project detection** — Scans root-level files to identify Next.js, React+Vite, Vue, Python, Rust, Go, and more
- **Block-based editor** — Compose rules from draggable, editable blocks
- **Multiple output formats** — Generate files for Claude, Cursor, or Cline
- **Saved loadouts** — Built-in templates plus custom loadouts persisted locally
- **Native desktop** — Built with Tauri 2 for lightweight, native file access

## Tech Stack

- Tauri 2.x + Rust
- React 18+ / TypeScript (strict)
- Vite + Tailwind CSS v4
- Zustand + @tauri-apps/plugin-store
- @dnd-kit for drag-and-drop

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Development

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Usage

1. **Home** — Select a project folder; ContextCraft detects the type and suggests loadouts
2. **Editor** — Customize rule blocks, choose output target (Claude / Cursor / Cline), generate the file
3. **Loadouts** — Manage built-in and custom loadouts

Keyboard shortcut: `Ctrl+S` (or `Cmd+S` on macOS) to generate the output file from the editor.

## Project Structure

See `CURSOR_PROJECT_PROMPT.md` for the full architecture and development guide.
