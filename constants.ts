
export const INITIAL_MERMAID = `C4Context
    title System Context Diagram
    
    Container_Boundary(system, "System Scope") {
        System(core_app, "Core Application", "The main software system being analyzed")
    }
`;

export const MAX_FILE_SIZE_BYTES = 100 * 1024; // Skip files larger than 100KB to save tokens

export const DEFAULT_BATCH_COUNT = 5;
export const DEFAULT_BATCH_SIZE_KB = 50;
