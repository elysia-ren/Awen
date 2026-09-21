// 校验切割完整性:单文件版的声明与行是否被模块全集覆盖;并逐文件做语法检查
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execSync } from 'child_process';

const origSrc = fs.readFileSync('_native_main.js', 'utf8');
function decls(src) {
  const names = new Set();
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:var|let|const)\s+([A-Za-z_$][\w$]*))/gm;
  let m; while ((m = re.exec(src))) names.add(m[1] || m[2]);
  return names;
}
const origDecls = decls(origSrc);
const subDecls = new Set();
const subLines = new Set();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) {
      const s = fs.readFileSync(p, 'utf8');
      for (const n of decls(s)) subDecls.add(n);
      s.split('\n').forEach(l => { const t = l.trim(); if (t) subLines.add(t); });
    }
  }
}
walk('preview/js');
const missing = [...origDecls].filter(n => !subDecls.has(n));
console.log('decls orig:', origDecls.size, 'missing:', JSON.stringify(missing));
const missLines = [];
origSrc.split('\n').forEach((l, i) => {
  const t = l.trim();
  if (t && !t.startsWith('//') && !subLines.has(t)) missLines.push((i + 1) + ': ' + t.slice(0, 90));
});
console.log('missing lines:', missLines.length);
if (missLines.length) console.log(missLines.slice(0, 20).join('\n'));

// 语法检查:传统 script 解析(禁 ESM 回退——遇 import 应报错,但我们的文件不该有)
let bad = 0;
function walk2(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk2(p);
    else if (f.endsWith('.js') && f !== '_load_order.json') {
      const s = fs.readFileSync(p, 'utf8');
      if (/^import\s|\bexport\s/.test(s)) { console.log('ESM LEAK:', p); bad++; continue; }
      try { new vm.Script(s); }
      catch (e) { console.log('SYNTAX FAIL:', p, e.message); bad++; }
    }
  }
}
walk2('preview/js');
console.log(bad ? 'FAIL ' + bad : 'ALL SYNTAX OK');
