import { GoogleGenAI } from "@google/genai";
import { LLMConfig } from "../types";

export interface FileInput {
  name: string;
  content: string;
}

export interface C4UpdateResult {
  overviewDiagram: string;
  moduleDiagram: string;
  moduleName: string;
}

const getModuleName = (filePath: string): string => {
  const parts = filePath.split('/');
  // Use the directory of the file as the module name
  // e.g., "src/auth/Login.ts" -> "src/auth"
  // If at root, use "root"
  if (parts.length <= 1) return 'root';
  return parts.slice(0, parts.length - 1).join('/');
};

export const generateC4Update = async (
  currentOverview: string,
  currentModule: string | null,
  files: FileInput[],
  projectTree: string,
  config: LLMConfig
): Promise<C4UpdateResult> => {
  
  // Heuristic: The module name for this batch is derived from the first file.
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

  try {
    if (config.provider === 'google') {
      rawOutput = await generateWithGoogle(systemPrompt + "\n" + userPrompt, config);
    } else {
      rawOutput = await generateWithOpenAI(systemPrompt, userPrompt, config);
    }

    return parseOutput(rawOutput, currentOverview, currentModule || '', primaryModule);
  } catch (error) {
    console.error("LLM Generation Error:", error);
    throw error;
  }
};

const parseOutput = (text: string, originalOverview: string, originalModule: string, moduleName: string): C4UpdateResult => {
  const overviewMatch = text.match(/<<<OVERVIEW>>>([\s\S]*?)(?=<<<MODULE>>>|$)/);
  const moduleMatch = text.match(/<<<MODULE>>>([\s\S]*?)(?=<<<END>>>|$)/);

  return {
    overviewDiagram: overviewMatch ? cleanMermaid(overviewMatch[1]) : originalOverview,
    moduleDiagram: moduleMatch ? cleanMermaid(moduleMatch[1]) : originalModule,
    moduleName: moduleName
  };
};

const generateWithGoogle = async (fullPrompt: string, config: LLMConfig): Promise<string> => {
  if (!config.apiKey) {
    throw new Error("Gemini API Key is not set.");
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const response = await ai.models.generateContent({
    model: config.modelName || 'gemini-2.5-flash',
    contents: fullPrompt,
    config: {
      temperature: 0.2,
    }
  });

  return response.text || '';
};

const generateWithOpenAI = async (systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> => {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const payload = {
    model: config.modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2,
    stream: false
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI/Local API Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};

const cleanOutput = (text: string): string => {
  return text
    .replace(/^```mermaid\n/, '')
    .replace(/^```\n/, '')
    .replace(/```$/, '')
    .trim();
};