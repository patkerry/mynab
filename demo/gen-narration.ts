import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { LINES } from "./lines";

// Synthesizes one voice clip per narration line with Microsoft's Ava neural voice (edge-tts —
// free, no key; note the text does transit Microsoft's servers) and writes a durations manifest
// the recorder uses to hold each caption for at least as long as it's spoken.
//
// Prereq: pip3 install --user edge-tts

const VOICE = "en-US-AvaMultilingualNeural";
const OUT = "demo/narration";

function durationMs(file: string): number {
  // afinfo is native macOS: "estimated duration: 3.456 sec"
  const info = execFileSync("afinfo", [file], { encoding: "utf8" });
  const m = /estimated duration:\s*([\d.]+)\s*sec/.exec(info);
  if (!m) throw new Error(`no duration in afinfo output for ${file}`);
  return Math.round(parseFloat(m[1]) * 1000);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const durations: Record<string, number> = {};
  for (const [key, text] of Object.entries(LINES)) {
    const file = `${OUT}/${key}.mp3`;
    // Spoken text: strip the arrow glyphs that read poorly aloud.
    const spoken = text.replaceAll("→", ",").replaceAll("…", ".");
    execFileSync("python3", ["-m", "edge_tts", "--voice", VOICE, "--text", spoken, "--write-media", file], { stdio: "pipe" });
    durations[key] = durationMs(file);
    console.log(`[narration] ${key}: ${durations[key]}ms`);
  }
  writeFileSync(`${OUT}/durations.json`, JSON.stringify(durations, null, 2));
  console.log(`[narration] ${Object.keys(durations).length} clips ready`);
}
main();
