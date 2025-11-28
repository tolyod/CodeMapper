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

const INITIAL_MERMAID = `C4Context
    title System Context Diagram
    
    Container_Boundary(system, "System Scope") {
        System(core_app, "Core Application", "The main software system being analyzed")
    }
`;

interface State {
  processedFiles: string[];
  mermaid: string;
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

async function generateC4UpdateCLI(
  currentMermaid: string,
  files: {name: string, content: string}[],
  projectTree: string,
  config: { provider: string, apiKey: string, modelName: string, baseUrl?: string }
): Promise<string> {
  
  const filesBlock = files.map(f => `
    --- FILE START: ${f.name} ---
    ${f.content.slice(0, 20000)}
    --- FILE END ---
  `).join('\n');

  const systemPrompt = `
    You are an expert Software Architect specializing in C4 Model architecture diagrams using Mermaid JS syntax.
    
    We are incrementally building a C4 Component diagram for a codebase.

    CONTEXT:
    Here is the directory structure of the project to help you understand where the files fit in:
    \`\`\`text
    ${projectTree}
    \`\`\`
    
    Current State of Mermaid Diagram:
    \`\`\`mermaid
    ${currentMermaid}
    \`\`\`

    TASK:
    1. Analyze the provided BATCH OF FILES.
    2. Identify significant Components, Controllers, Services, Repositories, or External System interactions in ALL provided files.
    3. Update the Mermaid diagram to include new components found in these files.
    4. Add relationships (Rel) based on imports, dependency injection, or API calls.
    5. Maintain existing nodes. Do not remove them unless they are clearly erroneous based on these new files.
    6. Group components into the "Software System" container boundary if appropriate.
    
    OUTPUT FORMAT:
    Return ONLY the raw Mermaid code. Do not wrap it in markdown code blocks.
  `;

  const userPrompt = `
    I am providing you with a BATCH of ${files.length} new files from the codebase.
    
    FILES CONTENT:
    ${filesBlock}
  `;

  if (config.provider === 'google') {
      const ai = new GoogleGenAI({ apiKey: config.apiKey });
      const response = await ai.models.generateContent({
        model: config.modelName,
        contents: systemPrompt + "\n" + userPrompt,
        config: { temperature: 0.2 }
      });
      return cleanOutput(response.text || '');

  } else {
      // OpenAI / Local Compatible
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
      return cleanOutput(data.choices?.[0]?.message?.content || '');
  }
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
  
  console.log(`${colors.cyan}CodeMapper CLI v1.2 (Smart Batching)${colors.reset}`);
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
    mermaid: INITIAL_MERMAID
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
  
  // Filter out already processed files first
  const remainingFiles = allFiles.filter(f => !state.processedFiles.includes(path.relative(targetDir, f)));

  let i = 0;
  while (i < remainingFiles.length) {
    // Construct Batch
    const batchPaths: string[] = [];
    let currentBatchSize = 0;
    
    while(i < remainingFiles.length && batchPaths.length < BATCH_COUNT_LIMIT) {
        const filePath = remainingFiles[i];
        const relativePath = path.relative(targetDir, filePath);
        const stat = fs.statSync(filePath);

        // Skip large files check
        if (stat.size > MAX_FILE_SIZE) {
            console.log(`${colors.gray}[SKIP] ${relativePath} (Too large: ${(stat.size/1024).toFixed(1)}KB)${colors.reset}`);
            state.processedFiles.push(relativePath);
            i++;
            continue;
        }

        // Batch size limit check
        if (currentBatchSize + stat.size > BATCH_SIZE_LIMIT && batchPaths.length > 0) {
            break; // Batch full
        }

        batchPaths.push(relativePath);
        currentBatchSize += stat.size;
        i++;
    }

    if (batchPaths.length === 0) continue; // Should not happen unless all remaining are skipped large files

    (process as any).stdout.write(`${colors.cyan}[BATCH] Processing ${batchPaths.length} files (${batchPaths[0]}...)... ${colors.reset}`);

    try {
      const fileInputs = batchPaths.map(p => ({
          name: p,
          content: fs.readFileSync(path.join(targetDir, p), 'utf-8')
      }));

      const updatedMermaid = await generateC4UpdateCLI(
        state.mermaid,
        fileInputs,
        projectTree,
        config
      );

      state.mermaid = updatedMermaid;
      state.processedFiles.push(...batchPaths);
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      fs.writeFileSync(OUTPUT_FILE, state.mermaid);

      (process as any).stdout.write(`${colors.green}DONE${colors.reset}\n`);
      processedCount += batchPaths.length;

      // Small delay
      await new Promise(r => setTimeout(r, 200));

    } catch (err: any) {
      (process as any).stdout.write(`${colors.red}FAILED${colors.reset}\n`);
      console.error(`${colors.red}  Error: ${err.message}${colors.reset}`);
      // Don't add to processedFiles state, so they retry next time
    }
  }

  console.log(`\n${colors.green}----------------------------------------${colors.reset}`);
  console.log(`${colors.green}Completed!${colors.reset}`);
  console.log(`Processed: ${processedCount} new files.`);
  console.log(`Diagram saved to: ${colors.yellow}${path.resolve(OUTPUT_FILE)}${colors.reset}`);
}

main();