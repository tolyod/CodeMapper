import { GoogleGenAI } from "@google/genai";

export const generateC4Update = async (
  currentMermaid: string,
  fileName: string,
  fileContent: string
): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("Gemini API Key is not set. Please select a key.");
  }
  
  // Create a new instance for each request to ensure fresh API key usage
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are an expert Software Architect specializing in C4 Model architecture diagrams using Mermaid JS syntax.
    
    We are incrementally building a C4 Component diagram for a codebase.
    
    Current State of Mermaid Diagram:
    \`\`\`mermaid
    ${currentMermaid || 'C4Context\n    title System Context diagram\n    Container_Boundary(system, "Software System") {\n    }'}
    \`\`\`

    I am providing you with a new file from the codebase.
    File Name: ${fileName}
    File Content:
    \`\`\`
    ${fileContent.slice(0, 20000)} 
    \`\`\`
    (Content truncated if too long)

    TASK:
    1. Analyze the file content to identify significant Components, Controllers, Services, Repositories, or External System interactions.
    2. Update the Mermaid diagram to include any new components found in this file.
    3. Add relationships (Rel) based on imports, dependency injection, or API calls found in the file.
    4. Maintain existing nodes. Do not remove them unless they are clearly erroneous based on this new file.
    5. Group components into the "Software System" container boundary if appropriate, or create specific Containers (e.g., API Application, Database, Web App) if the file suggests a specific subsystem.
    
    OUTPUT FORMAT:
    Return ONLY the raw Mermaid code. Do not wrap it in markdown code blocks. Do not add explanations.
    Ensure the code is valid Mermaid C4 syntax (C4Context, C4Container, or C4Component).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // Low temperature for consistent code generation
      }
    });

    let text = response.text || '';
    // Cleanup if model adds markdown blocks despite instructions
    text = text.replace(/^```mermaid\n/, '').replace(/^```\n/, '').replace(/```$/, '');
    return text.trim();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};