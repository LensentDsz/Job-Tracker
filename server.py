from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import mimetypes
import sys
import time
import uuid


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "applications.json"
DELETED_FILE = DATA_DIR / "deleted-applications.json"
STATUSES = {"已投递", "有回应", "面试中", "Offer", "已拒绝", "已放弃"}


class JobTrackerHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/applications":
            self.send_json(read_applications())
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/applications":
            payload = self.read_json()
            if is_deleted_payload(payload):
                self.send_json({"ok": False, "reason": "Record was deleted"}, status=409)
                return

            applications = read_applications()
            existing_item = find_same_application(applications, payload)
            if existing_item:
                self.send_json(existing_item)
                return

            item = normalize_item(payload)
            applications.insert(0, item)
            write_applications(applications)
            self.send_json(item, status=201)
            return
        self.send_error(404)

    def do_PATCH(self):
        if self.path.startswith("/api/applications/"):
            item_id = self.path.rsplit("/", 1)[-1]
            payload = self.read_json()
            applications = read_applications()
            for item in applications:
                if item.get("id") == item_id:
                    if payload.get("status") in STATUSES:
                        item["status"] = payload["status"]
                    write_applications(applications)
                    self.send_json(item)
                    return
            self.send_error(404, "Record not found")
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/applications/"):
            item_id = self.path.rsplit("/", 1)[-1]
            applications = read_applications()
            deleted_item = next((item for item in applications if item.get("id") == item_id), None)
            next_applications = [item for item in applications if item.get("id") != item_id]
            write_applications(next_applications)
            remember_deleted_application(item_id, deleted_item)
            self.send_json({"ok": True})
            return
        self.send_error(404)

    def translate_path(self, path):
        safe_path = super().translate_path(path)
        return str(ROOT / Path(safe_path).relative_to(Path.cwd()))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))


def read_applications():
    if not DATA_FILE.exists():
        return []
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        backup = DATA_FILE.with_suffix(f".broken-{int(time.time())}.json")
        DATA_FILE.rename(backup)
        return []


def write_applications(applications):
    DATA_DIR.mkdir(exist_ok=True)
    temp_file = DATA_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(applications, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(DATA_FILE)


def read_deleted_applications():
    if not DELETED_FILE.exists():
        return {"ids": [], "signatures": []}
    try:
        data = json.loads(DELETED_FILE.read_text(encoding="utf-8"))
        return {
            "ids": data.get("ids", []),
            "signatures": data.get("signatures", []),
        }
    except json.JSONDecodeError:
        return {"ids": [], "signatures": []}


def write_deleted_applications(deleted):
    DATA_DIR.mkdir(exist_ok=True)
    temp_file = DELETED_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(deleted, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(DELETED_FILE)


def remember_deleted_application(item_id, item):
    deleted = read_deleted_applications()
    if item_id and item_id not in deleted["ids"]:
        deleted["ids"].append(item_id)

    signature = application_signature(item) if item else ""
    if signature and signature not in deleted["signatures"]:
        deleted["signatures"].append(signature)

    write_deleted_applications(deleted)


def is_deleted_payload(payload):
    deleted = read_deleted_applications()
    return payload.get("id") in deleted["ids"] or application_signature(payload) in deleted["signatures"]


def find_same_application(applications, payload):
    payload_signature = application_signature(payload)
    for item in applications:
        if item.get("id") == payload.get("id") or application_signature(item) == payload_signature:
            return item
    return None


def application_signature(item):
    if not item:
        return ""
    return "|".join(
        [
            clean(item.get("company")),
            clean(item.get("role")),
            clean(item.get("date")),
            clean(item.get("createdAt")),
        ]
    )


def normalize_item(payload):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": str(uuid.uuid4()),
        "company": clean(payload.get("company")),
        "role": clean(payload.get("role")),
        "date": clean(payload.get("date")),
        "source": clean(payload.get("source")) or "LinkedIn",
        "status": clean(payload.get("status")) if payload.get("status") in STATUSES else "已投递",
        "priority": clean(payload.get("priority")) or "中",
        "link": clean(payload.get("link")),
        "notes": clean(payload.get("notes")),
        "createdAt": payload.get("createdAt") or now,
    }


def clean(value):
    return str(value or "").strip()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    mimetypes.add_type("text/javascript", ".js")
    server = ThreadingHTTPServer(("0.0.0.0", port), JobTrackerHandler)
    print(f"Job tracker running at http://0.0.0.0:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
