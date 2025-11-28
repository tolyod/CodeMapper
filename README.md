# CodeMapper C4 - Architecture Diagram Generator

CodeMapper is a utility that iteratively scans your codebase and uses Google's Gemini LLM to generate a C4 Component diagram using Mermaid.js syntax. It understands the context of your application by processing it file-by-file.

It supports two modes:
1. **Web Interface:** Interactive visualization, real-time diagram updates, and easy file selection.
2. **CLI Utility:** Headless batch processing for local development or CI/CD pipelines.

**Supported Languages:** JavaScript, TypeScript, Python, PHP, Go, Java.

---

## Prerequisites

- **Node.js** (v18 or higher)
- **Google Gemini API Key** (Get one at [aistudio.google.com](https://aistudio.google.com))

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

### Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste your API Key:
   ```ini
   API_KEY=AIzaSy...
   MODEL_NAME=gemini-2.5-flash
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
- `diagram.mmd`: The generated Mermaid C4 diagram code.
- `codemapper_state.json`: Keeps track of processed files to allow resuming.

To view the `diagram.mmd` file, you can use the [Mermaid Live Editor](https://mermaid.live) or the "Mermaid Preview" extension in VS Code.

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
2. **API Key:** 
   - If running in Project IDX, the key is handled automatically.
   - If running locally, you may need to click "Select Google API Key" if not provided in env.
3. **Start Scan:** Click the **Start** button in the left panel.
4. **Interactive Processing:**
   - Watch the **File List** update in real-time.
   - If a file fails (e.g., API timeout), click the **Retry** button next to the filename.
   - The **Terminal** at the bottom shows detailed logs.
   - The **Diagram View** on the right renders the C4 diagram as it evolves.
5. **Save/Load:**
   - Use the **Save** icon in the header to download a JSON snapshot of your progress.
   - Use the **Upload** icon to restore a previous session.

---

## Troubleshooting

**CLI: "API_KEY not found"**
Ensure you have created a `.env` file in the root of the CodeMapper directory and strictly followed the format in `.env.example`.

**Mermaid Render Errors**
If the diagram becomes too complex, Mermaid might fail to render. The CLI will still save the valid text code in `diagram.mmd`. You can manually edit this file to simplify relationships if needed.

**Rate Limiting**
Gemini Flash has generous rate limits, but if you hit them, the CLI will pause or fail a file. You can simply run the command again; it will skip already processed files and retry the failed ones.
