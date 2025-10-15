# Lovable Agent Tools Analysis - Key Insights

## 🎯 Critical Tool Usage Patterns We Should Adopt

After analyzing Lovable's tool configurations, here are the **most valuable patterns** that prevent hallucination and improve code quality:

---

## 1. 🚨 **MINIMIZE CODE WRITING (Most Important)**

### **Lovable's Rule:**
```
PREFER using line-replace for most changes instead of rewriting entire files
- This tool (write) is mainly meant for creating NEW files or as fallback
- When writing is necessary, MAXIMIZE use of "// ... keep existing code"
- ONLY write the specific sections that need to change
- BE AS LAZY AS POSSIBLE with your writes
```

### **Why It Matters:**
- **Prevents accidental deletion** of working code
- **Reduces token usage** dramatically
- **Faster execution** (smaller edits)
- **Fewer errors** from rewriting entire files

### **What We Should Add:**
Emphasize using `search_replace` tool over `write` tool in our prompt.

---

## 2. 📦 **Dependency Management (Package Versions)**

### **Lovable's Approach:**
```json
{
  "lov-add-dependency": {
    "example": "lodash@latest"
  }
}
```

**They ALWAYS use `@latest` suffix!** This confirms our fix was correct.

---

## 3. 🔍 **Debugging Tools (Console & Network)**

### **Lovable's Critical Rules:**
```
lov-read-console-logs:
- "DO NOT USE THIS MORE THAN ONCE since you will get the same logs each time"
- "The logs will not update while you are building and writing code"
- "So do not expect to verify if you fixed an issue by reading logs again"

lov-read-network-requests:
- You may not be able to see requests that didn't happen recently
```

### **What This Teaches Us:**
- **Don't waste tool calls** re-reading logs expecting changes
- **Logs are static snapshots** - they won't update during code generation
- **Read once, fix based on that, move on**

### **What We Should Add:**
A debugging section warning against repeated log reading.

---

## 4. 📁 **File Management Efficiency**

### **Lovable's Rules:**
```
lov-view:
- "Do NOT use this tool if file contents already provided in context"
- "Do NOT specify line ranges unless file is very large (>500 lines)"
- "If you need to read multiple files, invoke in PARALLEL"

lov-write:
- "If you need to create multiple files, create all at once (much faster)"
```

### **Why It Matters:**
- **Avoid redundant reads** (we already have this)
- **Parallel tool calls** for multiple files (we already emphasize this)
- **Line ranges only for large files** (good default behavior)

---

## 5. 🔄 **Ellipsis Usage for Large Code Sections**

### **Lovable's Pattern:**
```typescript
// When replacing 20+ lines of code:
search: "
  <UserCard>
    <Avatar />
...
    <Permissions>
  </UserCard>
"
// Only include first 2-3 lines and last 2-3 lines!
```

### **Why It Matters:**
- **Reduces token usage** massively
- **Faster matching** (less content to validate)
- **Clearer intent** (shows what's changing)

### **What We Should Add:**
Guidance on using ellipsis (`...`) in search-replace for large sections.

---

## 6. 🚫 **What NOT to Do (Anti-Patterns)**

### **Lovable's Explicit Warnings:**
```
❌ DO NOT rewrite entire files when only one section needs changing
❌ DO NOT read files already in context
❌ DO NOT use debugging tools multiple times (logs don't update)
❌ DO NOT specify line ranges for small files (default is fine)
❌ DO NOT create files one by one (create all at once in parallel)
```

---

## 📊 Key Differences: Lovable vs. Gleio AI

| Feature | Lovable | Gleio AI | Should We Change? |
|---------|---------|----------|-------------------|
| **Primary edit tool** | line-replace (search-replace) | write (full file) | ✅ YES - emphasize search_replace |
| **Package versions** | Always `@latest` | Fixed versions | ✅ DONE - already fixed |
| **Parallel file creation** | Emphasized | Mentioned | ✅ YES - emphasize more |
| **Debugging logs** | "Read once only" | Not specified | ✅ YES - add warning |
| **Ellipsis usage** | Detailed guidance | Not mentioned | ✅ YES - add guidance |
| **Keep existing code** | Mandatory for >5 lines | Not mentioned | ✅ YES - add rule |

---

## 🎯 Recommendations for Gleio AI

### **1. Add "Minimal Edits" Rule**
```
CRITICAL: Prefer search_replace over write for existing files
- Use write ONLY for new files
- Use search_replace for modifications
- Minimize the scope of changes
- Only edit what needs to change
```

### **2. Add "Ellipsis Usage" Guidance**
```
When using search_replace for large sections (>6 lines):
- Include first 2-3 lines of context
- Use "..." to indicate omitted middle section
- Include last 2-3 lines of context
- This reduces tokens and speeds up execution
```

### **3. Add "Debugging Efficiency" Rule**
```
Console & Network Logs:
- ❌ DO NOT read logs multiple times (they won't update during code generation)
- ✅ Read once, analyze thoroughly, fix based on that
- ✅ Logs are static snapshots from when user sent request
```

### **4. Strengthen "Parallel Tool Calls"**
```
CRITICAL: Maximize parallelization
- Create multiple NEW files in one batch
- Read multiple files simultaneously
- Never do sequential operations that could be parallel
```

---

## ✅ What We've Already Fixed

1. ✅ **Package version management** - Use "latest" for non-core packages
2. ✅ **Scope control** - Only implement what's asked
3. ✅ **Discussion mode** - Ask clarifying questions
4. ✅ **Architectural simplicity** - Small, focused components
5. ✅ **Parallel tool usage** - Already emphasized in existing prompt

---

## 🚀 Next Steps

Should we add these 4 improvements?

1. **Minimal Edits Rule** - Prefer search_replace over write
2. **Ellipsis Guidance** - For large code sections
3. **Debugging Efficiency** - Don't re-read logs
4. **Strengthen Parallelization** - Emphasize batch operations

**Impact:** These changes will make the AI:
- **Faster** (fewer tokens, smaller edits)
- **More reliable** (less chance of breaking working code)
- **More efficient** (better tool usage patterns)

---

## 📝 Summary

**Lovable's most valuable insight:** 
> "Be as lazy as possible with your writes" - only change what needs changing, prefer search-replace over full rewrites, use ellipsis for large sections.

This principle prevents the AI from accidentally breaking working code and makes it **significantly faster and more reliable**.
