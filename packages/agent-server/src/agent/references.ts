/**
 * Converts LLM's 【ref:id】 markers to formatted markdown links
 */

export interface ToolResult {
    id: string;
    url?: string;
    title?: string;
}

// Track ID → number mapping across stream (reset per message)
const globalRefMapping = new Map<string, number>();
let globalCounter = 1;

// Buffer for incomplete reference markers
let referenceBuffer = '';
let isBuffering = false;

/**
 * Reset reference tracking (call at start of each message)
 */
export function resetReferenceTracking() {
    globalRefMapping.clear();
    globalCounter = 1;
    referenceBuffer = '';
    isBuffering = false;
}

/**
 * Converts 【ref:id】 to clickable link emoji with title tooltip
 */
export function processChunk(text: string, toolResults: Map<string, ToolResult>): string {
    let output = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (!isBuffering) {
            // Check if we're starting a reference
            if (char === '【') {
                isBuffering = true;
                referenceBuffer = char;
            } else {
                // Normal character, pass through
                output += char;
            }
        } else {
            // We're buffering a reference
            referenceBuffer += char;

            // Check if we've completed the reference
            if (char === '】') {
                // Try to parse the complete reference
                const match = referenceBuffer.match(/^【ref:([^】]+)】$/);

                if (match) {
                    const id = match[1];
                    const result = toolResults.get(id);

                    if (result && result.url) {
                        // Create clickable link emoji with title tooltip
                        const title = result.title || extractDomain(result.url) || 'Source';
                        output += `[🔗](${result.url} "${title}")`;
                    } else {
                        // ID not found, output as-is
                        output += referenceBuffer;
                    }
                } else {
                    // Malformed reference, output as-is
                    output += referenceBuffer;
                }

                // Reset buffer
                referenceBuffer = '';
                isBuffering = false;
            }
            // If not closed yet, keep buffering
        }
    }

    return output;
}

/**
 * Extract domain from URL for fallback title
 */
function extractDomain(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}
