/** Compile-checked migration example for the 1.0 archive/delete adapter. */
import type { createClockifyClient } from "clockify-sdk-ts-115";
import {
    archiveThenDeleteProject,
    type ArchiveThenDeleteAdapter,
} from "clockify-sdk-ts-115/ensure";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";

type ClockifyClient = ReturnType<typeof createClockifyClient>;

export function projectArchiveThenDeleteAdapter(
    client: ClockifyClient,
): ArchiveThenDeleteAdapter<ClockifyApi.Project> {
    return {
        getCurrent: ({ workspaceId, id }) => client.projects.get({ workspaceId, projectId: id }),
        archive: async ({ workspaceId, id, current }) => {
            await client.projects.update({
                workspaceId,
                projectId: id,
                name: current.name,
                archived: true,
            });
        },
        delete: async ({ workspaceId, id }) => {
            await client.projects.delete({ workspaceId, projectId: id });
        },
    };
}

export async function deleteProject(
    client: ClockifyClient,
    workspaceId: string,
    projectId: string,
): Promise<void> {
    await archiveThenDeleteProject({
        workspaceId,
        id: projectId,
        adapter: projectArchiveThenDeleteAdapter(client),
    });
}
