"""
database.py — SQLite persistence layer for GTC-Project.

Design:
  - get_db() is a context-manager: opens a connection, enables WAL mode
    and foreign keys, commits on clean exit, rolls back on any exception,
    and always closes.  Every public function uses `with get_db() as conn`.
  - get_state() uses JOIN queries instead of N+1 loops.
  - No mutable default arguments.
  - UNIQUE indexes prevent duplicate subject/teacher/division names.
  - save_full_state() replaces all data in one atomic transaction.
"""

import sqlite3
import os
import logging
from contextlib import contextmanager

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "timetable.db")


# ── Connection context-manager ────────────────────────────────────────────────

@contextmanager
def get_db():
    """
    Yield an open sqlite3.Connection.
    • Commits on clean exit.
    • Rolls back and re-raises on any exception.
    • Always closes the connection.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")   # Better read concurrency
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Schema bootstrap ──────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables and unique indexes if they do not already exist."""
    with get_db() as conn:
        # Subjects
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subjects (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name)
        """)

        # Teachers
        conn.execute("""
            CREATE TABLE IF NOT EXISTS teachers (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_name ON teachers(name)
        """)

        # Teacher-Subject junction
        conn.execute("""
            CREATE TABLE IF NOT EXISTS teacher_subjects (
                teacher_id TEXT NOT NULL,
                subject_id TEXT NOT NULL,
                PRIMARY KEY (teacher_id, subject_id),
                FOREIGN KEY (teacher_id) REFERENCES teachers(id)  ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subjects(id)  ON DELETE CASCADE
            )
        """)

        # Divisions
        conn.execute("""
            CREATE TABLE IF NOT EXISTS divisions (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_divisions_name ON divisions(name)
        """)

        # Division-Subject junction
        conn.execute("""
            CREATE TABLE IF NOT EXISTS division_subjects (
                division_id TEXT NOT NULL,
                subject_id  TEXT NOT NULL,
                PRIMARY KEY (division_id, subject_id),
                FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id)  REFERENCES subjects(id)  ON DELETE CASCADE
            )
        """)

        # Coloring results
        conn.execute("""
            CREATE TABLE IF NOT EXISTS coloring (
                subject_id TEXT PRIMARY KEY,
                color      INTEGER NOT NULL,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
            )
        """)

        # Algorithm trace
        conn.execute("""
            CREATE TABLE IF NOT EXISTS algo_steps (
                num    INTEGER PRIMARY KEY,
                name   TEXT    NOT NULL,
                slot   INTEGER NOT NULL,
                reason TEXT
            )
        """)

    logger.info("[DB] Tables initialised — %s", DB_PATH)


# ── Full state read ───────────────────────────────────────────────────────────

def get_state() -> dict:
    """
    Return the full application state.
    Uses JOIN queries (not N+1 loops) for teachers and divisions.
    """
    with get_db() as conn:
        # Subjects
        subjects = [dict(r) for r in conn.execute(
            "SELECT id, name FROM subjects"
        ).fetchall()]

        # Teachers + their subjects (one JOIN, not one query per teacher)
        rows = conn.execute("""
            SELECT t.id, t.name, ts.subject_id
              FROM teachers t
              LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id
             ORDER BY t.rowid
        """).fetchall()
        teachers_map: dict = {}
        for r in rows:
            tid = r["id"]
            if tid not in teachers_map:
                teachers_map[tid] = {"id": tid, "name": r["name"], "subjects": []}
            if r["subject_id"]:
                teachers_map[tid]["subjects"].append(r["subject_id"])
        teachers_list = list(teachers_map.values())

        # Divisions + their subjects (same pattern)
        rows = conn.execute("""
            SELECT d.id, d.name, ds.subject_id
              FROM divisions d
              LEFT JOIN division_subjects ds ON ds.division_id = d.id
             ORDER BY d.rowid
        """).fetchall()
        divs_map: dict = {}
        for r in rows:
            did = r["id"]
            if did not in divs_map:
                divs_map[did] = {"id": did, "name": r["name"], "subjects": []}
            if r["subject_id"]:
                divs_map[did]["subjects"].append(r["subject_id"])
        divisions_list = list(divs_map.values())

        # Coloring
        coloring = {r["subject_id"]: r["color"] for r in conn.execute(
            "SELECT subject_id, color FROM coloring"
        ).fetchall()}

        # Algorithm steps
        algo_steps = [dict(r) for r in conn.execute(
            "SELECT num, name, slot, reason FROM algo_steps ORDER BY num"
        ).fetchall()]

    return {
        "subjects":  subjects,
        "teachers":  teachers_list,
        "divisions": divisions_list,
        "coloring":  coloring,
        "algoSteps": algo_steps,
        "schedule":  {},   # Built client-side by buildSchedule()
    }


# ── Individual list helpers ───────────────────────────────────────────────────

def get_subjects() -> list:
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, name FROM subjects"
        ).fetchall()]


def get_teachers() -> list:
    with get_db() as conn:
        rows = conn.execute("""
            SELECT t.id, t.name, ts.subject_id
              FROM teachers t
              LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id
             ORDER BY t.rowid
        """).fetchall()
        m: dict = {}
        for r in rows:
            tid = r["id"]
            if tid not in m:
                m[tid] = {"id": tid, "name": r["name"], "subjects": []}
            if r["subject_id"]:
                m[tid]["subjects"].append(r["subject_id"])
        return list(m.values())


def get_divisions() -> list:
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.id, d.name, ds.subject_id
              FROM divisions d
              LEFT JOIN division_subjects ds ON ds.division_id = d.id
             ORDER BY d.rowid
        """).fetchall()
        m: dict = {}
        for r in rows:
            did = r["id"]
            if did not in m:
                m[did] = {"id": did, "name": r["name"], "subjects": []}
            if r["subject_id"]:
                m[did]["subjects"].append(r["subject_id"])
        return list(m.values())


def get_coloring() -> dict:
    with get_db() as conn:
        coloring = {r["subject_id"]: r["color"] for r in conn.execute(
            "SELECT subject_id, color FROM coloring"
        ).fetchall()}
        steps = [dict(r) for r in conn.execute(
            "SELECT num, name, slot, reason FROM algo_steps ORDER BY num"
        ).fetchall()]
    return {"coloring": coloring, "algoSteps": steps}


# ── Subject CRUD ──────────────────────────────────────────────────────────────

def add_subject(sub_id: str, name: str) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT INTO subjects (id, name) VALUES (?, ?)", (sub_id, name)
        )


def rename_subject(sub_id: str, new_name: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE subjects SET name = ? WHERE id = ?", (new_name, sub_id)
        )


def delete_subject(sub_id: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM subjects WHERE id = ?", (sub_id,))
        # FK CASCADE removes: teacher_subjects, division_subjects, coloring


# ── Teacher CRUD ──────────────────────────────────────────────────────────────

def add_teacher(t_id: str, name: str, subject_ids=None) -> None:
    # FIX: mutable default argument replaced with None sentinel
    if subject_ids is None:
        subject_ids = []
    with get_db() as conn:
        conn.execute(
            "INSERT INTO teachers (id, name) VALUES (?, ?)", (t_id, name)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)",
            [(t_id, s_id) for s_id in subject_ids],
        )


def rename_teacher(t_id: str, new_name: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE teachers SET name = ? WHERE id = ?", (new_name, t_id)
        )


def update_teacher_subjects(t_id: str, subject_ids=None) -> None:
    if subject_ids is None:
        subject_ids = []
    with get_db() as conn:
        conn.execute(
            "DELETE FROM teacher_subjects WHERE teacher_id = ?", (t_id,)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)",
            [(t_id, s_id) for s_id in subject_ids],
        )


def delete_teacher(t_id: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM teachers WHERE id = ?", (t_id,))


# ── Division CRUD ─────────────────────────────────────────────────────────────

def add_division(d_id: str, name: str, subject_ids=None) -> None:
    # FIX: mutable default argument replaced with None sentinel
    if subject_ids is None:
        subject_ids = []
    with get_db() as conn:
        conn.execute(
            "INSERT INTO divisions (id, name) VALUES (?, ?)", (d_id, name)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO division_subjects (division_id, subject_id) VALUES (?, ?)",
            [(d_id, s_id) for s_id in subject_ids],
        )


def rename_division(d_id: str, new_name: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE divisions SET name = ? WHERE id = ?", (new_name, d_id)
        )


def update_division_subjects(d_id: str, subject_ids=None) -> None:
    if subject_ids is None:
        subject_ids = []
    with get_db() as conn:
        conn.execute(
            "DELETE FROM division_subjects WHERE division_id = ?", (d_id,)
        )
        conn.executemany(
            "INSERT OR IGNORE INTO division_subjects (division_id, subject_id) VALUES (?, ?)",
            [(d_id, s_id) for s_id in subject_ids],
        )


def delete_division(d_id: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM divisions WHERE id = ?", (d_id,))


# ── Coloring / Results ────────────────────────────────────────────────────────

def save_coloring_results(coloring: dict, steps: list) -> None:
    """Atomically replace coloring + algo_steps rows."""
    with get_db() as conn:
        conn.execute("DELETE FROM coloring")
        conn.execute("DELETE FROM algo_steps")
        conn.executemany(
            "INSERT INTO coloring (subject_id, color) VALUES (?, ?)",
            list(coloring.items()),
        )
        conn.executemany(
            "INSERT INTO algo_steps (num, name, slot, reason) VALUES (?, ?, ?, ?)",
            [(s["num"], s["name"], s["slot"], s["reason"]) for s in steps],
        )


# ── Atomic bulk replace ───────────────────────────────────────────────────────

def save_full_state(subjects: list, teachers: list, divisions: list,
                    coloring: dict = None, steps: list = None) -> None:
    """
    Replace ALL data in one single transaction.

    Fixes the race-condition in the original save_state() where each entity
    was inserted through a separate connection — a mid-way failure would
    leave the DB half-empty.
    """
    if coloring is None:
        coloring = {}
    if steps is None:
        steps = []

    with get_db() as conn:
        # 1 — wipe in dependency order (children before parents)
        for tbl in ("coloring", "algo_steps", "teacher_subjects",
                    "division_subjects", "subjects", "teachers", "divisions"):
            conn.execute(f"DELETE FROM {tbl}")

        # 2 — subjects
        conn.executemany(
            "INSERT INTO subjects (id, name) VALUES (?, ?)",
            [(s["id"], s["name"]) for s in subjects],
        )

        # 3 — teachers + junction
        conn.executemany(
            "INSERT INTO teachers (id, name) VALUES (?, ?)",
            [(t["id"], t["name"]) for t in teachers],
        )
        teacher_subs = [
            (t["id"], s_id)
            for t in teachers
            for s_id in t.get("subjects", [])
        ]
        if teacher_subs:
            conn.executemany(
                "INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)",
                teacher_subs,
            )

        # 4 — divisions + junction
        conn.executemany(
            "INSERT INTO divisions (id, name) VALUES (?, ?)",
            [(d["id"], d["name"]) for d in divisions],
        )
        div_subs = [
            (d["id"], s_id)
            for d in divisions
            for s_id in d.get("subjects", [])
        ]
        if div_subs:
            conn.executemany(
                "INSERT OR IGNORE INTO division_subjects (division_id, subject_id) VALUES (?, ?)",
                div_subs,
            )

        # 5 — coloring + steps (optional)
        if coloring:
            conn.executemany(
                "INSERT INTO coloring (subject_id, color) VALUES (?, ?)",
                list(coloring.items()),
            )
        if steps:
            conn.executemany(
                "INSERT INTO algo_steps (num, name, slot, reason) VALUES (?, ?, ?, ?)",
                [(s["num"], s["name"], s["slot"], s["reason"]) for s in steps],
            )


def clear_all_data() -> None:
    """Delete every row from every table, in dependency order."""
    with get_db() as conn:
        for tbl in ("coloring", "algo_steps", "teacher_subjects",
                    "division_subjects", "subjects", "teachers", "divisions"):
            conn.execute(f"DELETE FROM {tbl}")
