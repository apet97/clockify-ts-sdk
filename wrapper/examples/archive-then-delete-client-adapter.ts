/** Compile-checked client replacement-body migration for the 1.0 adapter. */
import type { createClockifyClient } from "clockify-sdk-ts-115";
import {
    archiveThenDeleteClient,
    type ArchiveThenDeleteAdapter,
} from "clockify-sdk-ts-115/ensure";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

type ClockifyClient = ReturnType<typeof createClockifyClient>;

export function clientArchiveReplacementBody(
    current: ClockifyApi.Client,
): ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> {
    const body: ClockifyRequestBody<ClockifyApi.UpdateClientsRequest> = {
        name: current.name,
        archived: true,
    };
    for (const key of ["address", "currencyCode", "email", "note"] as const) {
        const value = current[key];
        if (typeof value === "string") body[key] = value;
    }
    return body;
}

export function clientArchiveThenDeleteAdapter(
    client: ClockifyClient,
): ArchiveThenDeleteAdapter<ClockifyApi.Client> {
    return {
        getCurrent: ({ workspaceId, id }) =>
            client.clients.get({ workspaceId, clientId: id }),
        archive: async ({ workspaceId, id, current }) => {
            await client.clients.update({
                workspaceId,
                clientId: id,
                body: clientArchiveReplacementBody(current),
            });
        },
        delete: async ({ workspaceId, id }) => {
            await client.clients.delete({ workspaceId, clientId: id });
        },
    };
}

export async function deleteClient(
    client: ClockifyClient,
    workspaceId: string,
    clientId: string,
): Promise<void> {
    await archiveThenDeleteClient({
        workspaceId,
        id: clientId,
        adapter: clientArchiveThenDeleteAdapter(client),
    });
}
