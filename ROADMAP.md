# BioGrep Roadmap: From Search Tool to Research Work Assistant

## Vision

Transform BioGrep from a fast file search tool into an **intelligent work assistant for scientists and research teams** — an agent that can navigate, understand, remember, and act on research files.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BioGrep Agent                            │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1: Search                           [CURRENT ✓]     │
│  - fd, rg, rga for fast file/content search                │
│  - LLM query expansion for zero-result recovery            │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: Understanding                    [NEXT]          │
│  - Document parsing & chunking                              │
│  - Vector embeddings for semantic search                    │
│  - Summarization & extraction                               │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: Memory                           [PLANNED]       │
│  - Project/task context persistence                         │
│  - Cross-session continuity                                 │
│  - Work pattern recognition                                 │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4: Action                           [FUTURE]        │
│  - Organize files, tag documents                            │
│  - Generate reports, extract data                           │
│  - Integrate with lab tools                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Search Engine ✓ COMPLETE

> *"Find files and content fast"*

- [x] Tauri + React + TypeScript foundation
- [x] `fd` integration for filename search
- [x] `rg` integration for content search with JSON streaming
- [x] `rga` integration for document search (PDF, Word, etc.)
- [x] LLM-powered query expansion when initial search yields no results
- [x] Virtualized results list for large result sets
- [x] Search term highlighting
- [x] Process management (kill old searches)

---

## Phase 2: Document Understanding 🔜 NEXT

> *"Read and comprehend research documents"*

### Goals
- Parse and chunk documents intelligently
- Enable semantic search ("find papers about X" vs exact text match)
- Summarize and extract key information

### Tasks
- [ ] **Document Parsing Pipeline**
  - [ ] Extract text from PDFs, Word, markdown, plain text
  - [ ] Chunk documents intelligently (respect paragraph/section boundaries)
  - [ ] Extract metadata (title, authors, date, file type)

- [ ] **Embeddings & Vector Search**
  - [ ] Choose embedding model (local: `all-MiniLM-L6-v2` or API-based)
  - [ ] Integrate vector database (SQLite + `sqlite-vss` or `qdrant`)
  - [ ] Index documents on folder scan
  - [ ] Hybrid search: keyword (rg) + semantic (vector)

- [ ] **Summarization & Extraction**
  - [ ] Summarize individual documents on demand
  - [ ] Extract key entities (methods, results, citations)
  - [ ] Answer questions about document content

- [ ] **Structural Parsing (Optional Enhancements)**
  > *Complement semantic search with structure-aware navigation*
  
  - [ ] **Folder Pattern Detection**
    - [ ] Recognize project boundaries (date-based, topic-based folders)
    - [ ] Infer folder purposes (raw_data/, analysis/, manuscripts/)
    - [ ] Use folder context to improve search relevance
  
  - [ ] **File Naming Convention Parsing**
    - [ ] Extract dates, versions, experiment IDs from filenames
    - [ ] Detect user's naming patterns over time
    - [ ] Group related files (e.g., `fig1_v1.png`, `fig1_v2.png`, `fig1_final.png`)
  
  - [ ] **Document Section Extraction**
    - [ ] Parse scientific papers: Abstract → Methods → Results → Discussion
    - [ ] Extract protocol steps from lab notebooks
    - [ ] Identify headers/structure in markdown and text files
    - [ ] Use section context for more precise answers

### Technical Considerations
- Keep embeddings local for privacy (research data sensitivity)
- Incremental indexing (don't re-embed unchanged files)
- Show "understanding" progress to user
- Structural parsing is *secondary* to semantic search — add opportunistically

---

## Phase 3: Memory & Context 📋 PLANNED

> *"Remember what I was working on"*

### Goals
- Track user's work sessions and searches
- Build project context over time
- Enable queries like "What was I researching last week?"

### Tasks
- [ ] **Session Memory**
  - [ ] Log searches, opened files, time spent
  - [ ] Group activity into "work sessions"
  - [ ] Store in local SQLite database

- [ ] **Project Context**
  - [ ] Allow user to define "projects" (folder + description)
  - [ ] Summarize project progress over time
  - [ ] Track which files belong to which project

- [ ] **Intelligent Recall**
  - [ ] "Continue where I left off" feature
  - [ ] Suggest relevant files based on current context
  - [ ] "What did I work on related to X?" queries

### Technical Considerations
- Privacy-first: all data stays local
- Lightweight: don't slow down search
- Optional: user can disable memory features

---

## Phase 4: Actions & Automation 🚀 FUTURE

> *"Help me organize and produce"*

### Goals
- Move beyond read-only to taking actions
- Generate outputs (summaries, reports)
- Integrate with research workflows

### Potential Features
- [ ] **File Organization**
  - [ ] Auto-tag/categorize documents
  - [ ] Suggest folder reorganization
  - [ ] Batch rename with patterns

- [ ] **Content Generation**
  - [ ] Generate literature review from searched papers
  - [ ] Extract methods into templates
  - [ ] Create annotated bibliographies

- [ ] **Integrations**
  - [ ] Export to reference managers (Zotero, Mendeley)
  - [ ] Sync with electronic lab notebooks
  - [ ] Calendar/task manager integration

---

## Use Cases for Scientists

| User Says | Agent Does |
|-----------|------------|
| *"Where did I read about CRISPR off-target effects?"* | Semantic search → surfaces relevant papers and notes |
| *"Summarize my progress on the proteomics project"* | Memory recall → generates status summary |
| *"What methods did we use for Western blots last time?"* | Protocol search → finds and extracts method details |
| *"Help me write a methods section for this paper"* | Context + generation → drafts methods from lab notes |
| *"Organize my Downloads folder"* | Action → proposes and executes file organization |

---

## Technical Stack (Current + Planned)

| Layer | Current | Planned Additions |
|-------|---------|-------------------|
| **Frontend** | React + TypeScript + Tailwind | Chat interface, project views |
| **Backend** | Rust (Tauri) | Vector search, memory storage |
| **Search** | fd, rg, rga | Semantic search layer |
| **AI** | Gemini API (query expansion) | Embeddings, summarization, chat |
| **Storage** | Filesystem | SQLite + vector extensions |

---

## Success Metrics

1. **Search Speed**: < 100ms for 10k files (maintain current performance)
2. **Understanding**: Accurate answers from document content
3. **Memory Utility**: Users find "continue where I left off" valuable
4. **Adoption**: Research teams use it daily

---

## Open Questions

- [ ] Local-only vs. cloud AI for embeddings/summarization?
- [ ] How to handle very large document collections (100k+ files)?
- [ ] What integrations are most valuable for research teams?
- [ ] Should there be team/collaboration features?

---

*Last updated: January 2026*
