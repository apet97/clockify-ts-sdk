const STYLE_PLACEHOLDER = "/*__REPORTS_APP_STYLES__*/";
const SCRIPT_PLACEHOLDER = "/*__REPORTS_APP_SCRIPT__*/";

interface ReportsAppHtmlParts {
    template: string;
    styles: string;
    script: string;
}

export function buildReportsAppHtml(parts: ReportsAppHtmlParts): string {
    assertSinglePlaceholder(parts.template, STYLE_PLACEHOLDER);
    assertSinglePlaceholder(parts.template, SCRIPT_PLACEHOLDER);

    const html = parts.template
        .replace(STYLE_PLACEHOLDER, () => parts.styles)
        .replace(SCRIPT_PLACEHOLDER, () => parts.script);

    if (
        html.includes(STYLE_PLACEHOLDER) ||
        html.includes(SCRIPT_PLACEHOLDER)
    ) {
        throw new Error("Reports App build left an unresolved asset placeholder.");
    }
    return html;
}

function assertSinglePlaceholder(template: string, placeholder: string): void {
    const first = template.indexOf(placeholder);
    if (first < 0 || template.indexOf(placeholder, first + placeholder.length) >= 0) {
        throw new Error(`Reports App template must contain exactly one ${placeholder} placeholder.`);
    }
}
