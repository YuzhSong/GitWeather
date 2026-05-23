import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 4177);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WEB_ROOT = path.join(ROOT, "web");
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".html",
  ".json",
  ".md",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".php",
  ".rb",
  ".vue",
  ".svelte",
  ".yml",
  ".yaml",
]);

const json = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const sendStatic = async (res, pathname) => {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(decodeURIComponent(safePath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(WEB_ROOT, normalized);

  if (!filePath.startsWith(WEB_ROOT)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const body = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(body);
  } catch {
    json(res, 404, { error: "Not found" });
  }
};

const runGit = (cwd, args) =>
  new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 12 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });

const parseCommits = (raw) => {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, timestamp, author, ...messageParts] = line.split("|");
      return {
        hash,
        timestamp: Number(timestamp),
        author,
        message: messageParts.join("|"),
      };
    });
};

const parseNumstat = (raw) => {
  let additions = 0;
  let deletions = 0;
  let filesChanged = 0;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [added, deleted] = line.split(/\s+/);
    const addedValue = Number(added);
    const deletedValue = Number(deleted);
    if (!Number.isNaN(addedValue)) additions += addedValue;
    if (!Number.isNaN(deletedValue)) deletions += deletedValue;
    filesChanged += 1;
  }

  return { additions, deletions, filesChanged };
};

const countTodos = async (dir, limit = 500) => {
  let todos = 0;
  let scanned = 0;

  const root = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  const rawFiles = await runGit(root, ["ls-files", "-z"]);
  const files = rawFiles.split("\0").filter(Boolean);

  for (const file of files) {
    if (scanned >= limit) break;
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;

    const fullPath = path.join(root, file);
    try {
      const info = await stat(fullPath);
      if (!info.isFile() || info.size > 256 * 1024) continue;

      const text = await readFile(fullPath, "utf8");
      todos += (text.match(/\b(TODO|FIXME|HACK|XXX)\b/gi) || []).length;
      scanned += 1;
    } catch {
      // Binary, deleted, or locked files are ignored; the weather should still render.
    }
  }

  return { todos, scanned };
};

const getBranchPersona = (branch) => {
  const clean = branch.replace(/^\*\s*/, "").trim();
  const lower = clean.toLowerCase();

  if (lower === "main" || lower === "master") return "Main branch";
  if (lower.includes("dev") || lower.includes("develop")) return "Development branch";
  if (lower.includes("ui") || lower.includes("style")) return "UI branch";
  if (lower.includes("bug") || lower.includes("fix")) return "Bugfix branch";
  if (lower.includes("feature") || lower.includes("feat")) return "Feature branch";
  if (lower.includes("hotfix")) return "Hotfix branch";
  if (lower.includes("refactor")) return "Refactor branch";
  return "Active branch";
};

const scoreMood = ({ commits, additions, deletions, todos, mergeCount, stressMessages, hoursSinceLastCommit }) => {
  // Legacy fallback kept for compatibility; active logic uses scoreMoodV2.
  let productivity = Math.min(100, commits.length * 14 + additions / 18 + deletions / 35 + 18);
  let pressure = todos * 2.4 + stressMessages * 12 + mergeCount * 8 + Math.max(0, deletions - additions) / 30;

  if (hoursSinceLastCommit > 72) productivity -= 30;
  if (hoursSinceLastCommit > 168) productivity -= 20;

  productivity = Math.max(5, Math.round(productivity - Math.min(30, pressure / 4)));
  pressure = Math.max(0, Math.min(100, Math.round(pressure)));
  const stability = Math.max(0, Math.min(100, Math.round(100 - pressure - mergeCount * 3 + commits.length * 2)));

  return {
    productivity,
    pressure,
    stability,
    weather: {
      type: "cloudy",
      emoji: "☁️",
      title: "Cloudy",
      headline: "Legacy weather state.",
      gradient: "cloudy",
    },
  };
};

const getSuggestion = ({ productivity, pressure, todos, hoursSinceLastCommit }) => {
  // Legacy fallback kept for compatibility; active logic uses getSuggestionV2.
  if (hoursSinceLastCommit > 168) return "Resume with a small cleanup commit.";
  if (pressure >= 70) return "Stabilize first, then expand changes.";
  if (todos > 12) return "Trim nearby TODOs before adding more surface area.";
  if (productivity >= 82) return "Good momentum, keep commits focused.";
  return "Proceed with small, traceable commits.";
};

const getBranchPersonaV2 = (branch) => {
  const lower = branch.replace(/^\*\s*/, "").trim().toLowerCase();

  if (lower === "main" || lower === "master") return "Mainline, prioritize stability.";
  if (lower.includes("dev") || lower.includes("develop")) return "Development lane, good place for integration checks.";
  if (lower.includes("ui") || lower.includes("style")) return "UI lane, watch consistency and interaction details.";
  if (lower.includes("bug") || lower.includes("fix")) return "Fix lane, pair changes with a quick regression check.";
  if (lower.includes("feature") || lower.includes("feat")) return "Feature lane, keep commits small and clear.";
  if (lower.includes("hotfix")) return "Hotfix lane, stabilize first then backfill tests.";
  if (lower.includes("refactor")) return "Refactor lane, run key path verification.";
  return "Active lane, recent activity detected.";
};

const parseActiveBranches = (raw, limit = 4) => {
  const seen = new Set();
  const branches = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [rawName, rawTimestamp = "0"] = line.split("|");
    const name = rawName
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/remotes\/[^/]+\//, "")
      .trim();
    if (!name || name === "HEAD" || name.endsWith("/HEAD") || seen.has(name)) continue;

    seen.add(name);
    branches.push({
      name,
      timestamp: Number(rawTimestamp) || 0,
      persona: getBranchPersonaV2(name),
    });

    if (branches.length >= limit) break;
  }

  return branches;
};

const scoreMoodV2 = ({ commits, additions, deletions, todos, mergeCount, stressMessages, hoursSinceLastCommit }) => {
  let productivity = Math.min(100, commits.length * 14 + additions / 18 + deletions / 35 + 18);
  let pressure = todos * 2.4 + stressMessages * 12 + mergeCount * 8 + Math.max(0, deletions - additions) / 30;

  if (hoursSinceLastCommit > 72) productivity -= 30;
  if (hoursSinceLastCommit > 168) productivity -= 20;

  productivity = Math.max(5, Math.round(productivity - Math.min(30, pressure / 4)));
  pressure = Math.max(0, Math.min(100, Math.round(pressure)));
  const stability = Math.max(0, Math.min(100, Math.round(100 - pressure - mergeCount * 3 + commits.length * 2)));

  let weather = {
    type: "sunny",
    emoji: "sun",
    title: "Sunny",
    headline: "Stable coding pressure; good for scoped feature delivery.",
    gradient: "sunny",
  };

  if (hoursSinceLastCommit > 168) {
    weather = { type: "fog", emoji: "fog", title: "Fog", headline: "Context visibility is low; do a small cleanup first.", gradient: "fog" };
  } else if (hoursSinceLastCommit > 72) {
    weather = { type: "overcast", emoji: "cloud", title: "Overcast", headline: "Commit gap is long; restart with a low-risk task.", gradient: "overcast" };
  } else if (pressure >= 70) {
    weather = { type: "storm", emoji: "storm", title: "Storm", headline: "Debug pressure is high; reduce uncertainty before adding scope.", gradient: "storm" };
  } else if (pressure >= 55) {
    weather = { type: "shower", emoji: "shower", title: "Shower", headline: "Pressure is rising; focus on tests, small fixes, and scope control.", gradient: "shower" };
  } else if (pressure >= 42) {
    weather = { type: "rain", emoji: "rain", title: "Rain", headline: "Moderate pressure; suitable for small fixes and TODO cleanup.", gradient: "rain" };
  } else if (todos > 10) {
    weather = { type: "haze", emoji: "haze", title: "Haze", headline: "TODO density is visible; trim nearby items first.", gradient: "haze" };
  } else if (productivity < 40) {
    weather = { type: "cloudy", emoji: "cloud", title: "Cloudy", headline: "Low activity; choose light cleanup or a tiny commit.", gradient: "cloudy" };
  } else if (productivity >= 90 && pressure < 25) {
    weather = { type: "clear", emoji: "clear", title: "Clear", headline: "High productivity with low pressure; push one complete small feature.", gradient: "clear" };
  } else if (productivity >= 82 && pressure < 35) {
    weather = { type: "breeze", emoji: "breeze", title: "Breeze", headline: "Good rhythm; continue with clean commit history.", gradient: "breeze" };
  }

  return { productivity, pressure, stability, weather };
};

const getSuggestionV2 = ({ productivity, pressure, todos, hoursSinceLastCommit, mergeCount, stressMessages }) => {
  if (hoursSinceLastCommit > 168) return "Start with one small cleanup commit to restore context.";
  if (pressure >= 70 && stressMessages > 0) return "Avoid broad refactors; fix one failing point first.";
  if (pressure >= 55) return "Keep one theme per commit and prioritize regression coverage.";
  if (mergeCount >= 2) return "Merge activity is high; sync mainline and verify conflict points first.";
  if (todos > 12) return "TODO load is heavy; close 2-3 nearby items before expanding scope.";
  if (todos > 6) return "TODO count is visible; clear one or two nearby notes first.";
  if (productivity >= 90 && pressure < 25) return "Momentum is strong; push one complete small feature.";
  if (productivity >= 75) return "Proceed steadily with small and traceable commits.";
  if (productivity < 35) return "Warm up with a low-risk task like docs or a minor cleanup.";
  return "Move in small steps and keep context notes up to date.";
};

export const analyzeRepository = async (repoPath) => {
  const absolutePath = path.resolve(repoPath);
  const inside = await runGit(absolutePath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") throw new Error("Not a Git repository. Please select a project directory containing .git.");

  const repoName = path.basename(await runGit(absolutePath, ["rev-parse", "--show-toplevel"]));
  const currentBranch = await runGit(absolutePath, ["branch", "--show-current"]).catch(() => "detached");
  const since = "7 days ago";
  const today = "midnight";

  const [commitRaw, todayRaw, numstatRaw, branchRaw, lastCommitRaw] = await Promise.all([
    runGit(absolutePath, ["log", `--since=${since}`, "--pretty=format:%h|%ct|%an|%s"]).catch(() => ""),
    runGit(absolutePath, ["log", `--since=${today}`, "--pretty=format:%h|%ct|%an|%s"]).catch(() => ""),
    runGit(absolutePath, ["log", `--since=${since}`, "--numstat", "--pretty=format:"]).catch(() => ""),
    runGit(absolutePath, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)|%(committerdate:unix)",
      "refs/heads",
      "refs/remotes",
    ]).catch(() => ""),
    runGit(absolutePath, ["log", "-1", "--pretty=format:%ct|%s"]).catch(() => ""),
  ]);

  const commits = parseCommits(commitRaw);
  const todayCommits = parseCommits(todayRaw);
  const { additions, deletions, filesChanged } = parseNumstat(numstatRaw);
  const { todos, scanned } = await countTodos(absolutePath);
  const branches = parseActiveBranches(branchRaw);

  const stressPattern = /\b(fix|bug|error|fail|broken|rollback|revert|conflict|hotfix|crash)\b/i;
  const mergeCount = commits.filter((commit) => /^merge\b/i.test(commit.message)).length;
  const stressMessages = commits.filter((commit) => stressPattern.test(commit.message)).length;
  const [lastCommitTimestamp, lastCommitMessage = "No commits yet"] = lastCommitRaw.split("|");
  const hoursSinceLastCommit = lastCommitTimestamp
    ? Math.round((Date.now() / 1000 - Number(lastCommitTimestamp)) / 3600)
    : 9999;
  const mood = scoreMoodV2({ commits, additions, deletions, todos, mergeCount, stressMessages, hoursSinceLastCommit });

  return {
    repoName,
    repoPath: absolutePath,
    currentBranch,
    generatedAt: new Date().toISOString(),
    window: "Last 7 days",
    weather: mood.weather,
    metrics: {
      productivity: mood.productivity,
      pressure: mood.pressure,
      stability: mood.stability,
      codeTemperature: Math.max(12, Math.min(42, Math.round(22 + additions / 120 + commits.length * 1.8 - deletions / 180))),
      commitHumidity: Math.max(18, Math.min(96, Math.round(commits.length * 9 + todayCommits.length * 11 + 24))),
      bugWind: Number(Math.max(0.4, Math.min(12, stressMessages * 1.7 + todos / 10 + mergeCount * 1.1)).toFixed(1)),
      commits: commits.length,
      todayCommits: todayCommits.length,
      additions,
      deletions,
      filesChanged,
      todos,
      scannedFiles: scanned,
      branchCount: branches.length,
      mergeCount,
      stressMessages,
      hoursSinceLastCommit,
    },
    suggestion: getSuggestionV2({
      productivity: mood.productivity,
      pressure: mood.pressure,
      todos,
      hoursSinceLastCommit,
      mergeCount,
      stressMessages,
    }),
    lastCommit: {
      message: lastCommitMessage,
      hoursAgo: hoursSinceLastCommit,
    },
    recentCommits: commits.slice(0, 8),
    branches,
  };
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/default-path") {
    json(res, 200, { path: ROOT });
    return;
  }

  if (url.pathname === "/api/analyze") {
    const repoPath = url.searchParams.get("path") || ROOT;
    try {
      json(res, 200, await analyzeRepository(repoPath));
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  await sendStatic(res, url.pathname);
});

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (process.argv.includes("--check")) {
  console.log("GitWeather static build check passed.");
  process.exit(0);
}

if (isMain) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`GitWeather listening on http://127.0.0.1:${PORT}`);
  });
}
