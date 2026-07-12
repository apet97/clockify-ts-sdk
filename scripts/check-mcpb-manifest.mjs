#!/usr/bin/env node
import { readFileSync } from "node:fs";

const failures = [];

function fail(message) {
    failures.push(message);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${path} must be a non-empty string`);
    }
}

let manifest;
try {
    manifest = JSON.parse(readFileSync("mcp/manifest.json", "utf8"));
} catch (error) {
    fail(`mcp/manifest.json could not be read as JSON: ${error.message}`);
    manifest = {};
}

if (!isObject(manifest)) {
    fail("mcp/manifest.json must contain a JSON object");
}

let packageManifest;
try {
    packageManifest = JSON.parse(readFileSync("mcp/package.json", "utf8"));
} catch (error) {
    fail(`mcp/package.json could not be read as JSON: ${error.message}`);
    packageManifest = {};
}

requireString(manifest.manifest_version, "manifest_version");
requireString(manifest.name, "name");
requireString(manifest.version, "version");
if (manifest.version !== packageManifest.version) {
    fail(
        `version must match mcp/package.json version ${packageManifest.version}, got ${manifest.version}`,
    );
}

if (!isObject(manifest.server)) {
    fail("server must be an object");
} else {
    requireString(manifest.server.type, "server.type");
    requireString(manifest.server.entry_point, "server.entry_point");
    if (manifest.server.entry_point !== "dist/index.js") {
        fail(`server.entry_point must be dist/index.js, got ${manifest.server.entry_point}`);
    }

    const config = manifest.server.mcp_config;
    if (!isObject(config)) {
        fail("server.mcp_config must be an object");
    } else {
        if (config.command !== "node") fail("server.mcp_config.command must be node");
        if (!Array.isArray(config.args) || !config.args.includes("${__dirname}/dist/index.js")) {
            fail("server.mcp_config.args must run ${__dirname}/dist/index.js");
        }
        if (!isObject(config.env)) {
            fail("server.mcp_config.env must be an object");
        } else {
            if (config.env.CLOCKIFY_API_KEY !== "${user_config.api_key}") {
                fail("server.mcp_config.env.CLOCKIFY_API_KEY must come from user_config.api_key");
            }
            if (config.env.CLOCKIFY_WORKSPACE_ID !== "${user_config.workspace_id}") {
                fail("server.mcp_config.env.CLOCKIFY_WORKSPACE_ID must come from user_config.workspace_id");
            }
        }
    }
}

const userConfig = manifest.user_config;
if (!isObject(userConfig)) {
    fail("user_config must be an object");
} else {
    const apiKey = userConfig.api_key;
    if (!isObject(apiKey)) {
        fail("user_config.api_key must be an object");
    } else {
        if (apiKey.sensitive !== true) fail("user_config.api_key.sensitive must be true");
        if (apiKey.required !== true) fail("user_config.api_key.required must be true");
        requireString(apiKey.title, "user_config.api_key.title");
    }

    const workspaceId = userConfig.workspace_id;
    if (!isObject(workspaceId)) {
        fail("user_config.workspace_id must be an object");
    } else {
        if (workspaceId.required !== true) {
            fail("user_config.workspace_id.required must be true");
        }
        requireString(workspaceId.title, "user_config.workspace_id.title");
    }
}

if (failures.length > 0) {
    console.error("MCPB manifest validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("MCPB manifest validation passed");
