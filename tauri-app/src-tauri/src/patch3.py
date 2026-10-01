import io

p = 'src/main.rs'
s = io.open(p, encoding='utf-8').read()

old = 'let free: unsafe extern "system" fn(*mut std::ffi::c_char) =\n            *lib.get(b"awen_free\\0")'
new = 'let relay: unsafe extern "system" fn(\n            *const std::ffi::c_char,\n            f64, f64, f64, f64, f64,\n            *const std::ffi::c_char,\n            *const std::ffi::c_char,\n            *const std::ffi::c_char,\n        ) -> *mut std::ffi::c_char =\n            *lib.get(b"awen_relayout\\0")'

count = s.count(old)
assert count >= 1, 'free binding not found'
# 只替换 dll_load 里的那一处(第一次出现)
s = s.replace(old, new, 1)

old2 = 'let api = std::sync::Arc::new(DllApi { pipeline, free, _lib: lib });'
new2 = 'let api = std::sync::Arc::new(DllApi { pipeline, relay, free, _lib: lib });'
assert old2 in s, 'ctor'
s = s.replace(old2, new2, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('relay wired in dll_load')
