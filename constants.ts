
export const OVERVIEW_DIAGRAM_KEY = 'System Overview';

export const INITIAL_OVERVIEW_MERMAID = `C4Context
    title System Context & Containers (Overview)
    
    System_Boundary(system, "Software System") {
        Container(web_app, "Web Application", "React/Browser", "Delivers the static content and SPA")
        Container(api, "API Service", "Server", "Provides functionality via JSON/HTTPS")
        ContainerDb(database, "Database", "SQL/NoSQL", "Stores system data")
    }

    Rel(web_app, api, "Uses", "JSON/HTTPS")
    Rel(api, database, "Reads/Writes")
`;

export const MAX_FILE_SIZE_BYTES = 100 * 1024; // Skip files larger than 100KB to save tokens

export const DEFAULT_BATCH_COUNT = 5;
export const DEFAULT_BATCH_SIZE_KB = 50;