# files

1 methods on `client.files`.

> Compact reference auto-generated from the synced SDK. For full type expansions, see the [TypeDoc reference](../api/).

## Methods

### `uploadImage`

**Example:**

```typescript
    import { createReadStream } from "fs";
    await client.files.uploadImage({
        file: fs.createReadStream("/path/to/your/file")
    })
```

**Request fields** (`UploadImageRequest`):

- `file` (`core.file.Uploadable`, required) — Image to be uploaded

