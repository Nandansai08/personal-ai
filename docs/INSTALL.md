# Install troubleshooting

PersonalAI runs from `npx @nandansai08/personal-ai` on Node.js 20 or newer. If the quick start fails, use the checks below before opening an issue.

## macOS

### "ollama.app is damaged" or Gatekeeper blocks Ollama

This usually affects the optional local model setup, not PersonalAI itself. Open **System Settings -> Privacy & Security** and allow Ollama, or remove the quarantine flag if you trust the download:

```bash
xattr -dr com.apple.quarantine /Applications/Ollama.app
```

Then start Ollama again:

```bash
ollama serve
```

### `node-gyp` or `xcrun` fails while npm installs native packages

Install Apple's command line tools and retry the command:

```bash
xcode-select --install
npx @nandansai08/personal-ai
```

### `EACCES` while npm writes global cache files

Avoid `sudo npm`. Use a user-scoped Node install from `nvm`, `fnm`, or Volta, then clear the bad cache owner if needed:

```bash
sudo chown -R "$USER" ~/.npm
node --version
npx @nandansai08/personal-ai
```

## Linux

### SELinux denies access to `~/.personal-ai`

Keep PersonalAI's state directory under your home directory when possible. If SELinux labels drift after copying files between machines, restore them:

```bash
restorecon -Rv ~/.personal-ai
npx @nandansai08/personal-ai
```

If the denial persists, inspect the audit log and share the relevant denial in the issue:

```bash
sudo ausearch -m avc -ts recent
```

### Native dependency build fails with `g++`, `make`, or `python` missing

Most users receive prebuilt packages, but some Linux distributions fall back to local compilation. Install the base build tools and retry:

```bash
# Debian / Ubuntu
sudo apt-get update
sudo apt-get install -y build-essential python3

# Fedora
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3
```

### Ollama is installed but PersonalAI cannot reach it

Confirm the local Ollama server is running on the default port:

```bash
ollama serve
curl http://localhost:11434/api/tags
```

If you run Ollama on another host or port, set `OLLAMA_BASE_URL` in `.env` or `~/.personal-ai/.env`.

## Windows

### Windows ARM64 cannot install `better-sqlite3`

Windows ARM64 may not have a native prebuild for every Node.js version. The most reliable workaround is to run PersonalAI from WSL2 and follow the Linux steps:

```powershell
wsl --install
```

Then open the Linux shell and run:

```bash
npx @nandansai08/personal-ai
```

If you need native Windows, try the current x64 Node.js release under emulation or install Microsoft C++ Build Tools so npm can compile native packages.

### PowerShell says running scripts is disabled

Use `cmd.exe` for the first run, or allow user-scoped signed scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
npx @nandansai08/personal-ai
```

### `ollama` is not recognized

Install Ollama from the Windows installer, then open a new terminal so `PATH` updates:

```powershell
winget install Ollama.Ollama
ollama pull qwen2.5:14b
ollama pull gemma3:12b
npx @nandansai08/personal-ai
```

## Still stuck?

Include these details when opening an issue:

```bash
node --version
npm --version
npx @nandansai08/personal-ai --version
```

Also include your OS version, CPU architecture, the provider you are trying to use, and the full error message.
