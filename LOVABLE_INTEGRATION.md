# Lovable Prompt Integration - Anti-Hallucination Rules

## 🎯 Goal: Simplicity + No Hallucinations

After analyzing Lovable's prompt, I've integrated the **most valuable anti-hallucination principles** that keep the AI focused, simple, and reliable.

---

## ✅ What Was Added

### **1. Scope Control (Do Exactly What's Asked)**
```
✅ Implement ONLY what the user explicitly requested
✅ If request is vague, ask ONE clarifying question
✅ Check if feature already exists before modifying
❌ NO "nice-to-have" features
❌ NO scope creep
❌ NO overengineering
```

**Why:** Prevents AI from adding unnecessary features, staying laser-focused on user's actual request.

---

### **2. Discussion Mode (Default for Unclear Requests)**
```
✅ Assume user wants to discuss/plan if request is ambiguous
✅ Only implement when user uses action words: "create", "build", "implement"
✅ For questions, provide explanation without code changes
❌ NO jumping straight to implementation for informational questions
❌ NO guessing what user wants
```

**Why:** Prevents AI from building the wrong thing when user is just asking a question.

---

### **3. Architectural Simplicity**
```
✅ Create small, focused components (not monolithic 1000-line files)
✅ Prefer search-replace for modifications over rewrites
✅ Refactor only if code is genuinely messy
✅ Make small, verifiable changes
❌ NO large files
❌ NO doing too much at once
```

**Why:** Keeps code maintainable and prevents overwhelming changes.

---

### **4. Common Pitfalls to Avoid**
```
❌ NO VITE_* env variables (not supported in WebContainer)
❌ NO reading files already in context
❌ NO sequential tool calls that could be batched
❌ NO experimental/unstable libraries
❌ NO hardcoded values
❌ NO custom inline styles
❌ NO inventing features
```

**Why:** Explicitly warns AI about common mistakes that cause failures.

---

## 📊 Key Lovable Principles Integrated

| Lovable Principle | How It Prevents Hallucination |
|-------------------|-------------------------------|
| **"Check Understanding"** | AI asks clarifying questions instead of guessing |
| **"Be Concise"** | Reduces token usage and over-explanation |
| **"Scope Control"** | Prevents adding features user didn't ask for |
| **"Discussion First"** | Avoids premature implementation |
| **"Perfect Architecture"** | Keeps code clean and focused |
| **"Avoid Overengineering"** | Prioritizes simple, working solutions |

---

## 🚫 What We Did NOT Add (Too Complex)

We intentionally **excluded** these Lovable-specific features to avoid overcomplication:

1. ❌ **Design system enforcement** (too opinionated for our use case)
2. ❌ **Shadcn-specific rules** (we support multiple frameworks)
3. ❌ **First message special handling** (adds unnecessary complexity)
4. ❌ **Mermaid diagram requirements** (not core to functionality)
5. ❌ **SEO requirements on every page** (too prescriptive)

**Reason:** These rules are specific to Lovable's Vite+React+Shadcn workflow. Gleio AI supports Next.js, Vite, multiple UI libraries, and full-stack apps, so we kept it framework-agnostic.

---

## 🎯 Result: Simple + Effective

### **Before Integration:**
- ❌ AI sometimes added features user didn't ask for
- ❌ AI sometimes guessed instead of asking clarifying questions
- ❌ AI sometimes created large, monolithic files

### **After Integration:**
- ✅ AI stays focused on explicit user request
- ✅ AI asks for clarification when request is vague
- ✅ AI creates small, maintainable components
- ✅ AI avoids common pitfalls (env vars, large files, etc.)

---

## 📝 Files Modified

- `app/lib/.server/llm/prompts.ts` (lines 200-234)
  - Added `<anti_hallucination_rules>` section after `<communication_style>`

---

## 🚀 Impact

| Before | After |
|--------|-------|
| Sometimes adds extra features | Only implements what's asked |
| Guesses when unclear | Asks ONE clarifying question |
| Creates large files | Small, focused components |
| Occasional scope creep | Laser-focused on request |

---

## ✨ Summary

We've integrated **Lovable's best anti-hallucination principles** without adding unnecessary complexity:

1. ✅ **Scope control** - Do exactly what's asked, nothing more
2. ✅ **Discussion mode** - Ask before assuming
3. ✅ **Architectural simplicity** - Small components, clean code
4. ✅ **Common pitfalls** - Explicit warnings about known issues

**The AI will now be more focused, reliable, and less likely to hallucinate features or versions!** 🎉
