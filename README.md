# Graph Coloring Timetable Scheduler

A **VTU 3rd/4th Semester CS Mini Project** that uses the **Greedy Graph Coloring Algorithm** to generate conflict-free academic timetables.

Built with: **Flask · SQLite · Vanilla JS · HTML/CSS**

---

## Features

- **Auto Conflict Detection** — Automatically detects which subjects share teachers or class divisions
- **Greedy Graph Coloring** — Assigns minimum time slots so no two conflicting subjects share a slot
- **Interactive Graph View** — Visualize the full conflict graph with colored nodes
- **Faculty Weekly Schedule** — Per-teacher weekly timetable view
- **Division Timetable** — Per-division weekly schedule grid
- **Step-by-step Algorithm Trace** — See exactly why each subject was assigned its slot
- **Dark / Light / System Theme** — Persistent theme switcher
- **Animated Hero Background** — 3D parallax graph theory animation on the home page

---

## Project Structure

```
GTC-Project/
├── backend/
│   ├── app.py          # Flask API server (REST endpoints)
│   └── database.py     # SQLite persistence layer
├── css/
│   └── style.css       # Main stylesheet (Black · Orange · White theme)
├── js/
│   ├── state.js        # App state, graph coloring algorithm, schedule helpers
│   ├── theme.js        # Dark/Light/System theme switcher
│   ├── hero-graph.js   # 3D parallax hero animation
│   └── bg3d.js         # Animated graph background
├── index.html          # Home page
├── setup.html          # Setup: Subjects · Teachers · Divisions
├── graph.html          # Conflict graph visualizer
├── timetable.html      # Generated timetable view
├── faculty.html        # Faculty weekly schedule
├── division.html       # Division weekly schedule
└── requirements.txt    # Python dependencies
```

---

## Setup & Run

### Prerequisites
- Python 3.9+
- pip

### Install dependencies

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### Run the server

```bash
python backend/app.py
```


---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/state` | Full application state |
| `POST` | `/api/state` | Replace full state (atomic) |
| `POST` | `/api/generate` | Run greedy graph coloring |
| `POST` | `/api/clear` | Wipe all data |
| `POST` | `/api/sample` | Load demo data |
| `GET` | `/api/subjects` | List subjects |
| `POST` | `/api/subjects` | Add subject |
| `PATCH` | `/api/subjects/<id>` | Rename subject |
| `DELETE` | `/api/subjects/<id>` | Delete subject |
| `GET` | `/api/teachers` | List teachers |
| `POST` | `/api/teachers` | Add teacher |
| `PATCH` | `/api/teachers/<id>` | Rename teacher |
| `POST` | `/api/teachers/<id>/subjects` | Update teacher's subjects |
| `DELETE` | `/api/teachers/<id>` | Delete teacher |
| `GET` | `/api/divisions` | List divisions |
| `POST` | `/api/divisions` | Add division |
| `PATCH` | `/api/divisions/<id>` | Rename division |
| `POST` | `/api/divisions/<id>/subjects` | Update division's subjects |
| `DELETE` | `/api/divisions/<id>` | Delete division |
| `GET` | `/api/coloring` | Current coloring result + algorithm steps |

---

## Algorithm

The project implements **Greedy Graph Coloring**:

1. Model each subject as a **node** in an undirected graph
2. Add an **edge** between two subjects if they share a teacher or division
3. Iterate subjects and assign the **smallest color (slot)** not used by any neighbor
4. The number of colors used = number of time slots needed

**Complexity:** O(V²) — near-optimal for university scheduling use cases.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, Flask, Flask-CORS |
| Database | SQLite 3 (WAL mode, foreign keys) |
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Animation | Canvas API (2D) |
| Styling | CSS custom properties, glassmorphism |

---

## License

MIT — free to use for academic purposes.
