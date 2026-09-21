# -*- coding: utf-8 -*-
# skeletonize.py — 从完整版 template.html 骨架化:
#   1) <style> 块 -> css/style.css + link 引用
#   2) 内联 <script> 150 函数 -> js/main.js
#   3) template.html 替换为骨架(引用外部文件)
# 幂等:重复运行安全
import io, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
PRE = os.path.join(BASE, 'preview')
TPL = os.path.join(PRE, 'template.html')
CSS_DIR = os.path.join(PRE, 'css')
JS_DIR = os.path.join(PRE, 'js')

s = io.open(TPL, encoding='utf-8').read()
orig = s

# 1) 提取并移除 <style> 块 -> css/style.css
css_m = re.search(r'[ \t]*<style>\n?([\s\S]*?)\n?[ \t]*</style>\n?', s)
if css_m:
    css = css_m.group(1)
    os.makedirs(CSS_DIR, exist_ok=True)
    io.open(os.path.join(CSS_DIR, 'style.css'), 'w', encoding='utf-8').write(css + '\n')
    s = s[:css_m.start()] + '<link rel="stylesheet" href="css/style.css">' + s[css_m.end():]
    print('OK  style 块 -> css/style.css (' + str(len(css.split('\n'))) + ' 行)')

# 2) 提取内联 <script> 块(150 函数) -> js/main.js
sm = re.search(r'[ \t]*<script>\n?([\s\S]*?)\n?[ \t]*</script>\n?', s)
if sm:
    js = sm.group(1)
    os.makedirs(JS_DIR, exist_ok=True)
    io.open(os.path.join(JS_DIR, 'main.js'), 'w', encoding='utf-8').write(js + '\n')
    s = s[:sm.start()] + '<script src="js/main.js"></script>' + s[sm.end():]
    print('OK  内联 script -> js/main.js (' + str(len(js.split('\n'))) + ' 行)')

# 3) 写回 template.html
if s != orig:
    io.open(TPL, 'w', encoding='utf-8').write(s)
    print('template.html 已更新')
else:
    print('无变化')
