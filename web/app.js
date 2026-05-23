const API_BASE = "";

const $ = (selector) => document.querySelector(selector);

const setText = (selector, value) => {
  $(selector).textContent = value;
};

const setGauge = (ringSelector, textSelector, value) => {
  $(ringSelector).style.setProperty("--value", `${value}%`);
  setText(textSelector, `${value}%`);
};

const getComfort = (metrics) => {
  if (metrics.pressure >= 70) return "略崩�?;
  if (metrics.productivity >= 82) return "手感正热";
  if (metrics.stability >= 72) return "稳定推进";
  return "需要热�?;
};

const renderBranches = (branches) => {
  const list = $("#branch-list");
  list.innerHTML = "";

  if (!branches.length) {
    list.innerHTML = '<p class="muted">还没有分支观测数据�?/p>';
    return;
  }

  for (const branch of branches.slice(0, 4)) {
    const item = document.createElement("div");
    item.className = "branch-persona";
    item.innerHTML = `<strong></strong><span></span>`;
    item.querySelector("strong").textContent = branch.name;
    item.querySelector("span").textContent = branch.persona;
    list.append(item);
  }
};

const renderCommits = (forecast) => {
  const list = $("#commit-list");
  list.innerHTML = "";
  const last = forecast.lastCommit;
  setText("#last-commit", `上次提交�?{last.message}${last.hoursAgo ? ` · ${last.hoursAgo} 小时前` : ""}`);

  if (!forecast.recentCommits.length) {
    list.innerHTML = '<p class="muted">生成天气后会显示最近提交�?/p>';
    return;
  }

  for (const commit of forecast.recentCommits) {
    const item = document.createElement("div");
    item.className = "commit-item";
    item.innerHTML = `<code></code><span></span>`;
    item.querySelector("code").textContent = commit.hash;
    item.querySelector("span").textContent = commit.message;
    list.append(item);
  }
};

const renderForecast = (forecast) => {
  const metrics = forecast.metrics;
  const shell = $("#app");
  shell.className = `app-shell ${forecast.weather.gradient || "clear"}`;

  setText("#repo-title", `${forecast.repoName} 今日天气`);
  setText("#weather-emoji", forecast.weather.emoji);
  setText("#weather-title", forecast.weather.title);
  setText("#current-branch", forecast.currentBranch || "detached");
  setText("#weather-headline", forecast.weather.headline);
  setText("#code-temperature", `${metrics.codeTemperature}℃`);
  setText("#commit-humidity", `${metrics.commitHumidity}%`);
  setText("#bug-wind", `${metrics.bugWind} m/s`);
  setText("#comfort", getComfort(metrics));
  setText("#suggestion", forecast.suggestion);

  setGauge("#productivity-ring", "#productivity", metrics.productivity);
  setGauge("#pressure-ring", "#pressure", metrics.pressure);
  setGauge("#stability-ring", "#stability", metrics.stability);

  setText("#commits", metrics.commits);
  setText("#today-commits", `今日 ${metrics.todayCommits}`);
  setText("#lines", `+${metrics.additions} / -${metrics.deletions}`);
  setText("#files-changed", `${metrics.filesChanged} 个文件`);
  setText("#todos", metrics.todos);
  setText("#scanned-files", `扫描 ${metrics.scannedFiles || 0} 个文件`);
  setText("#merges", metrics.mergeCount);
  setText("#stress", `${metrics.stressMessages} 条压力消息`);

  renderBranches(forecast.branches);
  renderCommits(forecast);
};

const analyze = async () => {
  const input = $("#repo-path");
  const button = $("#analyze-button");
  const message = $("#form-message");
  const repoPath = input.value.trim();

  if (!repoPath) return;

  button.disabled = true;
  button.textContent = "观测�?..";
  message.className = "hint";
  message.textContent = "代码气象雷达正在扫描最�?7 天的 Git 云图�?;

  try {
    const response = await fetch(`${API_BASE}/api/analyze?path=${encodeURIComponent(repoPath)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "分析失败");
    renderForecast(data);
    message.textContent = "观测完成。本地数据没有离开你的电脑�?;
  } catch (error) {
    message.className = "error";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "生成天气";
  }
};

$("#path-form").addEventListener("submit", (event) => {
  event.preventDefault();
  analyze();
});

fetch(`${API_BASE}/api/default-path`)
  .then((response) => response.json())
  .then((data) => {
    $("#repo-path").value = data.path;
  })
  .catch(() => {});
