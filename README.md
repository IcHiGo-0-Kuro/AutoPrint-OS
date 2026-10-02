# AutoPrint OS

AutoPrint OS is being built as a real Windows desktop application for Xerox/printing shops.

## Architecture

- React/Vite workstation UI
- Native desktop layer for Windows filesystem access, printer discovery, Windows print spooler integration, telemetry, offline queueing, and durable local document mapping
- Supabase for authentication, shop membership, printer/job metadata, settings, and cloud coordination
- Customer PDF/DOCX/PPTX/image files remain on the shop desktop; actual document contents are not uploaded to Supabase Storage

## Current repository foundation

The main branch now contains the desktop-oriented Vite foundation, Supabase environment configuration, authentication client, and a first workstation shell. The original UI modules are being integrated without changing their intended visual direction.

## Run

1. Copy .env.example to .env.local.
2. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
3. Run npm install.
4. Run npm run dev.

The native printer/filesystem layer is the next implementation layer; browser code must not pretend it can directly control Windows printers or expose local file paths to Supabase.