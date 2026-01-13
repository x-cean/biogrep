import { useState, useEffect } from "react";
import { Command } from "@tauri-apps/plugin-shell";

function App() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Wait for Tauri to be ready
  useEffect(() => {
    // Small delay to ensure Tauri context is fully initialized
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  async function runRipgrep() {
    if (!ready) {
      setOutput("Waiting for Tauri to initialize...");
      return;
    }

    setLoading(true);
    setOutput("");
    try {
      // Command.sidecar() finds "binaries/rg-{platform}" automatically
      const command = Command.sidecar("binaries/rg", ["--version"]);
      const result = await command.execute();

      if (result.code === 0) {
        setOutput(result.stdout);
      } else {
        setOutput(`Exit code ${result.code}: ${result.stderr}`);
      }
    } catch (error) {
      // More detailed error message
      const errorMsg = error instanceof Error ? error.message : String(error);
      setOutput(`Error: ${errorMsg}\n\nMake sure you're running this inside the Tauri app (not just the browser at localhost:1420)`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-8 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-2">🧬 BioGrep</h1>
      <p className="text-gray-400 mb-6">Local desktop search for scientists</p>

      <button
        onClick={runRipgrep}
        disabled={loading || !ready}
        className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Running..." : ready ? "Test ripgrep sidecar" : "Initializing..."}
      </button>

      <pre className="mt-6 p-4 bg-gray-800 rounded text-sm font-mono overflow-auto whitespace-pre-wrap">
        {output || "Click the button to test if ripgrep is working"}
      </pre>

      <p className="mt-4 text-xs text-gray-500">
        Note: This must run in the Tauri desktop window, not in a regular browser.
      </p>
    </main>
  );
}

export default App;
