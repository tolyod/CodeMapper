# CodeMapper C4 - Architecture Diagram Generator

CodeMapper is a utility that iteratively scans your codebase and uses Google's Gemini LLM (or compatible APIs like OpenAI/Ollama) to generate a C4 Component diagram using Mermaid.js syntax. It understands the context of your application by processing it file-by-file.

It supports two modes:
1. **Web Interface:** Interactive visualization, real-time diagram updates, and easy file selection.
2. **CLI Utility:** Headless batch processing for local development or CI/CD pipelines.

**Supported Languages:** JavaScript, TypeScript, Python, PHP, Go, Java.

---

## Prerequisites

- **Node.js** (v18 or higher)
- **API Key:** Google Gemini, OpenAI, or a local Ollama instance.

---

## 1. Installation

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd codemapper
npm install
```

---

## 2. CLI Usage (Headless)

The CLI is perfect for scanning local projects without opening a browser. It maintains a state file, allowing you to stop and resume scans at any time.

### Configuration (`.env`)

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure your provider variables in `.env`:

#### Option A: Google Gemini (Default)
```ini
LLM_PROVIDER=google
API_KEY=AIzaSy...
MODEL_NAME=gemini-2.5-flash
```

#### Option B: Local Ollama (Free)
Run `ollama serve` locally first.
```ini
LLM_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:11434/v1
MODEL_NAME=llama3
API_KEY=ollama
```

#### Option C: OpenAI / Compatible
```ini
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
API_KEY=sk-...
MODEL_NAME=gpt-4o
```

### Running the Scan

Run the `cli` script and pass the absolute or relative path to the project you want to scan:

```bash
npm run cli -- /path/to/your/project
```

**Example:**
```bash
npm run cli -- ./src
```

### Output

The CLI generates two files in the current directory:
- `diagram.mmd`: The generated Mermaid C4 diagram code (Overview).
- `codemapper_state.json`: Keeps track of processed files and stores all diagram modules.

---

## 3. Web Interface Usage

The web interface provides a rich visual experience with a live terminal and diagram renderer.

### Starting the App

```bash
npm start
```
Open [http://localhost:1234](http://localhost:1234) (or the port shown in your terminal).

### Using the App

1. **Select Project:** Click the **Open Project Directory** button and select your code folder.
2. **Settings:** Click the **Gear Icon** to configure:
   - Provider (Google vs OpenAI/Local).
   - Batch size (Optimization).
3. **Start Scan:** Click the **Start** button in the left panel.
4. **Interactive Processing:**
   - Watch the **File List** update in real-time.
   - The **Diagram View** supports multiple tabs (Overview vs Modules).
5. **Save/Load:**
   - Use the **Save** icon in the header to download a JSON snapshot of your progress.
   - Use the **Upload** icon to restore a previous session.

---

## Troubleshooting

**CLI: "API_KEY not found"**
Ensure you have created a `.env` file in the root of the CodeMapper directory and defined `API_KEY` (even if dummy for Ollama).

**Mermaid Render Errors**
If the diagram becomes too complex, Mermaid might fail to render in the browser. The CLI/JSON state always saves the valid text code.

**Ollama Connection**
If using the Web Interface with Ollama, you must enable CORS:
```bash
OLLAMA_ORIGINS="*" ollama serve
```
