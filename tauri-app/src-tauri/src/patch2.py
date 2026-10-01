import io

p = 'main.rs'
s = io.open(p, encoding='utf-8').read()

old_struct = '''struct DllApi {
    pipeline: unsafe extern "system" fn(*const std::ffi::c_char) -> *mut std::ffi::c_char,
    free: unsafe extern "system" fn(*mut std::ffi::c_char),
    _lib: libloading::Library,
}'''
new_struct = '''struct DllApi {
    pipeline: unsafe extern "system" fn(
        *const std::ffi::c_char,
        f64, f64, f64, f64, f64,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
        *const std::ffi::c_char,
    ) -> *mut std::ffi::c_char,
    free: unsafe extern "system" fn(*mut std::ffi::c_char),
    _lib: libloading::Library,
}'''
assert old_struct in s, 'struct'
s = s.replace(old_struct, new_struct)

old_get = '''        let pipeline: unsafe extern "system" fn(*const std::ffi::c_char) -> *mut std::ffi::c_char =
            *lib.get(b"awen_pipeline\\0").map_err(|e| format!("缺 awen_pipeline:{e}"))?;'''
new_get = '''        let pipeline: unsafe extern "system" fn(
            *const std::ffi::c_char,
            f64, f64, f64, f64, f64,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
            *const std::ffi::c_char,
        ) -> *mut std::ffi::c_char =
            *lib.get(b"awen_pipeline\\0").map_err(|e| format!("缺 awen_pipeline:{e}"))?;'''
assert old_get in s, 'get'
s = s.replace(old_get, new_get)

i = s.find('fn dll_call(app: &AppHandle, req: &str)')
j = s.find('\n}\n', i)
new_body = '''fn dll_call(app: &AppHandle, req: &str) -> Result<String, String> {
    let v: serde_json::Value = serde_json::from_str(req).map_err(|e| format!("req 非 json:{e}"))?;
    if v.get("op").and_then(|x| x.as_str()) != Some("parse") {
        return Err("dll 仅支持 op=parse".into());
    }
    let api = dll_load(app)?;
    let src = v.get("src").and_then(|x| x.as_str()).unwrap_or("");
    if src.is_empty() {
        return Err("dll 空 src".into());
    }
    // 几何与宽表全部从 cfg 透传(DLL 引擎原生支持)
    let cfg = v.get("cfg").cloned().unwrap_or(serde_json::json!({}));
    let getf = |k: &str, d: f64| cfg.get(k).and_then(|x| x.as_f64()).unwrap_or(d);
    let widths = cfg.get("widths");
    let wf_s = widths.and_then(|w| w.get("s")).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let wf_e = widths.and_then(|w| w.get("e")).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let wf_w_flat = widths
        .and_then(|w| w.get("w"))
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_f64()).map(|f| format!("{}", f)).collect::<Vec<_>>().join(","))
        .unwrap_or_default();
    let c_src = std::ffi::CString::new(src).map_err(|_| "src 含 NUL".to_string())?;
    let c_s = std::ffi::CString::new(wf_s).map_err(|_| "wf_s 含 NUL".to_string())?;
    let c_e = std::ffi::CString::new(wf_e).map_err(|_| "wf_e 含 NUL".to_string())?;
    let c_w = std::ffi::CString::new(wf_w_flat).map_err(|_| "wf_w 含 NUL".to_string())?;
    unsafe {
        let ptr = (api.pipeline)(
            c_src.as_ptr(),
            getf("pw", 210.0), getf("ph", 297.0), getf("mg", 20.0), getf("fp", 11.0), getf("ls", 1.65),
            c_s.as_ptr(), c_e.as_ptr(), c_w.as_ptr(),
        );
        if ptr.is_null() {
            return Err("dll 返回 null".into());
        }
        let out = std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned();
        (api.free)(ptr);
        // daemon 协议: result 是字符串化 JSON
        let result_str = serde_json::to_string(&out).unwrap_or_else(|_| format!("\\"{}\\"", out));
        let id = v.get("id").and_then(|x| x.as_i64()).unwrap_or(1);
        Ok(format!("{{\\"id\\":{},\\"ok\\":true,\\"result\\":{}}}", id, result_str))
    }
}
'''
s = s[:i] + new_body + s[j + len('\n}\n'):]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('dll_call body replaced')
