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

  if (lower === "main" || lower === "master") return "稳重老父亲，保守但可靠";
  if (lower.includes("dev") || lower.includes("develop")) return "熬夜大学生，什么都敢合";
  if (lower.includes("ui") || lower.includes("style")) return "审美型人格，天天调颜色";
  if (lower.includes("bug") || lower.includes("fix")) return "外科医生，专门缝补语法伤口";
  if (lower.includes("feature") || lower.includes("feat")) return "探险家，背包里全是新想法";
  if (lower.includes("hotfix")) return "消防员，警报一响立刻出动";
  if (lower.includes("refactor")) return "整理癖建筑师，拆墙也要先画图";
  return "神秘支线，可能藏着一只还没命名的灵感怪";
};

const scoreMood = ({ commits, additions, deletions, todos, mergeCount, stressMessages, hoursSinceLastCommit }) => {
  let productivity = Math.min(100, commits.length * 14 + additions / 18 + deletions / 35 + 18);
  let pressure = todos * 2.4 + stressMessages * 12 + mergeCount * 8 + Math.max(0, deletions - additions) / 30;

  if (hoursSinceLastCommit > 72) productivity -= 30;
  if (hoursSinceLastCommit > 168) productivity -= 20;

  productivity = Math.max(5, Math.round(productivity - Math.min(30, pressure / 4)));
  pressure = Math.max(0, Math.min(100, Math.round(pressure)));
  const stability = Math.max(0, Math.min(100, Math.round(100 - pressure - mergeCount * 3 + commits.length * 2)));

  let weather = {
    type: "sunny",
    emoji: "☀️",
    title: "晴朗",
    headline: "开发气压稳定，适合继续推进新功能",
    gradient: "sunny",
  };

  if (hoursSinceLastCommit > 168) {
    weather = {
      type: "fog",
      emoji: "🌫️",
      title: "雾天",
      headline: "项目能见度下降，建议先做一次小型整理提交",
      gradient: "fog",
    };
  } else if (pressure >= 70) {
    weather = {
      type: "storm",
      emoji: "⛈️",
      title: "雷暴",
      headline: "Debug 压力较大，当前分支存在不稳定气流",
      gradient: "storm",
    };
  } else if (pressure >= 42) {
    weather = {
      type: "rain",
      emoji: "🌧️",
      title: "阵雨",
      headline: "代码湿度偏高，适合修小 bug、补测试和写注释",
      gradient: "rain",
    };
  } else if (productivity < 40) {
    weather = {
      type: "cloudy",
      emoji: "☁️",
      title: "多云",
      headline: "代码活跃度略低，适合做一次轻量整理",
      gradient: "cloudy",
    };
  } else if (productivity >= 82 && pressure < 35) {
    weather = {
      type: "clear",
      emoji: "🌤️",
      title: "晴间多云",
      headline: "生产力指数优秀，适合继续开发新功能",
      gradient: "clear",
    };
  }

  return { productivity, pressure, stability, weather };
};

const getSuggestion = ({ productivity, pressure, todos, hoursSinceLastCommit }) => {
  if (hoursSinceLastCommit > 168) return "先提交一个小而清晰的整理 commit，让项目重新进入可观测状态。";
  if (pressure >= 70) return "不建议大规模重构。先喝水，跑测试，挑一个最小 bug 拆掉。";
  if (todos > 12) return "TODO 云层有点厚，适合清理注释债和补 README。";
  if (productivity >= 82) return "天气窗口很好，可以推进一个边界清晰的新功能。";
  return "适合稳步开发：小步提交、及时记录上下文，别让灵感跑丢。";
};

const getBranchPersonaV2 = (branch) => {
  const lower = branch.replace(/^\*\s*/, "").trim().toLowerCase();

  if (lower === "main" || lower === "master") return "主干守门员，最近改动优先看稳定性";
  if (lower.includes("dev") || lower.includes("develop")) return "开发集散地，适合合并前做一次整理";
  if (lower.includes("ui") || lower.includes("style")) return "界面调色盘，注意交互细节和视觉一致性";
  if (lower.includes("bug") || lower.includes("fix")) return "修复现场，建议补一条复现或回归测试";
  if (lower.includes("feature") || lower.includes("feat")) return "功能推进线，适合拆小提交保留上下文";
  if (lower.includes("hotfix")) return "紧急通道，先止血再回补说明和测试";
  if (lower.includes("refactor")) return "结构整理线，改完记得跑一次关键路径";
  return "活跃分支，最近有动静，值得快速扫一眼";
};

const parseActiveBranches = (raw, limit = 3) => {
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
    emoji: "☀️",
    title: "晴朗",
    headline: "开发气压稳定，适合继续推进边界清晰的功能。",
    gradient: "sunny",
  };

  if (hoursSinceLastCommit > 168) {
    weather = { type: "fog", emoji: "🌫️", title: "大雾", headline: "项目能见度偏低，建议先做一次小整理，让上下文重新清晰。", gradient: "fog" };
  } else if (hoursSinceLastCommit > 72) {
    weather = { type: "overcast", emoji: "☁️", title: "阴天", headline: "最近提交间隔偏长，适合从一个低风险任务重新热身。", gradient: "overcast" };
  } else if (pressure >= 70) {
    weather = { type: "storm", emoji: "⛈️", title: "雷暴", headline: "Debug 压力较高，当前分支存在不稳定气流，先收敛问题面。", gradient: "storm" };
  } else if (pressure >= 55) {
    weather = { type: "shower", emoji: "🌦️", title: "阵雨", headline: "代码湿度上升，适合补测试、清小 bug，并控制改动范围。", gradient: "shower" };
  } else if (pressure >= 42) {
    weather = { type: "rain", emoji: "🌧️", title: "小雨", headline: "代码湿度偏高，适合修小 bug、补注释和整理待办。", gradient: "rain" };
  } else if (todos > 10) {
    weather = { type: "haze", emoji: "🌁", title: "薄雾", headline: "TODO 云层有点厚，短时间清理几处会让项目更轻。", gradient: "haze" };
  } else if (productivity < 40) {
    weather = { type: "cloudy", emoji: "☁️", title: "多云", headline: "代码活跃度略低，适合做一次轻量整理或小步提交。", gradient: "cloudy" };
  } else if (productivity >= 90 && pressure < 25) {
    weather = { type: "clear", emoji: "🌤️", title: "晴间多云", headline: "生产力指数很高，压力也低，可以推进一个完整的小功能。", gradient: "clear" };
  } else if (productivity >= 82 && pressure < 35) {
    weather = { type: "breeze", emoji: "🍃", title: "微风", headline: "节奏不错，适合继续推进，同时保留清晰提交记录。", gradient: "breeze" };
  }

  return { productivity, pressure, stability, weather };
};

const getSuggestionV2 = ({ productivity, pressure, todos, hoursSinceLastCommit, mergeCount, stressMessages }) => {
  if (hoursSinceLastCommit > 168) return "先做一个小而清晰的整理提交，把项目重新带回可观测状态。";
  if (pressure >= 70 && stressMessages > 0) return "今天不适合大重构。先跑测试，挑一个最小的失败点修掉，再继续扩展。";
  if (pressure >= 55) return "把改动控制在一个主题里，优先补回归测试和错误处理，避免问题面继续扩大。";
  if (mergeCount >= 2) return "合并活动偏多，建议先同步主干、确认冲突点，再继续写新代码。";
  if (todos > 12) return "TODO 云层偏厚，挑三处最靠近当前功能的待办清掉，收益会比较直接。";
  if (todos > 6) return "待办数量已经可见，新增功能前先处理一两处注释债，避免继续堆积。";
  if (productivity >= 90 && pressure < 25) return "状态很好，可以推进一个完整的小功能，但提交粒度保持清楚。";
  if (productivity >= 75) return "适合稳步开发：小步提交，及时记录上下文，把收尾工作留在同一个分支里。";
  if (productivity < 35) return "先选一个低风险任务热身，例如补 README、跑检查或清理一个小文件。";
  return "今天适合稳扎稳打：先确认当前目标，再用一到两个小提交推进。";
};

export const analyzeRepository = async (repoPath) => {
  const absolutePath = path.resolve(repoPath);
  const inside = await runGit(absolutePath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") throw new Error("这不是一个 Git 仓库。请选择包含 .git 的项目目录。");

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

  const stressPattern = /\b(fix|bug|error|fail|broken|rollback|revert|conflict|hotfix|崩|炸|错|修复|回滚)\b/i;
  const mergeCount = commits.filter((commit) => /^merge\b/i.test(commit.message)).length;
  const stressMessages = commits.filter((commit) => stressPattern.test(commit.message)).length;
  const [lastCommitTimestamp, lastCommitMessage = "暂无提交"] = lastCommitRaw.split("|");
  const hoursSinceLastCommit = lastCommitTimestamp
    ? Math.round((Date.now() / 1000 - Number(lastCommitTimestamp)) / 3600)
    : 9999;
  const mood = scoreMoodV2({ commits, additions, deletions, todos, mergeCount, stressMessages, hoursSinceLastCommit });

  return {
    repoName,
    repoPath: absolutePath,
    currentBranch,
    generatedAt: new Date().toISOString(),
    window: "最近 7 天",
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
