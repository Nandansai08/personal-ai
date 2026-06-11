# Security Policy

## Reporting a Vulnerability

Open a private security advisory on GitHub (Security → Advisories → Report a vulnerability)
or email the maintainer. Please do not open public issues for vulnerabilities.

## Security Model

PersonalAI is a **local, single-user** assistant. The threat model assumes the
machine owner is the only user.

### Web UI

- The web server binds to `127.0.0.1` only — it is never reachable from the LAN.
- Every `/api` request and WebSocket connection requires a per-session bearer
  token (printed in the launch URL; constant-time compared). Set
  `WEB_AUTH_TOKEN` for a stable token across restarts.
- All HTTP requests are validated against the `Host` header (blocks DNS rebinding).
- WebSocket connections are rejected unless the `Origin` is localhost (blocks
  cross-site WebSocket hijacking from malicious websites).
- JSON request bodies are capped at 256 KB.
- **Remote access is intentionally unsupported.** If you need it, put an
  authenticating reverse proxy (Caddy, nginx + auth) in front — and understand
  you are exposing an assistant with file-read and memory-write tools.

### Tools

- `file_reader` is restricted to allowed roots (default: home directory + cwd;
  configurable via `FILE_READER_ROOTS`). Credential files (`.env`, SSH keys,
  `.pem`/`.key`, shell history) and sensitive directories (`.ssh`, `.aws`,
  `.gnupg`, …) are always denied, including via symlinks.
- `calculator` evaluates against a strict numeric-only character allowlist.
- Web search results are untrusted input. Memories injected into the system
  prompt are framed as data, not instructions, to reduce persistent
  prompt-injection risk — but no mitigation is complete. Review what the
  assistant saves with `/memory list`.

### Secrets

- API keys live in `.env` (gitignored) and are sent only in request headers,
  never URL query strings.
- The `file_reader` tool cannot read `.env` files.

## Known Limitations

- The CLI prompts y/N before each `file_reader` call; the web UI currently
  runs it unconfirmed (a confirmation UI is planned).
- Memory content is stored unencrypted in `~/.personal-ai/memory.db`.
