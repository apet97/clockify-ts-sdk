import { AGENT_DOC_CHUNKS, type AgentDocChunk } from "./catalog.js";

export interface AgentDocSearchResult {
    chunk: AgentDocChunk;
    score: number;
    excerpt: string;
}

/** Rank catalog chunks by term-occurrence count against a query. */
export function searchAgentDocs(query: string, maxResults = 5): AgentDocSearchResult[] {
    const terms = tokenize(query);
    if (terms.length === 0) {
        return [];
    }

    return AGENT_DOC_CHUNKS.map((chunk) => {
        const haystack = [
            chunk.id,
            chunk.title,
            chunk.surface,
            chunk.text,
            chunk.tools.join(" "),
            chunk.sdkImports.join(" "),
            chunk.cliExamples.join(" "),
            chunk.next.join(" "),
        ]
            .join(" ")
            .toLowerCase();

        const score = terms.reduce((total, term) => total + occurrences(haystack, term), 0);
        return { chunk, score, excerpt: chunk.text };
    })
        .filter((result) => result.score > 0)
        .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
        .slice(0, maxResults);
}

function tokenize(query: string): string[] {
    return Array.from(
        new Set(
            query
                .toLowerCase()
                .split(/[^a-z0-9_-]+/u)
                .map((term) => term.trim())
                .filter((term) => term.length >= 2),
        ),
    );
}

function occurrences(haystack: string, needle: string): number {
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index >= 0) {
        count += 1;
        index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
}
