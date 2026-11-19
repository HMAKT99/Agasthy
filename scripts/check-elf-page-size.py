#!/usr/bin/env python3
"""Check that ELF files can load on Linux kernels with 16 KB (or 64 KB) pages.

Usage: scripts/check-elf-page-size.py [--min BYTES] PATH...

Each PATH is an ELF file or a directory searched recursively. Asahi Linux
(Apple silicon, including Omarchy Mac) runs 16 KB pages; an ELF whose LOAD
segments are aligned to less than that cannot be mapped there and fails at
start. Exits 1 if any ELF is aligned below --min (default 16384).
"""
import os
import struct
import sys

args = sys.argv[1:]
minimum = 16384
if args[:1] == ["--min"]:
    minimum = int(args[1])
    args = args[2:]
if not args:
    sys.exit(__doc__)


def load_alignments(path):
    with open(path, "rb") as f:
        head = f.read(64)
        if len(head) < 52 or head[:4] != b"\x7fELF":
            return None
        is64 = head[4] == 2
        end = "<" if head[5] == 1 else ">"
        if is64:
            phoff, = struct.unpack_from(end + "Q", head, 32)
            phentsize, phnum = struct.unpack_from(end + "HH", head, 54)
        else:
            phoff, = struct.unpack_from(end + "I", head, 28)
            phentsize, phnum = struct.unpack_from(end + "HH", head, 42)
        f.seek(phoff)
        table = f.read(phentsize * phnum)
    aligns = []
    for i in range(phnum):
        off = i * phentsize
        p_type, = struct.unpack_from(end + "I", table, off)
        if p_type != 1:  # PT_LOAD
            continue
        if is64:
            p_align, = struct.unpack_from(end + "Q", table, off + 48)
        else:
            p_align, = struct.unpack_from(end + "I", table, off + 28)
        aligns.append(p_align)
    return aligns


def files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                for n in names:
                    full = os.path.join(root, n)
                    if os.path.isfile(full) and not os.path.islink(full):
                        yield full
        else:
            yield p


checked, bad = 0, []
for path in files(args):
    try:
        aligns = load_alignments(path)
    except OSError:
        continue
    if not aligns:
        continue
    checked += 1
    low = min(aligns)
    if low < minimum:
        bad.append((path, low))

for path, low in bad:
    print(f"too small for {minimum // 1024} KB pages: {path} (LOAD aligned to {low} bytes)")
print(f"{checked} ELF files checked, {len(bad)} aligned below {minimum} bytes")
sys.exit(1 if bad else 0)
