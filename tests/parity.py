# DLL vs 解释器 全语义对拍:同一文档分别走 awen_pipeline.dll 与 aine.exe run tauri_cli.aine(op=parse),逐字段比较
import ctypes, json, subprocess, sys, time, io, os

ROOT = r"E:\个人项目\Awen文档\awen-proto-aine"
AINE = r"E:\个人项目\Flow\flowc\target\release\aine.exe"
DOC = os.path.join(ROOT, "build", "big_src.awen")

src = io.open(DOC, encoding="utf-8").read()

# ── DLL 侧 ──
dll = ctypes.CDLL(r"E:\个人项目\Flow\flowc\build\awen_pipeline.dll")
dll.awen_pipeline.restype = ctypes.c_char_p
dll.awen_pipeline.argtypes = [ctypes.c_char_p] + [ctypes.c_double]*5 + [ctypes.c_char_p]*3
t0 = time.perf_counter()
raw = dll.awen_pipeline(src.encode("utf-8"), 210.0, 297.0, 20.0, 11.0, 1.65, b"", b"", b"")
dll_ms = (time.perf_counter()-t0)*1000
merged = json.loads(raw.decode("utf-8"))
dll_blocks, dll_lay = merged["blocks"], json.loads(json.dumps({k: v for k, v in merged.items() if k != "blocks"}))

# ── 解释器侧(同管线驱动) ──
p = subprocess.run([AINE, "run", "src/_interp_driver.aine"],
                   cwd=ROOT, capture_output=True, timeout=300)
out = p.stdout.decode("utf-8", "replace").strip()
line = [l for l in out.splitlines() if l.strip().startswith("{")][-1]
interp = json.loads(line)
ip_blocks, ip_lay = interp["blocks"], {k: v for k, v in interp.items() if k != "blocks"}

# ── 逐项对拍 ──
ok = True
def cmp(a, b, path):
    global ok
    if type(a) != type(b):
        print("TYPE", path, type(a), type(b)); ok = False; return
    if isinstance(a, dict):
        if set(a.keys()) != set(b.keys()):
            print("KEYS", path, set(a) ^ set(b)); ok = False; return
        for k in a: cmp(a[k], b[k], path + "." + k)
    elif isinstance(a, list):
        if len(a) != len(b):
            print("LEN", path, len(a), len(b)); ok = False; return
        for i, (x, y) in enumerate(zip(a, b)): cmp(x, y, path + "[%d]" % i)
    else:
        if a != b:
            print("VAL", path, repr(a)[:60], "!=", repr(b)[:60]); ok = False

cmp(ip_blocks, dll_blocks, "blocks")
cmp(ip_lay, dll_lay, "lay")
print("blocks:", len(dll_blocks), "| lay keys:", sorted(dll_lay.keys()))
print("dll parse ms:", round(dll_ms, 1))
print("PARITY:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
