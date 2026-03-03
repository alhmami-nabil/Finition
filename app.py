import os
import json
import pyodbc
from flask import Flask, render_template, send_from_directory, abort, jsonify, request
import logging

app = Flask(__name__)

FOLDER_PATH = os.getenv('IMAGE_FOLDER_PATH',
                        r'M:\General\Process and Tools\Internal\Formation\NAL\Script\Catalog Finition\IVIS')

# ── COLOUR SYSTEMS (DYNAMIC) ─────────────────────────────────────────────────
SYSTEMS_FILE = os.path.join(os.path.dirname(__file__), 'systems.json')


def load_systems():
    """Load systems from JSON, converting old string format if necessary."""
    try:
        with open(SYSTEMS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if all(isinstance(v, str) for v in data.values()):
            systems = {k: {'display': k.capitalize(), 'pattern': v} for k, v in data.items()}
            with open(SYSTEMS_FILE, 'w', encoding='utf-8') as f:
                json.dump(systems, f, indent=4, ensure_ascii=False)
            logging.info("Converted old systems format to new object format.")
        else:
            systems = data
        logging.info(f"Loaded systems from {SYSTEMS_FILE}")
        return systems
    except FileNotFoundError:
        systems = {
            'ral': {'display': 'RAL', 'pattern': 'RAL_%'}
        }
        try:
            with open(SYSTEMS_FILE, 'w', encoding='utf-8') as f:
                json.dump(systems, f, indent=4, ensure_ascii=False)
        except Exception as e:
            logging.error(f"Could not write fallback systems.json: {e}")
        logging.warning(f"{SYSTEMS_FILE} not found. Using and saved hardcoded systems.")
        return systems
    except json.JSONDecodeError as e:
        logging.error(f"Invalid JSON in {SYSTEMS_FILE}: {e}")
        return {}


SYSTEMS = load_systems()


# ── DATABASE ──────────────────────────────────────────────────────────────────
def connect():
    try:
        return pyodbc.connect(
            "Driver={SQL Server};"
            "Server=BXL-SQL-IMD;"
            "Database=2124;"
            "Trusted_Connection=yes;"
        )
    except pyodbc.Error as e:
        logging.error(f"Database connection error: {e}")
        raise


def fetch_for_prefix(pattern: str):
    try:
        conn = connect()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT
                    MAX(RENDER_MAT) AS RENDER_MAT,
                    CODE1,
                    CODE2,
                    MAX(IIF(name LIKE '%_C', 'CO', ''))                                     AS CO_Flag,
                    MAX(IIF(name LIKE '%_M', 'MA', ''))                                     AS MA_Flag,
                    MAX(IIF(name NOT LIKE '%_C' AND name NOT LIKE '%_M', 'ST', ''))         AS ST_Flag
                FROM RENDER
                WHERE CODE1 not like '' and NAME NOT LIKE '%2F' and NAME LIKE ?
                GROUP BY CODE1, CODE2
            """, pattern)
            return [(r.RENDER_MAT, r.CODE1, r.CODE2, r.CO_Flag, r.MA_Flag, r.ST_Flag)
                    for r in cursor.fetchall()]
    except Exception as e:
        logging.error(f"Error fetching pattern {pattern}: {e}")
        raise
    finally:
        if 'conn' in locals() and conn:
            conn.close()


def find_images(rows):
    found = []
    for RENDER_MAT, CODE1, CODE2, CO_Flag, MA_Flag, ST_Flag in rows:
        for ext in ['.jpg', '.jpeg', '.png']:
            filename = f"{RENDER_MAT}{ext}"
            if os.path.isfile(os.path.join(FOLDER_PATH, filename)):
                found.append({
                    'image': filename,
                    'code1': CODE1 or '',
                    'code2': CODE2 or '',
                    'co_flag': CO_Flag or '',
                    'ma_flag': MA_Flag or '',
                    'st_flag': ST_Flag or '',
                })
                break
    return found


# ── PER-SYSTEM CACHE ──────────────────────────────────────────────────────────
_cache: dict = {}


def get_system_images(system_key: str):
    if system_key not in _cache:
        if system_key not in SYSTEMS:
            logging.error(f"Unknown system key: {system_key}")
            return []
        pattern = SYSTEMS[system_key]['pattern']
        _cache[system_key] = find_images(fetch_for_prefix(pattern))
    return _cache[system_key]


# ── ROUTES ────────────────────────────────────────────────────────────────────
@app.route('/')
@app.route('/stock-tecnibo')
@app.route('/favorites')
@app.route('/tools/finition/')
@app.route('/tools/finition/stock-tecnibo')
@app.route('/tools/finition/favorites')
def index():
    return render_template('index.html', systems=SYSTEMS)


@app.route('/api/images/<s>')
def api_images(s):
    if s not in SYSTEMS:
        abort(404)
    return jsonify(get_system_images(s))


@app.route('/images/<filename>')
def send_image(filename):
    try:
        return send_from_directory(FOLDER_PATH, filename)
    except Exception as e:
        logging.error(f"Error sending image: {e}")
        abort(404)


@app.route('/api/systems', methods=['POST'])
def add_system():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    key = data.get('key', '').strip().lower()
    display = data.get('display', '').strip()
    pattern = data.get('pattern', '').strip()

    if not key or not display or not pattern:
        return jsonify({'error': 'All fields are required'}), 400

    if key in SYSTEMS:
        return jsonify({'error': f'System key "{key}" already exists'}), 409

    if not pattern.endswith('_%'):
        pattern = pattern.rstrip('%') + '_%'

    SYSTEMS[key] = {'display': display, 'pattern': pattern}

    try:
        with open(SYSTEMS_FILE, 'w', encoding='utf-8') as f:
            json.dump(SYSTEMS, f, indent=4, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Failed to write systems.json: {e}")
        return jsonify({'error': 'Could not save system'}), 500

    _cache.pop(key, None)

    return jsonify({
        'message': f'System "{display}" added successfully',
        'system': {
            'key': key,
            'display': display,
            'pattern': pattern
        }
    }), 201


@app.route('/api/systems/<key>', methods=['DELETE'])
def delete_system(key):
    if key not in SYSTEMS:
        return jsonify({'error': f'System key "{key}" not found'}), 404

    del SYSTEMS[key]
    _cache.pop(key, None)

    try:
        with open(SYSTEMS_FILE, 'w', encoding='utf-8') as f:
            json.dump(SYSTEMS, f, indent=4, ensure_ascii=False)
    except Exception as e:
        logging.error(f"Failed to write systems.json after delete: {e}")
        return jsonify({'error': 'Could not save changes'}), 500

    return jsonify({'message': f'System "{key}" deleted successfully'}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)