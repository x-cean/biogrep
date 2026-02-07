# BioGrep Prototype - Task Checklist

- [x] **Phase 1: Project Initialization (The Scaffold)**
    - [x] Initialize Tauri v2 + React + TypeScript project
    - [x] Configure TailwindCSS and shadcn/ui
    - [x] Configure TailwindCSS and shadcn/ui
    - [x] **Configure Tauri Sidecar Permissions:** distinct setup in `tauri.conf.json` to allow execution of `rg` and `fd`.
    - [x] **Multi-Term Search:** Allow users to search "term1, term2" by converting to regex `(term1|term2)`. <!-- id: new -->
    - [ ] **Cross-Platform Check:** Verify the `rg` binary runs correctly on the target OS (Mac/Win/Linux).

- [x] **Phase 2: Core Search Engine (The Rust Backend)**
    - [x] Implement Rust command handler to spawn `rg`
    - [x] **Implement Process Management:** Ensure old search processes are killed when a new query starts.
    - [x] Create `Event` struct in Rust to parse `rg --json` lines into typed objects.
    - [x] Implement `fd` integration for file-only search mode.

- [x] **Phase 3: User Interface (The React Frontend)**
    - [x] Build "Omnibar" Search Input **with 300ms Debounce**.
    - [x] Create `useSearch` hook that listens for Tauri events and manages loading states.
    - [x] **Implement Virtualized List:** Use `react-virtuoso` to render only visible results (crucial for 50k+ hits).
    - [x] Add a "Stop/Cancel" button in the UI.

- [ ] **Phase 4: Agentic Knowledge Base (The Pivot)**
    - [ ] **State Management Refactor:** Move global state to Context API (`SearchContext`, `ChatContext`) to prepare for complex agent logic.
    - [ ] **Tool-Use Layer:** Expose `rg`, `fd`, and `read_file` as callable tools for the LLM.
    - [ ] **Agent Loop:** Implement a "ReAct" loop where the LLM can plan -> search -> read -> answer.
    - [ ] **UI for Thinking:** Update Chat UI to show the agent's "Thought Process" (tools being called).

- [ ] **Phase 5: Polish & Edge Cases**
    - [ ] **Test Edge Cases:** Handle empty queries, invalid paths, permission errors, very large result sets, special characters in search.
    - [x] **Highlight Searched Text:** Adjust results display to highlight or visually emphasize the matched search term in the result content.
    - [x] **Highlight Edge Cases:** LLM-expanded search terms now also get highlighted.
    - [x] **Resizable Columns:** Drag the column divider to resize filename/path column width.
    - [/] **Test on different hardwares:** USB, SSD, local storage, cloud storage... (Added warning dialog for cloud folders)

