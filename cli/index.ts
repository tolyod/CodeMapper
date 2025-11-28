import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

// Configuration
const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.php', '.go', '.java'];
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.idea', '.vscode'];
const MAX_FILE_SIZE = 100 * 1024; // 100KB max file size
const BATCH_SIZE_LIMIT = 50 * 1024; // 50KB limit per batch
const BATCH_COUNT_LIMIT = 5;        // Max 5 files per batch
const STATE_FILE = 'codemapper_state.json';
const OUTPUT_FILE = 'diagram.mmd';

const OVERVIEW_DIAGRAM_KEY = 'System Overview';
const INITIAL_OVERVIEW_MERMAID = `C4Context
    title System Context Diagram (Overview)
    
    Container_Boundary(system, "System Scope") {
        System(core_app, "Core Application", "The main software system being analyzed")
    }
`;

interface State {
  processedFiles: string[];
  diagrams: Record<string, string>;
}

interface C4UpdateResult {
  overviewDiagram: string;
  moduleDiagram: string;
  moduleName: string;
}

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m"
};

/**
 * Recursive file scanner
 */
function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) {
        scanDirectory(filePath, fileList);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

/**
 * Build ASCII tree from file paths
 */
function buildTreeString(paths: string[]): string {
  const root: any = {};
  
  paths.forEach(p => {
    const parts = p.split(path.sep);
    let current = root;
    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = i === parts.length - 1 ? null : {};
      }
      current = current[part];
    });
  });

  const lines: string[] = [];
  const printNode = (node: any, prefix: string = '') => {
    const keys = Object.keys(node).sort();
    keys.forEach((key, index) => {
      const isLastItem = index === keys.length - 1;
      const connector = isLastItem ? '└── ' : '├── ';
      lines.push(`${prefix}${connector}${key}`);
      
      if (node[key] !== null) {
        const childPrefix = prefix + (isLastItem ? '    ' : '│   ');
        printNode(node[key], childPrefix);
      }
    });
  };

  printNode(root);
  return lines.join('\n');
}

function getModuleName(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length <= 1) return 'root';
    return parts.slice(0, parts.length - 1).join('/');
}

async function generateC4UpdateCLI(
  currentOverview: string,
  currentModule: string | null,
  files: {name: string, content: string}[],
  projectTree: string,
  config: { provider: string, apiKey: string, modelName: string, baseUrl?: string }
): Promise<C4UpdateResult> {
  
  // Primary module for this batch
  const primaryModule = getModuleName(files[0].name);

  const filesBlock = files.map(f => `
    --- FILE START: ${f.name} ---
    ${f.content.slice(0, 20000)}
    --- FILE END ---
  `).join('\n');

  const systemPrompt = `
    You are an expert Software Architect specializing in C4 Model architecture diagrams using Mermaid JS syntax.
    
    We are incrementally building a complete C4 notation for a project. We need TWO outputs per request:
    
    1. **Overview Diagram (Context & Container Level):**
       - High-level view showing Systems, Containers (Apps, Microservices, Databases), and External Systems.
       - NO granular classes or components.
       - Syntax: C4Context or C4Container.

    2. **Module Diagram (Component Level) for folder '${primaryModule}':**
       - Detailed view for the specific module/folder currently being scanned.
       - Shows internal Components, Services, Controllers, and Classes within this folder.
       - Syntax: C4Component.

    CONTEXT:
    Project Structure:
    \`\`\`text
    ${projectTree}
    \`\`\`
    
    Current 'Overview' Diagram:
    \`\`\`mermaid
    ${currentOverview}
    \`\`\`

    Current 'Module: ${primaryModule}' Diagram:
    \`\`\`mermaid
    ${currentModule || `C4Component\n    title Component Diagram - ${primaryModule}\n    Container_Boundary(${primaryModule.replace(/[\W_]+/g,'_')}, "${primaryModule}") {\n    }`}
    \`\`\`

    TASK:
    1. Analyze the BATCH OF FILES.
    2. Update the **Overview** if you find new high-level containers (e.g. new database connection, external API usage, or distinct microservice).
    3. Update the **Module Diagram** with specific components found in these files.
    4. Maintain valid Mermaid syntax.
    
    OUTPUT FORMAT:
    You MUST use these specific separators:
    <<<OVERVIEW>>>
    ... mermaid code for overview ...
    <<<MODULE>>>
    ... mermaid code for module ...
    <<<END>>>
  `;

  const userPrompt = `
    I am providing you with a BATCH of ${files.length} new files from the codebase (Module: ${primaryModule}).
    
    FILES CONTENT:
    ${filesBlock}
  `;

  let rawOutput = '';

  if (config.provider === 'google') {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: config.modelName,
        contents: systemPrompt + "\n" + userPrompt,
        config: { temperature: 0.2 }
      });
      rawOutput = cleanOutput(response.text || '');

  } else {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      
      const headers: any = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${await response.text()}`);
      }

      const data: any = await response.json();
      rawOutput = cleanOutput(data.choices?.[0]?.message?.content || '');
  }

  const overviewMatch = rawOutput.match(/<<<OVERVIEW>>>([\s\S]*?)(?=<<<MODULE>>>|$)/);
  const moduleMatch = rawOutput.match(/<<<MODULE>>>([\s\S]*?)(?=<<<END>>>|$)/);

  return {
      overviewDiagram: overviewMatch ? cleanMermaid(overviewMatch[1]) : currentOverview,
      moduleDiagram: moduleMatch ? cleanMermaid(moduleMatch[1]) : (currentModule || ''),
      moduleName: primaryModule
  };
}

function cleanOutput(text: string): string {
    return text.replace(/^```mermaid\n/, '').replace(/^```\n/, '').replace(/```$/, '').trim();
}

async function main() {
  const targetDir = (process as any).argv[2];

  if (!targetDir) {
    console.error(`${colors.red}Error: Please provide a directory path to scan.${colors.reset}`);
    console.log(`Usage: npm run cli -- /path/to/your/project`);
    (process as any).exit(1);
  }

  // --- CONFIG LOAD ---
  const provider = process.env.LLM_PROVIDER || 'google';
  const apiKey = process.env.API_KEY || '';
  const modelName = process.env.MODEL_NAME || (provider === 'google' ? 'gemini-2.5-flash' : 'llama3');
  const baseUrl = process.env.OPENAI_BASE_URL;

  if (provider === 'google' && !apiKey) {
    console.error(`${colors.red}Error: API_KEY not found in .env file (required for Google provider).${colors.reset}`);
    (process as any).exit(1);
  }

  const config = { provider, apiKey, modelName, baseUrl };
  
  console.log(`${colors.cyan}CodeMapper CLI v2.0 (Multi-View C4)${colors.reset}`);
  console.log(`${colors.gray}Target Directory: ${targetDir}${colors.reset}`);
  console.log(`${colors.gray}Provider: ${provider} | Model: ${modelName}${colors.reset}`);

  // 1. Scan Files
  console.log(`Scanning files...`);
  if (!fs.existsSync(targetDir)) {
    console.error(`${colors.red}Directory does not exist.${colors.reset}`);
    (process as any).exit(1);
  }
  const allFiles = scanDirectory(targetDir);
  console.log(`${colors.green}Found ${allFiles.length} supported files.${colors.reset}\n`);

  const relativePaths = allFiles.map(f => path.relative(targetDir, f));
  const projectTree = buildTreeString(relativePaths);

  // 2. Load State
  let state: State = {
    processedFiles: [],
    diagrams: { [OVERVIEW_DIAGRAM_KEY]: INITIAL_OVERVIEW_MERMAID }
  };

  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      state = JSON.parse(raw);
      console.log(`${colors.yellow}Resuming from previous state (${state.processedFiles.length} files processed).${colors.reset}\n`);
    } catch (e) {
      console.warn(`${colors.yellow}Could not parse existing state file. Starting fresh.${colors.reset}`);
    }
  }

  // 3. Process Loop (Batched)
  let processedCount = 0;
  
  const remainingFiles = allFiles.filter(f => !state.processedFiles.includes(path.relative(targetDir, f)));

  let i = 0;
  while (i < remainingFiles.length) {
    // Construct Batch
    const batchPaths: string[] = [];
    let currentBatchSize = 0;
    let currentBatchDir: string | null = null;
    
    while(i < remainingFiles.length && batchPaths.length < BATCH_COUNT_LIMIT) {
        const filePath = remainingFiles[i];
        const relativePath = path.relative(targetDir, filePath);
        const stat = fs.statSync(filePath);

        // Check folder consistency
        const fileDir = path.dirname(relativePath);
        if (currentBatchDir === null) currentBatchDir = fileDir;
        else if (currentBatchDir !== fileDir && batchPaths.length > 0) break; // Break batch if folder changes

        if (stat.size > MAX_FILE_SIZE) {
            console.log(`${colors.gray}[SKIP] ${relativePath} (Too large: ${(stat.size/1024).toFixed(1)}KB)${colors.reset}`);
            state.processedFiles.push(relativePath);
            i++;
            continue;
        }

        if (currentBatchSize + stat.size > BATCH_SIZE_LIMIT && batchPaths.length > 0) {
            break; 
        }

        batchPaths.push(relativePath);
        currentBatchSize += stat.size;
        i++;
    }

    if (batchPaths.length === 0) continue; 

    const batchDirName = currentBatchDir || 'root';
    (process as any).stdout.write(`${colors.cyan}[BATCH] ${batchDirName} (${batchPaths.length} files)... ${colors.reset}`);

    try {
      const fileInputs = batchPaths.map(p => ({
          name: p,
          content: fs.readFileSync(path.join(targetDir, p), 'utf-8')
      }));

      const currentOverview = state.diagrams[OVERVIEW_DIAGRAM_KEY];
      const currentModule = state.diagrams[batchDirName] || null;

      const result = await generateC4UpdateCLI(
        currentOverview,
        currentModule,
        fileInputs,
        projectTree,
        config
      );

      state.diagrams[OVERVIEW_DIAGRAM_KEY] = result.overviewDiagram;
      state.diagrams[batchDirName] = result.moduleDiagram;
      state.processedFiles.push(...batchPaths);
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      // Save just the overview as the main artifact, or potentially a README
      fs.writeFileSync(OUTPUT_FILE, state.diagrams[OVERVIEW_DIAGRAM_KEY]);

      (process as any).stdout.write(`${colors.green}DONE${colors.reset}\n`);
      processedCount += batchPaths.length;

      // Small delay
      await new Promise(r => setTimeout(r, 200));

    } catch (err: any) {
      (process as any).stdout.write(`${colors.red}FAILED${colors.reset}\n`);
      console.error(`${colors.red}  Error: ${err.message}${colors.reset}`);
    }
  }

  console.log(`\n${colors.green}----------------------------------------${colors.reset}`);
  console.log(`${colors.green}Completed!${colors.reset}`);
  console.log(`Processed: ${processedCount} new files.`);
  console.log(`Overview Diagram: ${colors.yellow}${path.resolve(OUTPUT_FILE)}${colors.reset}`);
  console.log(`Full State (All Modules): ${colors.yellow}${path.resolve(STATE_FILE)}${colors.reset}`);
}

main();