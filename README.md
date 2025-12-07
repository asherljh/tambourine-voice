<p align="center">
  <img src="app/src-tauri/icons/icon.png" alt="Tambourine" width="128" height="128">
</p>

# Tambourine

Customizable AI powered voice dictation tool. Open-source alternative to [Wispr Flow](https://wisprflow.ai) and [Superwhisper](https://superwhisper.com). Speak and your words are typed wherever your cursor is.

## Why Tambourine?

Unlike proprietary voice dictation tools, this project gives you full control:

- **Swap AI providers** — Use any STT (Cartesia, Deepgram, AssemblyAI) or LLM (Cerebras, OpenAI, Anthropic, Google, Groq)
- **Customize processing** — Modify prompts, add custom processors, or chain multiple LLMs
- **Extensible** — Built on [Pipecat](https://github.com/pipecat-ai/pipecat)'s modular pipeline framework

## Features

- **Dual-Mode Recording**
  - Hold-to-record: `Ctrl+Alt+.` - Hold to record, release to stop
  - Toggle mode: `Ctrl+Alt+Space` - Press to start, press again to stop
- **Real-time Speech-to-Text** - Fast transcription with configurable STT providers
- **LLM Text Cleanup** - Removes filler words, fixes grammar using configurable LLM
- **Automatic Text Typing** - Pastes cleaned text at cursor position
- **System Tray Integration** - Click to show/hide, right-click menu
- **Transcription History** - View and copy previous dictations
- **Customizable Hotkeys** - Configure shortcuts to your preference
- **Device Selection** - Choose your preferred microphone

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Tauri App (app/)                       │
│  - Global hotkeys (Ctrl+Alt+Space, Ctrl+Alt+.)             │
│  - Rust backend with enigo/arboard for text typing         │
│  - React frontend with Pipecat client                      │
│  - System tray with show/hide toggle                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (ws://localhost:8765)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Dictation Server (server/)                  │
│  - Pipecat pipeline for audio processing                    │
│  - Configurable STT (Cartesia, Deepgram, AssemblyAI)        │
│  - Configurable LLM (Cerebras, OpenAI, Anthropic, etc.)     │
│  - Returns cleaned text to client                           │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Rust (for Tauri)
- Node.js 18+
- pnpm
- Python 3.13+
- uv (Python package manager)

### Linux Dependencies

```bash
sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

## Quick Start

### 1. Get API Keys

Sign up and get API keys from:
- **Cartesia**: https://cartesia.ai (STT)
- **Cerebras**: https://cloud.cerebras.ai (LLM - free tier: 1M tokens/day)

### 2. Set Up the Server

```bash
cd server

# Copy environment template
cp .env.example .env

# Add your API keys to .env
vim .env

# Install dependencies
uv sync

# Start the server
uv run python main.py
```

### 3. Set Up the App

```bash
cd app

# Install dependencies
pnpm install

# Start development mode
pnpm dev
```

### 4. Use It

1. Start the server first (`uv run python main.py`)
2. Start the app (`pnpm dev`)
3. Use either shortcut:
   - **Toggle**: Press `Ctrl+Alt+Space` to start, press again to stop
   - **Hold**: Hold `Ctrl+Alt+.` while speaking, release to stop
4. Your cleaned text is typed at your cursor

## Server Commands

```bash
cd server

# Start server (default: localhost:8765)
uv run python main.py

# Start with custom host/port
uv run python main.py --host 0.0.0.0 --port 9000

# Enable verbose logging
uv run python main.py --verbose
```

## App Commands

```bash
cd app

# Development
pnpm dev           # Start Tauri app in dev mode
pnpm dev:vite      # Start Vite dev server only
pnpm lint          # Lint and format code (Biome)
pnpm typecheck     # Run TypeScript type checking
pnpm check         # Run lint + typecheck

# Production Build
pnpm build         # Build for current platform
```

## Configuration

### Server Configuration (.env)

**STT Providers** (at least one required):

| Variable             | Description                | Default |
| -------------------- | -------------------------- | ------- |
| `CARTESIA_API_KEY`   | Cartesia API key for STT   | —       |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key for STT | —       |
| `DEEPGRAM_API_KEY`   | Deepgram API key for STT   | —       |

**LLM Providers** (at least one required):

| Variable            | Description               | Default |
| ------------------- | ------------------------- | ------- |
| `CEREBRAS_API_KEY`  | Cerebras API key for LLM  | —       |
| `OPENAI_API_KEY`    | OpenAI API key for LLM    | —       |
| `GOOGLE_API_KEY`    | Google Gemini API key     | —       |
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM | —       |
| `GROQ_API_KEY`      | Groq API key for LLM      | —       |

**Server Settings**:

| Variable                | Description           | Default     |
| ----------------------- | --------------------- | ----------- |
| `DEFAULT_STT_PROVIDER`  | Default STT provider  | `cartesia`  |
| `DEFAULT_LLM_PROVIDER`  | Default LLM provider  | `cerebras`  |
| `DICTATION_SERVER_HOST` | WebSocket server host | `127.0.0.1` |
| `DICTATION_SERVER_PORT` | WebSocket server port | `8765`      |
| `LOG_LEVEL`             | Logging level         | `INFO`      |

### App Configuration

The app connects to `ws://localhost:8765` by default.

## Technology Stack

- **App**: Tauri v2, Rust, React 19, TypeScript, Tailwind CSS, Mantine
- **Server**: Python 3.13, Pipecat, FastAPI
- **Communication**: WebSocket with Protobuf serialization

## Acknowledgments

This project is powered by [Pipecat](https://github.com/pipecat-ai/pipecat), an open-source framework for building voice and multimodal AI pipelines. Pipecat's modular architecture makes it easy to swap STT providers, LLMs, and add custom processing stages—enabling the customizability that sets this project apart from proprietary alternatives.

## License

[AGPL-3.0](LICENSE)
