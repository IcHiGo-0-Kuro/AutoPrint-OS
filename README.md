# AutoPrint OS

AutoPrint OS is a Windows desktop application (branded **Printomatic**) for Xerox and printing shops. Customers send documents over WhatsApp; the shop computer downloads them, queues them and prints them.

## Architecture

- **React/Vite workstation UI** (`src/`)
- **Electron desktop layer** (`electron/`): Windows file access, printer discovery, print spooling via PowerShell, offline print queue, durable local file registry
- **Supabase** (`supabase/`): authentication, shop membership, printer/job metadata, and the WhatsApp edge functions
  - `whatsapp-webhook`: receives customer messages and runs the guided order flow
  - `whatsapp-media-sync`: lets an authenticated shop desktop list, download and acknowledge customer documents
  - `whatsapp-payment-webhook`: payment confirmations (payments are still being finished)
- Customer documents are **never stored in Supabase Storage**. They are fetched from WhatsApp on demand and live only on the shop computer.

## Run

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. There are no built-in defaults; the app will not start without them.
2. `npm install`
3. `npm run dev` for the web UI, or `npm run desktop:dev` for the Electron app.

`npm run build` writes `dist/desktop-config.json` (the Supabase URL the Electron main process uses to validate downloads) and adds a Content-Security-Policy to `dist/index.html`. Installer builds therefore need the same two variables at build time; in GitHub Actions they come from the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` repository secrets.

## Tests

`npm run test:desktop` runs the Electron security tests (no extra dependencies). They load the real `electron/main.cjs` against a mocked Electron and check, among other things, that executables can never be opened or printed and that the bearer token only ever goes to the configured Supabase endpoint.

## Edge function secrets

| Secret | Used by |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | webhook verification handshake (must be non-empty) |
| `WHATSAPP_APP_SECRET` | verifying Meta's `x-hub-signature-256` header |
| `WHATSAPP_ACCESS_TOKEN` | sending messages and downloading media |
| `WHATSAPP_GRAPH_VERSION` | optional, defaults to `v23.0` |
| `PRINTOMATIC_PAYMENT_WEBHOOK_SECRET` | payment webhook signature |

## Security model

- Only PDF, Word, PowerPoint, Excel, JPG and PNG files are accepted. Customers control file names, and Windows would *run* an `.exe`/`.lnk`/script passed to open or print, so unsupported types are rejected at intake (webhook), at download (media-sync) and again on the desktop (`PRINTABLE_EXTENSIONS` in `electron/main.cjs` and `_shared/printable-documents.ts` must stay in sync).
- Every IPC channel verifies it was called by the app's own page, and the renderer can only register files chosen in the native file picker or downloaded into the app's inbox.
- Print jobs pass file and printer names to PowerShell through environment variables, never through script text.
