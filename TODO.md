# BioGrep - TODO & Notes

## Security Considerations

- [ ] **Restrict `opener:allow-open-path` scope** - Currently allows opening any file (`/**`). For production:
  - Limit to known safe extensions (`.txt`, `.py`, `.csv`, `.fasta`, `.json`, etc.)
  - Or restrict to user-specified search folders only
  - Risk: User could accidentally open `.app` or `.sh` files from untrusted sources

## MVP Priority

- [ ] **PDF/Office search via `ripgrep-all` (rga)** - Search inside `.pdf`, `.docx`, `.pptx`, `.xlsx`. Critical for research handover scenarios. Requires adding `rga` as second sidecar binary.

## Future Features

- [ ] **Folder picker dialog** - Native OS "Browse" button instead of typing path
- [ ] **`~` expansion** - Support `~/Documents` style paths (needs path plugin)
- [ ] **File preview panel** - Show file content in-app instead of opening external app
- [ ] **Folder browser** - Navigate folder tree when user doesn't know what to search
- [ ] **Filename search (fd)** - Add `fd` sidecar for searching by filename, not just content
- [ ] **Recent searches** - History of past queries
- [ ] **Virtualized list** - Use `react-virtuoso` for 50k+ results performance

## Known Issues

- Path must start with `/` (absolute path required)
- No `~` expansion for home directory
- **`@tauri-apps/plugin-path` failed to install** - Would enable `~` expansion. Try: `npm run tauri add path` when dev server is stopped. If it works, use `homeDir()` to expand `~` to `/Users/xhome`.
