# -*- coding: utf-8 -*-
# 结构拆分生成器:template.html 内嵌 JS -> js/ 模块目录(ES modules)
import io, re, json, os

base = 'preview'
s = io.open(base + '/template.html', encoding='utf-8').read()
style_m = re.search(r'<style>([\s\S]*?)</style>', s)
style_css = style_m.group(1)
script_m = re.search(r'<script>([\s\S]*?)</script>', s)
js = script_m.group(1)

MAP = {
 'core/render.js': ['render','setSrc','renderKeep','renderNodes','gapEl','makeBlock','renderOutline','renderStatus','nodeByBid'],
 'core/sync.js': ['onPaperInput','applySyncNow','scheduleNativeRefresh','mergeBlocks'],
 'core/caret.js': ['saveCaret','restoreCaret','setSel','focusPaper','caretBlock','insertAtSelection','updateCaretPos','updateGutter','setGutterCur','caretLineNumber','textLen','selectAllDoc'],
 'core/history.js': ['recordHist','markDirty','updateUndoButtons','doUndo','doRedo','applyHistory'],
 'cmd/char.js': ['onPaperKey','applyStyle','listCmd','inDisplayMode','fmtCmd','fmtCmdInline','wrapSpan','applyColor','applyMark','applySize','applyFont','stepSize','toggleCase','brushClick','brushDouble','stopBrush'],
 'cmd/page.js': ['setDocsetLine','applyPaper','applyMargin','applyMarginCustom','applyLineSpacing','applyLineSpacingCustom','toggleOrientation','toggleFirstLine','cycleLineSpacing'],
 'cmd/table.js': ['inTable','selTr','selCell','tblInsRow','tblDelRow','tblInsCol','tblDelCol','toggleTblPop','insertTableGrid'],
 'cmd/find.js': ['toggleFind','closeFind','cs0','cw0','matchStarts','findIdxOf','findCount','highlightAll','findNext','findPrev','replaceOne','replaceAll','replaceEntry','findKey','gotoLine'],
 'cmd/clipboard.js': ['doPaste','pastePlain','paraBreakAtSelection','doCut','doCopy','pasteTextOnly'],
 'cmd/insert.js': ['insertBlock','pickImageInsert','insertRawLine'],
 'ui/palette.js': ['pushRecent','applyPal','palSwatch','togglePal','closePal'],
 'ui/panels.js': ['toggleSymbolPanel','openImagePanel','toggleLabelPop','renderLabelList','renamelabel_esc','renameLabelStart','renameLabelApply','toggleDiagPop','showWordCount'],
 'ui/status.js': ['updateDiagBar','allDiags','updateAlignState'],
 'ui/minibar.js': ['updateMinibar'],
 'view/view.js': ['setMode','showRibbon','toggleRibbonCollapse','buildSyntaxPane','insertSyntax','wrapSyntax','fitZoom','syncZoomSelects','applyZoom','applyZoomCustom','zoomEntry','toggleSidebar','toggleFocus','toggleMarks','spyOutline','swapSplit'],
 'file/tabs.js': ['renderFileTabs','addFileTab','switchFile','closeFile'],
 'file/open-save.js': ['newDoc','openDocument','openFileClick','doSave','doSaveDialog','doSaveAs','buildAwenHeader','fname','saveWithPicker','markClean','updateTitle'],
 'file/autosave.js': ['scheduleAutosave','doAutosave','loadAutosave','clearAutosave','discardAutosaveDraft'],
 'file/recent.js': ['getRecent','pushRecentFile','renderRecentList'],
 'file/export.js': ['exportFile','doPrint'],
 'file/docx.js': ['importDocx','htmlToAwen'],
}
f2mod = {f: m for m, fs in MAP.items() for f in fs}

funcs_json = json.load(open('_funcs.json', encoding='utf-8'))
funcs = funcs_json['funcs']; order = funcs_json['order']

missing = [f for f in order if f not in f2mod]
extra = [f for f in f2mod if f not in funcs]
print('未映射函数:', missing)
print('映射了不存在的:', extra)
assert not missing and not extra

blocks = []
cur_stmt = []
i = 0
while i < len(js):
    nm = None
    for f in order:
        if js.startswith('function ' + f + '(', i):
            nm = f
            break
    if nm:
        body = funcs[nm]
        blk = js[i:i + len(body)]
        assert blk == body, nm
        if cur_stmt:
            blocks.append(('stmt', '\n'.join(cur_stmt), nm))
            cur_stmt = []
        blocks.append(('fn', body, nm))
        i += len(body)
        while i < len(js) and js[i] in ';\n':
            i += 1
    else:
        nl = js.find('\n', i)
        if nl < 0:
            nl = len(js)
        cur_stmt.append(js[i:nl + 1])
        i = nl + 1
if cur_stmt:
    blocks.append(('stmt', '\n'.join(cur_stmt), '__main__'))

mods = {}
for m in MAP:
    mods[m] = []
mods['main.js'] = []

for kind, text, nfn in blocks:
    mod = 'main.js' if nfn == '__main__' else f2mod.get(nfn, 'main.js')
    if kind == 'fn':
        mods[mod].append(text)
    else:
        t = text.strip()
        if not t:
            continue
        if 'DOC_DATA' in t:
            continue
        if 'var renderSeq=0' in t:
            mods['core/render.js'].append('var renderSeq=0;')
            continue
        if t.startswith('var nativeDiags=null, nativeTimer=null;'):
            mods['ui/status.js'].append('var nativeDiags=null;')
            continue
        if t.startswith('(function init()'):
            mods['main.js'].append(t)
            continue
        mods[mod].append(t)

state_src = (
 '// 全局文档状态(唯一可变状态源;各模块经 S 读写)\n'
 'export const S={\n'
 '  gSrc:"",\n  gNodes:[],\n  gPages:[],\n'
 '  openFiles:[],\n  activeFile:-1,\n  currentMode:"display",\n  currentFilePath:null,\n  docDirty:false,\n'
 '  hist:[],\n  histIdx:-1,\n  histTime:0,\n  nativeDiags:null,\n  lastEditSource:null,\n  repagTimer:null\n'
 '};\n')
os.makedirs(base + '/js', exist_ok=True)
for d in ['core', 'cmd', 'ui', 'view', 'file']:
    os.makedirs(base + '/js/' + d, exist_ok=True)
io.open(base + '/js/state.js', 'w', encoding='utf-8').write(state_src)

S_NAMES = ['gSrc','gNodes','gPages','openFiles','activeFile','currentMode','currentFilePath','docDirty','hist','histIdx','histTime','nativeDiags','lastEditSource','repagTimer']
word_re = re.compile(r'\b(' + '|'.join(S_NAMES) + r')\b')

def rewrite(text):
    return word_re.sub(lambda m: 'S.' + m.group(1), text)

def imports_for(mod, text):
    my = set(MAP.get(mod, []))
    deps = {}
    for other, fs in MAP.items():
        if other == mod:
            continue
        used = sorted({f for f in fs if f not in my and re.search(r'\b' + f + r'\b', text)})
        if used:
            deps[other] = used
    out = []
    depth = mod.count('/')
    pre = '../' * depth
    for other, used in sorted(deps.items()):
        out.append('import { ' + ', '.join(sorted(set(used))) + ' } from "' + pre + other + '";')
    if re.search(r'\bS\.', text):
        out.insert(0, 'import { S } from "' + pre + 'state.js";')
    return ('\n'.join(out) + '\n\n') if out else ''

written = []
for mod in sorted(mods.keys()):
    content_lines = mods[mod]
    body = '\n'.join(content_lines).strip('\n')
    if not body:
        continue
    body = rewrite(body)
    imp = imports_for(mod, body)
    src = (imp + '\n' if imp else '') + body + '\n'
    fp = base + '/js/' + mod
    io.open(fp, 'w', encoding='utf-8').write(src)
    written.append((mod, len(src.split('\n'))))

main_imports = '\n'.join('import * as M%d from "./%s";' % (i, m) for i, (m, fs) in enumerate(MAP.items()))
mount = '\n'.join('Object.assign(window, M%d);' % i for i in range(len(MAP.items())))
main_body = '\n'.join(mods['main.js']).strip('\n')
main_src = ('// 入口:初始化/事件绑定/命令挂载(window 暴露以兼容 HTML 内联 onclick)\n'
            + main_imports + '\n\n' + mount + '\n\n' + main_body + '\n')
io.open(base + '/js/main.js', 'w', encoding='utf-8').write(main_src)

s2 = s.replace(style_m.group(0), '<link rel="stylesheet" href="css/style.css">')
s2 = s2.replace(script_m.group(0), '<script type="module" src="js/main.js"></script>')
io.open(base + '/template.html', 'w', encoding='utf-8').write(s2)

os.makedirs(base + '/css', exist_ok=True)
io.open(base + '/css/style.css', 'w', encoding='utf-8').write(style_css)

print('')
print('== 生成文件 ==')
for mod, n in sorted(written):
    print(' %4d 行  js/%s' % (n, mod))
print(' js/main.js')
print(' css/style.css  %d 行' % len(style_css.split('\n')))
