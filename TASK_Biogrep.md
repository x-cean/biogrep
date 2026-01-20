# BioGrep Prototype - Task Checklist

- [x] **Phase 1: Project Initialization (The Scaffold)**
    - [x] Initialize Tauri v2 + React + TypeScript project
    - [x] Configure TailwindCSS and shadcn/ui
    - [x] **Configure Tauri Sidecar Permissions:** distinct setup in `tauri.conf.json` to allow execution of `rg` and `fd`.
    - [ ] **Cross-Platform Check:** Verify the `rg` binary runs correctly on the target OS (Mac/Win/Linux).

- [x] **Phase 2: Core Search Engine (The Rust Backend)**
    - [x] Implement Rust command handler to spawn `rg`
    - [x] **Implement Process Management:** Ensure old search processes are killed when a new query starts.
    - [x] Create `Event` struct in Rust to parse `rg --json` lines into typed objects.
    - [x] Implement `fd` integration for file-only search mode.

- [ ] **Phase 3: User Interface (The React Frontend)**
    - [x] Build "Omnibar" Search Input **with 300ms Debounce**.
    - [x] Create `useSearch` hook that listens for Tauri events and manages loading states.
    - [x] **Implement Virtualized List:** Use `react-virtuoso` to render only visible results (crucial for 50k+ hits).
    - [ ] Add a "Stop/Cancel" button in the UI.

- [ ] **Phase 4: "Science" Logic (The Differentiator)**
    - [ ] **File Type Detection:** Logic to detect extension (e.g., .fasta) vs content-type.
    - [ ] **Basic Previewer:** Component to display text content with search terms highlighted.
    - [ ] **Simple PDF Support:** Attempt to use a Rust crate (e.g., `pdf-extract`) for text previews before trying full `rga` integration.

- [ ] **Phase 5: Polish & Edge Cases**
    - [ ] **Test Edge Cases:** Handle empty queries, invalid paths, permission errors, very large result sets, special characters in search.
    - [ ] **Highlight Searched Text:** Adjust results display to highlight or visually emphasize the matched search term in the result content.
