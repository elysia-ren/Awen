# -*- coding: utf-8 -*-
# template.html 是手工维护的源文件(UI 层,配套 engine.js/bridge.js)。
# 本脚本把前端三件套同步到所有交付位置,并暂存 Tauri 原生引擎运行时:
#   1. preview/editor.html                       <- template.html(双击即用副本)
#   2. tauri-app/dist/{index.html,engine.js,bridge.js}  <- 同步三件套(桌面版前端)
#   3. tauri-app/src-tauri/resources/aine-runtime/      <- aine.exe + aine.toml + src/(暂存,已 gitignore)
# generate_preview.aine 走的是另一条路:读取 template.html 并注入 /*__JSON__*/{} 生成 preview.html。
# aine.exe 路径:环境变量 AWEN_AINE_EXE,或默认 flowc 构建输出。
import os, shutil, sys

base = os.path.dirname(os.path.abspath(__file__))
pre = os.path.join(base, 'preview')
dist = os.path.join(base, 'tauri-app', 'dist')
runtime = os.path.join(base, 'tauri-app', 'src-tauri', 'resources', 'aine-runtime')

# 1) preview/editor.html
shutil.copyfile(os.path.join(pre, 'template.html'), os.path.join(pre, 'editor.html'))
print('已同步 preview/editor.html <- preview/template.html')

# 2) tauri-app/dist 三件套 + vendor
os.makedirs(dist, exist_ok=True)
for name, dst_name in [('template.html', 'index.html'), ('engine.js', 'engine.js'), ('bridge.js', 'bridge.js')]:
    shutil.copyfile(os.path.join(pre, name), os.path.join(dist, dst_name))
vendor_src = os.path.join(pre, 'vendor')
vendor_dst = os.path.join(dist, 'vendor')
if os.path.isdir(vendor_src):
    os.makedirs(vendor_dst, exist_ok=True)
    for fn in os.listdir(vendor_src):
        shutil.copyfile(os.path.join(vendor_src, fn), os.path.join(vendor_dst, fn))
print('已同步 tauri-app/dist/{index.html,engine.js,bridge.js,vendor/}')

# 3) aine-runtime 暂存
aine_exe = os.environ.get('AWEN_AINE_EXE') or r'E:\个人项目\Flow\flowc\target\release\aine.exe'
os.makedirs(os.path.join(runtime, 'src'), exist_ok=True)
os.makedirs(os.path.join(runtime, 'build'), exist_ok=True)
open(os.path.join(runtime, 'build', '.keep'), 'a').close()
if os.path.isfile(aine_exe):
    shutil.copyfile(aine_exe, os.path.join(runtime, 'aine.exe'))
    print(f'已复制 aine.exe <- {aine_exe}')
else:
    print(f'警告:找不到 aine.exe({aine_exe});桌面版权威解析不可用,可设 AWEN_AINE_EXE 指定', file=sys.stderr)
shutil.copyfile(os.path.join(base, 'aine.toml'), os.path.join(runtime, 'aine.toml'))
src_dir = os.path.join(base, 'src')
for fn in os.listdir(src_dir):
    if fn.endswith('.aine'):
        shutil.copyfile(os.path.join(src_dir, fn), os.path.join(runtime, 'src', fn))
print('已暂存 aine-runtime(aine.toml + src/*.aine)')
print('完成。')
