/**
 * Invoice tool surface. The three sibling modules follow the three things an
 * invoice is made of: the document itself, its line items, and the payments
 * recorded against it.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "../../client.js";

import { registerInvoiceDocumentTools } from "./invoices.js";
import { registerInvoiceItemTools } from "./items.js";
import { registerInvoicePaymentTools } from "./payments.js";

export function registerInvoicesTools(server: McpServer, ctx: Context): void {
    registerInvoiceDocumentTools(server, ctx);
    registerInvoiceItemTools(server, ctx);
    registerInvoicePaymentTools(server, ctx);
}
