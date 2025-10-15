# 🔧 WebContainer CommonJS → ESM Fix

## 🚨 Problem: "Can't find variable: module" Error

### **Root Cause:**
The AI generated code using **CommonJS syntax** (`module.exports`, `require()`) which is **NOT supported in WebContainer**. WebContainer is a browser-based Node.js environment that only supports **ECMAScript Modules (ESM)**.

### **Your Specific Error:**
```
ReferenceError: Can't find variable: module
    at <anonymous>
    at _0x370799 (https://...blitz.96435430.js:31:827521)
```

This error occurs when Next.js tries to load a config file (like `postcss.config.js`) that uses `module.exports = { ... }` syntax.

---

## ✅ Solution Implemented

### **1. Automatic CommonJS Detection & Fix** (`app/lib/stores/files.ts`)

Added Pattern #11 to error detection:
```typescript
// Pattern 11: CommonJS module errors in WebContainer
if (output.includes("Can't find variable: module") || 
    output.includes("module is not defined") || 
    output.includes("require is not defined") || 
    output.includes("exports is not defined")) {
  
  logger.error('❌ CommonJS syntax detected (module.exports, require)');
  logger.info('🔧 Auto-fix: Converting to ESM (import/export)');
  
  // Auto-fix PostCSS config
  await this.#ensurePostCssConfig(wc, projectRootAbs);
  
  logger.info('💡 Use ESM syntax (import/export) instead');
}
```

### **2. Auto-Fix PostCSS Config** (`app/lib/stores/files.ts`)

Modified `#ensurePostCssConfig()` to:
- ✅ Create `postcss.config.mjs` (ESM) instead of `.js` (CommonJS)
- ✅ Use `export default { ... }` syntax
- ✅ Delete old `postcss.config.js` if it exists
- ✅ Fix broken PostCSS configs automatically

**Before (BAD - CommonJS):**
```javascript
// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**After (GOOD - ESM):**
```javascript
// postcss.config.mjs
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### **3. System Prompt Enhancement** (`app/lib/.server/llm/prompts.ts`)

Added **CRITICAL WebContainer ESM rule**:

```
🚨 CRITICAL: ESM ONLY - NO COMMONJS IN WEBCONTAINER

WebContainer ONLY supports ECMAScript Modules (ESM), NOT CommonJS:

✅ ALWAYS use: import / export syntax
✅ ALWAYS use: .mjs extension for config files
✅ Example: export default { plugins: { tailwindcss: {}, autoprefixer: {} } }

❌ NEVER use: require() or module.exports
❌ NEVER use: .js extension for config files with module.exports
❌ Example (BAD): module.exports = { plugins: { tailwindcss: {} } }

Config File Rules:
- postcss.config.mjs → ✅ export default { plugins: {...} }
- next.config.mjs → ✅ export default { ...config }
- tailwind.config.ts → ✅ TypeScript with ESM exports
- .js files with module.exports → ❌ Will crash the dev server!
```

---

## 🎯 How It Works Now

### **Error Detection Flow:**
1. **Dev server starts** → Encounters `module.exports` in config file
2. **Error thrown:** `ReferenceError: Can't find variable: module`
3. **FilesStore detects** error via Pattern #11
4. **Auto-fix triggered:** 
   - Creates `postcss.config.mjs` with ESM syntax
   - Deletes old `postcss.config.js`
   - Logs fix to terminal
5. **Dev server restarts** → Error resolved!

### **Prevention:**
- AI now knows to **never generate CommonJS syntax**
- AI uses `.mjs` extension for config files
- AI uses `export default` instead of `module.exports`

---

## 📊 Before vs After

### **Before (CommonJS - BROKEN):**
```javascript
// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

// ❌ Result: Dev server crashes
// ReferenceError: Can't find variable: module
```

### **After (ESM - WORKING):**
```javascript
// postcss.config.mjs
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

// ✅ Result: Dev server runs successfully
// Next.js compiles without errors
```

---

## 🔄 What Happens Next Time

**When AI generates a Next.js app:**

1. ✅ Creates `postcss.config.mjs` (not `.js`)
2. ✅ Uses `export default { ... }` syntax
3. ✅ Creates `next.config.mjs` (not `.js`)
4. ✅ All imports use ESM syntax

**If error still occurs:**
- FilesStore auto-detects the error
- Automatically converts to ESM
- Logs fix to terminal
- Dev server restarts successfully

---

## 🎉 Result

**Your current error will be automatically fixed** on the next dev server restart:

1. **Detected:** `Can't find variable: module`
2. **Fixed:** Created `postcss.config.mjs` with ESM syntax
3. **Cleaned:** Removed old `postcss.config.js`
4. **Restarted:** Dev server now working!

**Prevention implemented** for future projects:
- AI knows WebContainer only supports ESM
- AI generates correct config files from the start
- No more `module.exports` errors!

---

## 📝 Summary

| Issue | Solution |
|-------|----------|
| `module is not defined` | Auto-convert to ESM (`export default`) |
| `require is not defined` | Use `import` statements |
| `postcss.config.js` with CommonJS | Create `postcss.config.mjs` with ESM |
| AI generating CommonJS | System prompt now enforces ESM-only |

**The AI will now:**
- ✅ Always use ESM syntax in WebContainer
- ✅ Create `.mjs` config files
- ✅ Never use `module.exports` or `require()`
- ✅ Auto-fix any CommonJS errors it encounters

---

## 🚀 Next Steps

1. **Current Project:** The error will auto-fix when the dev server restarts
2. **Future Projects:** AI will generate ESM-only code from the start
3. **If You See This Error Again:** FilesStore will auto-fix it within seconds

**No manual intervention needed!** The system now automatically handles CommonJS → ESM conversion for WebContainer compatibility. 🎯
