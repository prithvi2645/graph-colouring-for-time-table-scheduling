"""
app.py — Flask API server for GTC-Project.

Improvements over original:
  - @require_json decorator prevents NoneType crashes on malformed requests.
  - sanitize() strips whitespace and enforces a max field length.
  - ok() / err() helpers give consistent JSON response shapes.
  - save_state() and seed_sample() use database.save_full_state() (atomic).
  - debug mode driven by FLASK_DEBUG env-var (not hardcoded True).
  - Structured logging with logging.basicConfig.
  - 404 / 405 JSON error handlers.
  - New GET endpoints: /api/subjects, /api/teachers, /api/divisions, /api/coloring.
  - New PATCH endpoints for renaming entities.
  - Empty-subjects guard in /api/generate.

All existing frontend JS continues to work — no URLs or response shapes removed.

Route map
─────────────────────────────────────────────────────────────────────────────
Static
  GET  /                              → index.html
  GET  /<path>                        → any static file

Bulk state
  GET  /api/state                     → full state snapshot
  POST /api/state                     → atomic full-state replace
  POST /api/clear                     → wipe all data
  POST /api/sample                    → seed demo data
  POST /api/generate                  → run greedy coloring on DB data

Subjects
  GET    /api/subjects                → list
  POST   /api/subjects                → create          (201)
  PATCH  /api/subjects/<id>           → rename
  DELETE /api/subjects/<id>           → delete

Teachers
  GET    /api/teachers                → list
  POST   /api/teachers                → create          (201)
  PATCH  /api/teachers/<id>           → rename
  POST   /api/teachers/<id>/subjects  → update subject list
  DELETE /api/teachers/<id>           → delete

Divisions
  GET    /api/divisions               → list
  POST   /api/divisions               → create          (201)
  PATCH  /api/divisions/<id>          → rename
  POST   /api/divisions/<id>/subjects → update subject list
  DELETE /api/divisions/<id>          → delete

Results
  GET  /api/coloring                  → current coloring + algo steps
─────────────────────────────────────────────────────────────────────────────
"""

import os
import logging
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS

import database

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if os.getenv("FLASK_DEBUG") else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app, origins=["http://127.0.0.1:5000", "http://localhost:5000"])

database.init_db()


# ── Response helpers ──────────────────────────────────────────────────────────

def ok(data: dict = None, code: int = 200):
    """Return a successful JSON response."""
    resp = {"success": True}
    if data:
        resp.update(data)
    return jsonify(resp), code


def err(msg: str, code: int = 500):
    """Return an error JSON response and log it."""
    logger.error("API error %d: %s", code, msg)
    return jsonify({"success": False, "error": msg}), code


# ── Input helpers ─────────────────────────────────────────────────────────────

def sanitize(value, max_len: int = 120) -> str:
    """Strip whitespace and enforce a maximum field length."""
    return str(value).strip()[:max_len]


def require_json(f):
    """
    Decorator: return HTTP 400 if the request body is missing or not valid JSON.
    Prevents AttributeError / NoneType crashes when Content-Type is wrong.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not request.is_json or request.json is None:
            return err("Request body must be valid JSON "
                       "(Content-Type: application/json)", 400)
        return f(*args, **kwargs)
    return wrapper


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(_e):
    return jsonify({"success": False, "error": "Not found"}), 404


@app.errorhandler(405)
def method_not_allowed(_e):
    return jsonify({"success": False, "error": "Method not allowed"}), 405


# ── Static serving ────────────────────────────────────────────────────────────
# Flask's built-in static file handler now serves everything from frontend/.
# static_folder="../frontend" means:
#   /             → frontend/index.html
#   /setup.html   → frontend/setup.html
#   /css/style.css → frontend/css/style.css
#   /js/state.js  → frontend/js/state.js  etc.

@app.route("/")
def serve_index():
    return app.send_static_file("index.html")

@app.route("/setup.html")
def serve_setup():
    return app.send_static_file("setup.html")

@app.route("/graph.html")
def serve_graph():
    return app.send_static_file("graph.html")

@app.route("/timetable.html")
def serve_timetable():
    return app.send_static_file("timetable.html")

@app.route("/faculty.html")
def serve_faculty():
    return app.send_static_file("faculty.html")

@app.route("/division.html")
def serve_division():
    return app.send_static_file("division.html")


# ═══════════════════════════════════════════════════════════════════════════════
# Bulk state
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/state", methods=["GET"])
def get_state():
    try:
        return ok({"state": database.get_state()})
    except Exception as e:
        return err(str(e))


@app.route("/api/state", methods=["POST"])
@require_json
def save_state():
    """
    Atomically replace full application state.
    Uses save_full_state() — one transaction — instead of the original
    pattern of clear_all_data() + N separate connections.
    """
    data = request.json
    try:
        database.save_full_state(
            subjects=data.get("subjects", []),
            teachers=data.get("teachers", []),
            divisions=data.get("divisions", []),
            coloring=data.get("coloring", {}),
            steps=data.get("algoSteps", []),
        )
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/clear", methods=["POST"])
def clear_all():
    try:
        database.clear_all_data()
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/sample", methods=["POST"])
@require_json
def seed_sample():
    """
    Seed the database with demo data.
    Previously duplicated save_state() logic — now delegates to save_full_state().
    """
    data = request.json
    try:
        database.save_full_state(
            subjects=data.get("subjects", []),
            teachers=data.get("teachers", []),
            divisions=data.get("divisions", []),
        )
        return ok()
    except Exception as e:
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Subjects
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/subjects", methods=["GET"])
def list_subjects():
    try:
        return ok({"subjects": database.get_subjects()})
    except Exception as e:
        return err(str(e))


@app.route("/api/subjects", methods=["POST"])
@require_json
def create_subject():
    data   = request.json
    sub_id = data.get("id", "").strip()
    name   = sanitize(data.get("name", ""))
    if not sub_id or not name:
        return err("Missing id or name", 400)
    try:
        database.add_subject(sub_id, name)
        return ok(code=201)
    except Exception as e:
        return err(str(e))


@app.route("/api/subjects/<sub_id>", methods=["PATCH"])
@require_json
def rename_subject(sub_id):
    name = sanitize(request.json.get("name", ""))
    if not name:
        return err("name is required", 400)
    try:
        database.rename_subject(sub_id, name)
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/subjects/<sub_id>", methods=["DELETE"])
def remove_subject(sub_id):
    try:
        database.delete_subject(sub_id)
        return ok()
    except Exception as e:
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Teachers
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/teachers", methods=["GET"])
def list_teachers():
    try:
        return ok({"teachers": database.get_teachers()})
    except Exception as e:
        return err(str(e))


@app.route("/api/teachers", methods=["POST"])
@require_json
def create_teacher():
    data        = request.json
    t_id        = data.get("id", "").strip()
    name        = sanitize(data.get("name", ""))
    subject_ids = data.get("subjects", [])
    if not t_id or not name:
        return err("Missing id or name", 400)
    try:
        database.add_teacher(t_id, name, subject_ids)
        return ok(code=201)
    except Exception as e:
        return err(str(e))


@app.route("/api/teachers/<t_id>", methods=["PATCH"])
@require_json
def rename_teacher(t_id):
    name = sanitize(request.json.get("name", ""))
    if not name:
        return err("name is required", 400)
    try:
        database.rename_teacher(t_id, name)
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/teachers/<t_id>/subjects", methods=["POST"])
@require_json
def update_teacher_subs(t_id):
    subject_ids = request.json.get("subjects", [])
    try:
        database.update_teacher_subjects(t_id, subject_ids)
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/teachers/<t_id>", methods=["DELETE"])
def remove_teacher(t_id):
    try:
        database.delete_teacher(t_id)
        return ok()
    except Exception as e:
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Divisions
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/divisions", methods=["GET"])
def list_divisions():
    try:
        return ok({"divisions": database.get_divisions()})
    except Exception as e:
        return err(str(e))


@app.route("/api/divisions", methods=["POST"])
@require_json
def create_division():
    data        = request.json
    d_id        = data.get("id", "").strip()
    name        = sanitize(data.get("name", ""))
    subject_ids = data.get("subjects", [])
    if not d_id or not name:
        return err("Missing id or name", 400)
    try:
        database.add_division(d_id, name, subject_ids)
        return ok(code=201)
    except Exception as e:
        return err(str(e))


@app.route("/api/divisions/<d_id>", methods=["PATCH"])
@require_json
def rename_division(d_id):
    name = sanitize(request.json.get("name", ""))
    if not name:
        return err("name is required", 400)
    try:
        database.rename_division(d_id, name)
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/divisions/<d_id>/subjects", methods=["POST"])
@require_json
def update_division_subs(d_id):
    subject_ids = request.json.get("subjects", [])
    try:
        database.update_division_subjects(d_id, subject_ids)
        return ok()
    except Exception as e:
        return err(str(e))


@app.route("/api/divisions/<d_id>", methods=["DELETE"])
def remove_division(d_id):
    try:
        database.delete_division(d_id)
        return ok()
    except Exception as e:
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Coloring results
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/coloring", methods=["GET"])
def get_coloring():
    try:
        return ok(database.get_coloring())
    except Exception as e:
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════════
# Timetable generation
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/api/generate", methods=["POST"])
def generate_timetable():
    try:
        state = database.get_state()

        if not state["subjects"]:
            return err("No subjects found. Add subjects before generating.", 400)

        # ── 1. Build conflict graph ──────────────────────────────────────────
        conflict_pairs: set = set()

        for t in state["teachers"]:
            subs = t.get("subjects", [])
            for i in range(len(subs)):
                for j in range(i + 1, len(subs)):
                    if subs[i] != subs[j]:
                        conflict_pairs.add(tuple(sorted([subs[i], subs[j]])))

        for d in state["divisions"]:
            subs = d.get("subjects", [])
            for i in range(len(subs)):
                for j in range(i + 1, len(subs)):
                    if subs[i] != subs[j]:
                        conflict_pairs.add(tuple(sorted([subs[i], subs[j]])))

        conflicts = list(conflict_pairs)

        # ── 2. Greedy graph coloring ─────────────────────────────────────────
        subjects      = state["subjects"]
        coloring: dict = {}
        steps:    list = []

        for idx, subject in enumerate(subjects):
            sub_id   = subject["id"]
            sub_name = subject["name"]

            neighbor_colors: set = set()
            for a, b in conflicts:
                if a == sub_id and b in coloring:
                    neighbor_colors.add(coloring[b])
                elif b == sub_id and a in coloring:
                    neighbor_colors.add(coloring[a])

            color = 0
            while color in neighbor_colors:
                color += 1

            coloring[sub_id] = color

            # Build trace reason
            colored_neighbors = []
            for a, b in conflicts:
                if a == sub_id or b == sub_id:
                    nbr_id = b if a == sub_id else a
                    if nbr_id in coloring:
                        nbr = next(
                            (s for s in subjects if s["id"] == nbr_id), None
                        )
                        if nbr:
                            colored_neighbors.append(
                                f"{nbr['name']} (Slot {coloring[nbr_id] + 1})"
                            )

            reason = (
                f"Neighbors already assigned: {', '.join(colored_neighbors)}"
                if colored_neighbors
                else "No conflicting neighbors colored yet — first available slot assigned"
            )

            steps.append({
                "num":    idx + 1,
                "name":   sub_name,
                "slot":   color,
                "reason": reason,
            })

        # ── 3. Persist ───────────────────────────────────────────────────────
        database.save_coloring_results(coloring, steps)

        slots_used = max(coloring.values(), default=-1) + 1
        logger.info(
            "Timetable generated: %d subjects, %d conflict pairs, %d slot(s) used",
            len(subjects), len(conflicts), slots_used,
        )

        return ok({"coloring": coloring, "steps": steps})

    except Exception as e:
        logger.exception("generate_timetable failed")
        return err(str(e))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    app.run(host="0.0.0.0", port=5000, debug=debug)
