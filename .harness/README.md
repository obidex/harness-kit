# .harness — the kit's shared content

Installed in each project as a pinned copy (K001). Layers, not systems:

| Layer | File | Loaded? |
|---|---|---|
| Core: stages, lifecycle, evidence, scope, handovers, failure, verification | `core.md` | Every session (`@` import in `CLAUDE.md`) |
| Owner defaults: how agents work with the owner | `owner-defaults.md` | Every session |
| Project profile: stack, commands, branches, checks, environments, modules, rules, permissions, capabilities, exceptions | `profile.json` (project-owned), shape in `profile.schema.json` | Read on demand |
| Capabilities: rules per capability | `capabilities.md` | Lookup |
| Presets: named sets of capabilities | `presets/web-app.md`, `presets/public-website.md` | Lookup |
| Platform adapter: Claude Code + GitHub loading, limits, lessons | `adapters/claude-code-github.md` | Lookup |
| Rule catalogue: applies when, outcome, source, verification per ID | `catalogue/` | Lookup |
| Rules left to projects, and conflicts | `project-specific.md` | Lookup |

`VERSION` is the kit version a project pins; cards record it. Only presets in use are built;
others are defined when a real project needs them, by what makes them different (K001).
