#!/usr/bin/env python3
"""Build the 365075 item-ID list from decoded UAssetAPI catalogue exports."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exports', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    files = sorted(args.exports.rglob('*.json'))
    if len(files) != 138:
        raise ValueError(f'Expected 138 non-drop catalogue exports, found {len(files)}')
    items = {}
    for path in files:
        asset = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(asset.get('Exports'), list):
            raise ValueError(f'Invalid asset export: {path}')
        for export in asset['Exports']:
            for row in (export.get('Table') or {}).get('Data', []):
                props = [p for p in row.get('Value', []) if isinstance(p, dict) and p.get('Name') == 'IsStackable']
                if not props:
                    continue
                if len(props) != 1 or not isinstance(props[0].get('Value'), bool) or not isinstance(row.get('Name'), str):
                    raise ValueError(f'Invalid item row: {path}')
                key, stackable = row['Name'], props[0]['Value']
                if key in items and items[key] != stackable:
                    raise ValueError(f'Conflicting storage kinds: {key}')
                items[key] = stackable
    if len(items) != 7024:
        raise ValueError(f'Expected 7024 unique item IDs, found {len(items)}')
    args.output.write_text(json.dumps(sorted(items), indent=2) + '\n', encoding='utf-8')
    print(f'{len(files)} exports, {len(items)} item IDs')


if __name__ == '__main__':
    main()
