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
  if (metrics.pressure >= 70) return "High pressure";
  if (metrics.productivity >= 82) return "In the zone";
  if (metrics.stability >= 72) return "Stable progress";
  return "Need warm-up";
};

const renderBranches = (branches) => {
  const list = $("#branch-list");
  list.innerHTML = "";

  if (!branches.length) {
    list.innerHTML = '<p class="muted">No branch activity data yet.</p>';
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
  setText("#last-commit", `Last commit: ${last.message}${last.hoursAgo ? ` · ${last.hoursAgo}h ago` : ""}`);

  if (!forecast.recentCommits.length) {
    list.innerHTML = '<p class="muted">Recent commits will show up here after analysis.</p>';
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

  setText("#repo-title", `${forecast.repoName} Today`);
  setText("#weather-emoji", forecast.weather.emoji);
  setText("#weather-title", forecast.weather.title);
  setText("#current-branch", forecast.currentBranch || "detached");
  setText("#weather-headline", forecast.weather.headline);
  setText("#code-temperature", `${metrics.codeTemperature}°C`);
  setText("#commit-humidity", `${metrics.commitHumidity}%`);
  setText("#bug-wind", `${metrics.bugWind} m/s`);
  setText("#comfort", getComfort(metrics));
  setText("#suggestion", forecast.suggestion);

  setGauge("#productivity-ring", "#productivity", metrics.productivity);
  setGauge("#pressure-ring", "#pressure", metrics.pressure);
  setGauge("#stability-ring", "#stability", metrics.stability);

  setText("#commits", metrics.commits);
  setText("#today-commits", `Today ${metrics.todayCommits}`);
  setText("#lines", `+${metrics.additions} / -${metrics.deletions}`);
  setText("#files-changed", `${metrics.filesChanged} files`);
  setText("#todos", metrics.todos);
  setText("#scanned-files", `Scanned ${metrics.scannedFiles || 0} files`);
  setText("#merges", metrics.mergeCount);
  setText("#stress", `${metrics.stressMessages} stress messages`);

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
  button.textContent = "Analyzing...";
  message.className = "hint";
  message.textContent = "Scanning recent Git activity...";

  try {
    const response = await fetch(`${API_BASE}/api/analyze?path=${encodeURIComponent(repoPath)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Analysis failed");
    renderForecast(data);
    message.textContent = "Analysis complete. Data stays local.";
  } catch (error) {
    message.className = "error";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Generate Weather";
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
