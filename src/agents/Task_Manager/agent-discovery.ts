import fs from "fs/promises";
import path from "path";
import { AgentManifest } from "./Schema.js";

/**
 * Scan the agents directory and return a manifest for each agent.
 * Reads manifest.json if present, otherwise falls back to a minimal manifest.
 */
export async function discoverAgents(agentsDir: string): Promise<AgentManifest[]> {
  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const manifests = await Promise.all(
    dirs.map(async (dir): Promise<AgentManifest> => {
      const manifestPath = path.join(agentsDir, dir.name, "manifest.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        return JSON.parse(raw) as AgentManifest;
      } catch {
        return { name: dir.name, description: "", capabilities: [], mcps: [] };
      }
    })
  );

  return manifests;
}
