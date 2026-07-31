from __future__ import annotations
import base64, hashlib, json, tarfile
from pathlib import Path
HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / 'manifest.json').read_text())
encoded = ''.join((HERE / name).read_text().strip() for name in manifest['parts'])
archive_bytes = base64.b64decode(encoded, validate=True)
digest = hashlib.sha256(archive_bytes).hexdigest()
if digest != manifest['sha256']:
    raise SystemExit(f"SHA-256 mismatch: expected {manifest['sha256']}, got {digest}")
archive = HERE / manifest['archive']
archive.write_bytes(archive_bytes)
repo_root = HERE.parents[1]
with tarfile.open(archive, 'r:gz') as tf:
    members = tf.getmembers()
    for member in members:
        target = (repo_root / member.name).resolve()
        if repo_root.resolve() not in target.parents and target != repo_root.resolve():
            raise SystemExit(f'Unsafe archive path: {member.name}')
    tf.extractall(repo_root)
archive.unlink()
print(f"Restored {len(members)} entries into {repo_root / 'functional-atlas-v1.0.0'} at {digest}")
