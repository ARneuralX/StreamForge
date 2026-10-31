# StreamForge project rules

- Keep secrets in `.env`; never read, print, or commit that file.
- Follow `CODEX-MASTER-RUN.md` and the phase specs in order. Never start Phase 5.
- Preserve the sandboxed widget model, network-blocking CSP, static scans, mock mounts, rollback, and path/username redaction.
- Use mock or replay mode for development. Do not run real Codex builds or real Twitch traffic.
- Keep `PROGRESS.md` truthful and commit at the checkpoints required by the run instructions.
