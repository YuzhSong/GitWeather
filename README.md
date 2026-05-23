# GitWeather

GitWeather turns recent Git activity into a readable "coding weather" dashboard.

It helps developers quickly understand whether the last week was stable delivery, heavy debugging, or firefighting, without digging through every commit.

## Why Developers Use It

- Fast signal from the last 7 days of repository activity
- Combines additions/deletions, changed files, TODO/FIXME, and merge behavior
- Local-first analysis; source code is not uploaded
- Lightweight and easy to run

## Screenshots

### 1) Dashboard Overview
![GitWeather Dashboard Overview](docs/images/dashboard-overview.png)

### 2) Weather and Metrics Panel
![GitWeather Weather Panel](docs/images/weather-panel.png)

### 3) Branch Personality and Rhythm Insights
![GitWeather Branch Personality](docs/images/branch-personality.png)

## Core Features

- `Code Weather`: sunny / cloudy / rainy / stormy / foggy
- Productivity, debugging pressure, and stability indicators
- Code temperature, commit humidity, bug wind speed, and developer comfort
- Branch personality view and recent commit timeline

## Quick Start

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:4177
```

## Roadmap (Toward IDE Plugin)

### Phase 1: Web Dashboard Enhancements
1. Multi-repo switching and trend comparison
2. Weekly/monthly exportable weather reports
3. Better anomaly detection for sudden debugging spikes

### Phase 2: IDE Plugin MVP (VS Code / JetBrains)
1. Sidebar weather and key metrics inside the IDE
2. Contextual hints based on current branch and commit rhythm
3. Lightweight "today's coding status" summary card

### Phase 3: Advanced Plugin Capabilities
1. Optional team-level trend aggregation
2. AI-assisted weekly summaries and risk highlights
3. CI-aware code health weather view

Contributions are welcome via Issues and PRs.
