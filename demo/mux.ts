import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";

// Lays the Ava narration clips onto the recorded demo video at the moments each caption
// appeared (demo-results/caption-log.json), and transcodes to a QuickTime-friendly mp4.
// ffmpeg comes from the ffmpeg-static npm package — no Homebrew needed.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg: string = require("ffmpeg-static");

function findVideo(): string {
  const out = execSync('find demo-results -name "*.webm" -newer demo-results/caption-log.json -print 2>/dev/null; find demo-results -name "*.webm"', {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  if (out.length === 0) throw new Error("no recorded video found — run the narrated recording first");
  return out[0];
}

function main() {
  const log: { key: string; atMs: number }[] = JSON.parse(readFileSync("demo-results/caption-log.json", "utf8"));
  const video = findVideo();

  const inputs: string[] = ["-i", video];
  const delayed: string[] = [];
  log.forEach((entry, i) => {
    const clip = `demo/narration/${entry.key}.mp3`;
    if (!existsSync(clip)) throw new Error(`missing narration clip ${clip}`);
    inputs.push("-i", clip);
    // adelay wants per-channel ms; "all=1" applies to every channel.
    delayed.push(`[${i + 1}:a]adelay=${entry.atMs}:all=1[a${i}]`);
  });
  const mixInputs = log.map((_, i) => `[a${i}]`).join("");
  const filter = `${delayed.join(";")};${mixInputs}amix=inputs=${log.length}:normalize=0[aout]`;

  mkdirSync("demo/out", { recursive: true });
  const output = "demo/out/mynab-first-steps.mp4";
  execFileSync(
    ffmpeg,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      output,
    ],
    { stdio: "pipe" }
  );
  const mb = (statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`[mux] wrote ${output} (${mb} MB) from ${video} + ${log.length} narration clips`);
}
main();
