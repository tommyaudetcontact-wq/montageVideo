"""Stage a verified APK and matching update feed; commit/push separately."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PACKAGE = 'com.pocketcut.studio.test'
CERT = '491c5474e599a4ad73e34dacab34a25bb3e44e220c84c7aec742559b0554ff3b'
BASE = 'https://tommyaudetcontact-wq.github.io/montageVideo/releases/android/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--build-tools', required=True, type=Path)
    parser.add_argument('--notes', required=True)
    args = parser.parse_args()
    apk = args.apk.resolve()
    tools = args.build_tools.resolve()
    verification = subprocess.check_output([str(tools / 'apksigner.bat'), 'verify', '--print-certs', str(apk)], text=True)
    if CERT not in verification.lower():
        raise SystemExit('Signature does not match existing PocketCut installations.')
    subprocess.run([str(tools / 'zipalign.exe'), '-c', '-P', '16', '4', str(apk)], check=True)
    manifest = subprocess.check_output([str(tools / 'aapt2.exe'), 'dump', 'badging', str(apk)], text=True, encoding='utf-8', errors='replace')
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", manifest)
    if not match or match[1] != PACKAGE:
        raise SystemExit('Unexpected application package.')
    version_code, version = int(match[2]), match[3]
    if not re.fullmatch(r'[A-Za-z0-9._-]+', version):
        raise SystemExit('Invalid version name.')
    digest = hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest()
    folder = Path(__file__).resolve().parents[1] / 'releases' / 'android'
    folder.mkdir(parents=True, exist_ok=True)
    feed = folder / 'latest.json'
    if feed.exists():
        previous = json.loads(feed.read_text(encoding='utf-8'))
        if version_code <= previous['versionCode'] and digest != previous['sha256']:
            raise SystemExit('Increase Android versionCode before publishing a new binary.')
    name = 'PocketCut-' + version.replace('-test.', '-test') + '.apk'
    shutil.copy2(apk, folder / name)
    release = dict(packageId=PACKAGE, versionCode=version_code, versionName=version,
                   url=BASE + name, size=apk.stat().st_size, sha256=digest, notes=args.notes)
    temporary = feed.with_suffix('.tmp')
    temporary.write_text(json.dumps(release, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(feed)
    (folder / (name + '.sha256')).write_text(digest + '  ' + name + '\n', encoding='utf-8')
    print(json.dumps(release, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
