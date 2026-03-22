## Project Overview
Local workspace to bootstrap OpenMAIC with docs and checks.

## Tech Stack
- Git
- Node.js + pnpm (upstream)

## Directory Structure
```
.agents/
.claude/
.codex/
docs/
openmaic/
tasks/
tools/
```

## Modules
| Module | Path | Responsibility |
|:--|:--|:--|
| Codex workflows | .codex/ | Project workflows and templates |
| Claude compatibility | .claude/ | Legacy configuration |
| Agent skills | .agents/ | Local skills and references |
| Reference materials | tools/????/ | Read-only reference notes |
| OpenMAIC upstream | openmaic/OpenMAIC-main/ | Upstream source (runtime) |
| OpenMAIC tracked copy | openmaic_src/ | Tracked source copy (for git) |

## Dev Notes
- Install: `pnpm install` in `openmaic/OpenMAIC-main`
- Checks: `pnpm lint`, `pnpm check`

## Current Task

## Recent Changes

