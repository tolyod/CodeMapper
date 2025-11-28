import { GoogleGenAI } from "@google/genai";
import { LLMConfig } from "../types";

export interface FileInput {
  name: string;
  content: string;
}

export const generateC4Update = async (
  currentMermaid: string,
  files: FileInput[],
  projectTree: string,
  config: LLMConfig
): Promise<string> => {
  
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
    ${currentMermaid || 'C4Context\n    title System Context diagram\n    Container_Boundary(system, "Software System") {\n    }'}
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

  try {
    if (config.provider === 'google') {
      return await generateWithGoogle(systemPrompt + "\n" + userPrompt, config);
    } else {
      return await generateWithOpenAI(systemPrompt, userPrompt, config);
    }
  } catch (error) {
    console.error("LLM Generation Error:", error);
    throw error;
  }
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

  return cleanOutput(response.text || '');
};

const generateWithOpenAI = async (systemPrompt: string, userPrompt: string, config: LLMConfig): Promise<string> => {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`; // Ensure no trailing slash issues

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
  const content = data.choices?.[0]?.message?.content || '';
  return cleanOutput(content);
};

const cleanOutput = (text: string): string => {
  return text
    .replace(/^```mermaid\n/, '')
    .replace(/^```\n/, '')
    .replace(/```$/, '')
    .trim();
};