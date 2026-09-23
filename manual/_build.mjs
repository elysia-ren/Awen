// 拼装手册:index.html = 头部 + 目录 + p1..p4
import fs from 'fs';
const read = f => fs.readFileSync(f, 'utf8');
const parts = ['_p1.html', '_p2.html', '_p3.html', '_p4.html'].map(read);
const body = parts.join('\n');

// 从正文提取章节目录
const toc = [...body.matchAll(/<h1 id="(ch[^"]+)">([^<]+)<\/h1>/g)]
  .map(m => `<a class="toc-item" href="#${m[1]}">${m[2]}</a>`)
  .join('\n');

const style = fs.readFileSync('_style_extract.css', 'utf8')
  .replace(/#4b6f8d/g, '#2563eb').replace(/#2a4a66/g, '#1d4ed8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Awen 编辑器使用手册</title>
<style>${style}
.toc{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:18px 22px;margin:24px 0}
.toc-title{font-size:17px;font-weight:700;margin-bottom:12px;color:#1f2937}
.toc-item{display:block;padding:3px 0;color:#374151;text-decoration:none;font-size:13.5px}
.toc-item:hover{color:#2563eb}
.m-head{border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:8px}
.m-head .t{font-size:30px;font-weight:800;color:#111}
.m-head .s{font-size:13px;color:#6b7280;margin-top:6px}
@media print{.toc{display:none}}
</style>
</head>
<body>
<div class="m-head">
<div class="t">Awen 编辑器使用手册</div>
<div class="s">版本 v1.0 · 2026 年 9 月 · 适用于 Awen 桌面版(aine 引擎 + .awen v0.5 容器)</div>
</div>
<div class="toc">
<div class="toc-title">目录</div>
${toc}
</div>
${body}
<p style="margin-top:48px;color:#9ca3af;font-size:12px;text-align:center">— 手册完 —<br>Awen,把排版交给引擎,把写作还给你。</p>
</body>
</html>`;

fs.writeFileSync('index.html', html);
fs.writeFileSync('Awen编辑器使用手册.html', html);
console.log('manual assembled:', html.length, 'chars,', (html.match(/<h1 /g) || []).length, 'chapters');
