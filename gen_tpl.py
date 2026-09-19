# -*- coding: utf-8 -*-
# template.html 现在是手工维护的源文件(已通过浏览器实测),本脚本不再生成它。
# 用途:把 template.html 同步为 editor.html(可直接双击打开的编辑器副本)。
# generate_preview.aine 走的是另一条路:读取 template.html 并注入 /*__JSON__*/{} 生成 preview.html。
import shutil, os

base = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(base, 'preview', 'template.html')
dst = os.path.join(base, 'preview', 'editor.html')
shutil.copyfile(src, dst)
print('已同步 preview/editor.html <- preview/template.html')
