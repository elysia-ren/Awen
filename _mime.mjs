const urls = ['http://tauri.localhost/js/main.js','http://tauri.localhost/js/core/caret.js','http://tauri.localhost/engine.js','http://tauri.localhost/js/state.js','http://tauri.localhost/index.html'];
for (const u of urls) {
  try {
    const r = await fetch(u);
    const ct = r.headers.get('content-type');
    const body = await r.text();
    console.log(r.status, ct, u.replace('http://tauri.localhost',''), '| 首行:', body.split('\n')[0].slice(0,50));
  } catch (e) { console.log('ERR', u, e.message) }
}
process.exit(0);
