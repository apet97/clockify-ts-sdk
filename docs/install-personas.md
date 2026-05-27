# Install Personas

This repo has three user-facing packages. Pick the path that matches what you are trying to do.

## SDK user

Use this when you are writing TypeScript or JavaScript code and want direct Clockify API access.

```bash
cd wrapper
npm install
npm run build
npm pack
npm install ./clockify-sdk-ts-115-0.9.0.tgz
```

Minimal code:

```typescript
import { createClockifyClient } from "clockify-sdk-ts-115";

const client = createClockifyClient({ apiKey: process.env.CLOCKIFY_API_KEY! });
const tags = await client.tags.list({ workspaceId: process.env.CLOCKIFY_WORKSPACE_ID! });
console.log(tags);
```

Before trusting a tarball, run:

```bash
make pack-smoke
```

## CLI user

Use this when you want terminal commands or scriptable JSON.

```bash
cd cli
npm install
npm run build
npm link
export CLOCKIFY_API_KEY=...
export CLOCKIFY_WORKSPACE_ID=...
clk115 status
clk115 --json tags list --limit 5
```

Optional shell completions:

```bash
clk115 completion zsh > ~/.zfunc/_clk115
clk115 completion bash > ~/.clk115-completion.bash
clk115 completion fish > ~/.config/fish/completions/clk115.fish
```

`CLOCKIFY_BASE_URL` and `--base-url` are only for mock/replay gateways or private test environments. Do not set them for normal Clockify use.

## MCP user

Use this when an MCP client should call Clockify tools.

```bash
cd mcp
npm install
npm run build
npm link
```

MCP client config:

```json
{
  "mcpServers": {
    "clockify": {
      "command": "clockify115-mcp",
      "env": {
        "CLOCKIFY_API_KEY": "your_key_here",
        "CLOCKIFY_WORKSPACE_ID": "your_workspace_id_here"
      }
    }
  }
}
```

Start with `clockify_status`, then prefer workflow tools such as `clockify_create_work_package`, `clockify_log_work`, and `clockify_review_day` before low-level domain tools.
