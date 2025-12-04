/**
 * Template processor for system prompts
 *
 * Supports variable substitution and conditional blocks:
 * - {{variable}} - simple substitution
 * - {{#if variable}}...{{/if}} - conditional blocks
 * - {{#if variable}}...{{else}}...{{/if}} - if-else blocks
 */

export interface TemplateContext {
    // Always available
    userId: string;
    serverTime: string;  // ISO 8601 UTC

    // Optional (from headers)
    userIp?: string;
    userCountry?: string;

    // Phase 2 additions (from frontend)
    userTimezone?: string;
    userLocale?: string;
    userLanguage?: string;
    userRegion?: string;
    localTime?: string;

    // Memory state (formatted for prompt injection)
    formattedMemory?: string;
}

/**
 * Process template string with context variables
 */
export function processTemplate(template: string, context: TemplateContext): string {
    let result = template;

    // Process conditionals first (if/else blocks)
    result = processConditionals(result, context);

    // Then process simple variable substitutions
    result = processVariables(result, context);

    return result;
}

/**
 * Process conditional blocks {{#if}}...{{/if}} and {{#if}}...{{else}}...{{/if}}
 */
function processConditionals(template: string, context: TemplateContext): string {
    // Regex: {{#if variable}}content{{else}}altContent{{/if}}
    const ifElseRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;

    template = template.replace(ifElseRegex, (match, varName, ifContent, elseContent) => {
        const value = context[varName as keyof TemplateContext];
        return value ? ifContent : elseContent;
    });

    // Regex: {{#if variable}}content{{/if}}
    const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    template = template.replace(ifRegex, (match, varName, content) => {
        const value = context[varName as keyof TemplateContext];
        return value ? content : '';
    });

    return template;
}

/**
 * Process simple variable substitutions {{variable}}
 */
function processVariables(template: string, context: TemplateContext): string {
    // Regex: {{variable}}
    const varRegex = /\{\{(\w+)\}\}/g;

    return template.replace(varRegex, (match, varName) => {
        const value = context[varName as keyof TemplateContext];
        if (value === undefined) {
            console.warn(`[Template] Variable not found: ${varName}, keeping original`);
            return match; // Keep original if not found
        }
        return String(value);
    });
}

/**
 * Build template context from available user data
 */
export function buildTemplateContext(
    userId: string,
    userIp?: string,
    userCountry?: string,
    userTimezone?: string,
    userLocale?: string,
    formattedMemory?: string
): TemplateContext {
    const now = new Date();
    const serverTime = now.toISOString();

    const context: TemplateContext = {
        userId,
        serverTime,
        userIp,
        userCountry,
    };

    // Phase 2: Add timezone/locale if available
    if (userTimezone) {
        context.userTimezone = userTimezone;

        // Convert server time to user's local time
        context.localTime = now.toLocaleString('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    if (userLocale) {
        context.userLocale = userLocale;

        // Parse locale (e.g., "en-US" -> language: "en", region: "US")
        const parts = userLocale.split('-');
        if (parts.length >= 1) context.userLanguage = parts[0];
        if (parts.length >= 2) context.userRegion = parts[1];
    }

    // Add formatted memory state if available
    if (formattedMemory) {
        context.formattedMemory = formattedMemory;
    }

    return context;
}
