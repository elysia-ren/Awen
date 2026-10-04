# DLL 压测 v3:正确指针管理(c_void_p 保原始指针),随机文档轰炸+交错
# 注:restype=c_char_p 会把返回指针转成 python bytes 副本,free 原指针必假阳性崩溃
import ctypes, random, sys, time

dll = ctypes.CDLL(r'E:\个人项目\Flow\flowc\build\awen_pipeline.dll')
dll.awen_pipeline.restype = ctypes.c_void_p
dll.awen_pipeline.argtypes = [ctypes.c_char_p] + [ctypes.c_double]*5 + [ctypes.c_char_p]*3
dll.awen_relayout.restype = ctypes.c_void_p
dll.awen_relayout.argtypes = [ctypes.c_char_p] + [ctypes.c_double]*5 + [ctypes.c_char_p]*3
dll.awen_free.argtypes = [ctypes.c_void_p]

def parse(src, wf=b''):
    return dll.awen_pipeline(src.encode('utf-8'), 210.0, 297.0, 20.0, 11.0, 1.65, b'', b'', wf)

def relayout(src, wf=b''):
    return dll.awen_relayout(src.encode('utf-8'), 210.0, 297.0, 20.0, 11.0, 1.65, b'', b'', wf)

blocks = [
    '# 标题一\n\n段落内容 zhong wen mixed。\n',
    '## 二级\n\n- 列表项 A\n- 列表项 B\n\n1. 有序一\n2. 有序二\n',
    '> 引用块内容\n\n普通段。\n',
    '| 列一 | 列二 |\n|---|---|\n| a | b |\n| c | d |\n',
    '```rust\nfn main() { println!("hi"); }\n```\n\n代码后段落。\n',
    '@[image "media/x.png" width 50% align center]\n\n图后段落。\n',
    '@[math]\nx = y + 1\n@[/math]\n\n公式后段。\n',
    '@[scope quote]\n作用域内容行\n@[/scope]\n\n作用域后段。\n',
    '---\n\n分隔线后段。\n',
    '## 标签\n\n## label: eq1\n\n引用 → eq1\n',
    '超长单行:' + '很长的中文内容不带标点不断行' * 100 + '\n',
    '\n\n\n\n多个连续空行\n\n\n',
    '@[image "media/y.webp" width 30% align left]\n',
    '# 只有一个标题\n',
    '单段无尾随换行',
    '@[toc]\n\n# 章\n\n## 节\n\n正文。\n',
    '@[header %p]\n@[footer 第 %p 页]\n\n带页眉页脚正文。\n',
    '全角标点测试:,。;:!?「括号」【中】\n\n混杂 ASCII abc123\n',
]

random.seed(20261004)
cases = 0
t0 = time.time()
try:
    for round_i in range(500):
        n = random.randint(1, 10)
        src = ''.join(random.sample(blocks, n))
        wf = b''
        if random.random() < 0.3:
            wf = ','.join(str(round(random.uniform(0.4, 2.0), 3)) for _ in range(random.randint(0, 30))).encode()
        sys.stderr.write('R%d(%d) ' % (round_i, len(src))); sys.stderr.flush()
        r1 = parse(src, wf)
        s1 = ctypes.string_at(r1)
        r2 = relayout(src, wf)
        s2 = ctypes.string_at(r2)
        dll.awen_free(r1)
        dll.awen_free(r2)
        cases += 1
except Exception as e:
    print('EXC at case', cases, ':', e)
    print('LAST SRC:', repr(src)[:200])
    sys.exit(1)
print()
print('survived', cases, 'dll calls in', round(time.time()-t0, 1), 's')
