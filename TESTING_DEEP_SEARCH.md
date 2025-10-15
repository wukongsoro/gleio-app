# Testing Deep Search - Step-by-Step Guide

## Prerequisites
1. Dev server is running: `npm run dev`
2. Browser is open at `http://localhost:5173`
3. User is logged in
4. `OPENROUTER_API_KEY` is configured in `.dev.vars`

---

## Test Case 1: First-Time Deep Search (From Home View)

### Steps:
1. Open `http://localhost:5173` in browser
2. You should see: "Good afternoon, [Name]"
3. Type in the input: `What are the latest AI trends in 2024?`
4. Click the **Deep Search** button (✨ sparkle icon) - it should turn blue
5. Verify the button text changes to show "Deep Search enabled"
6. Click the **Send** button (arrow icon)

### Expected Behavior:
- ✅ Chat UI opens (home view disappears)
- ✅ Workbench opens on the right side
- ✅ Research tab is selected (not Code or Preview)
- ✅ Chat shows message: "🔍 Starting deep research: 'What are...'"
- ✅ ResearchPanel shows "No active research" briefly, then updates
- ✅ Deep Search button resets to gray (disabled)

### Console Logs You Should See:
```
[ResearchStore] Starting research: { goal: "What are the latest AI trends in 2024?", mode: "heavy" }
[ResearchStore] Research started with taskId: [UUID]
[ResearchStore] Starting to poll for task: [UUID]
[ResearchStore] Task update: { id: [UUID], status: "running", ... }
```

---

## Test Case 2: Deep Search from Existing Chat

### Steps:
1. Continue from Test Case 1 (chat already started)
2. Type new query: `Research the impact of AI on healthcare`
3. Click **Deep Search** button again (turns blue)
4. Click **Send**

### Expected Behavior:
- ✅ No animation (chat already open)
- ✅ Workbench switches to Research tab (if on different tab)
- ✅ New research message appears in chat
- ✅ ResearchPanel updates with new research goal
- ✅ Previous research is replaced with new one

---

## Test Case 3: Visual Progress Indicators

### During Research, You Should See:

#### In ResearchPanel:

1. **Research Plan Created** (after ~2-5 seconds)
   ```
   ✓ Research plan created
   1. What are the leading generative AI trends in 2024?
   2. Which industries are redefining themselves with AI?
   ...
   ```

2. **Gathered Sources** (after ~5-15 seconds)
   ```
   ⟳ Gathered 9 sources
   🌐 example.com - 3 ████████
   🌐 research.org - 2 ████
   ...
   ```

3. **Final Report** (when complete)
   - Executive Summary section
   - Multiple sections with citations [e1][e2]
   - Bibliography
   - Limitations

---

## Test Case 4: Error Handling

### Steps:
1. Stop the dev server
2. Try to send a deep search query
3. OR remove `OPENROUTER_API_KEY` from `.dev.vars`

### Expected Behavior:
- ✅ Toast error appears: "Failed to start research"
- ✅ Console shows detailed error
- ✅ ResearchPanel shows error state
- ✅ Chat UI doesn't break
- ✅ User can still send normal (non-research) messages

---

## Test Case 5: Switching Between Tabs

### Steps:
1. Start a deep search (wait for it to begin)
2. Click **Code** tab
3. Click **Preview** tab
4. Click **Research** tab again

### Expected Behavior:
- ✅ Research continues in background
- ✅ Switching tabs doesn't interrupt research
- ✅ Research tab shows updated progress when re-selected
- ✅ No duplicate research tasks created

---

## Test Case 6: Multiple Researches in Session

### Steps:
1. Complete a full research (wait for "done")
2. Start a new research with different query
3. Check if previous research is replaced

### Expected Behavior:
- ✅ Only one research is active at a time
- ✅ New research replaces old one in ResearchPanel
- ✅ Both research messages appear in chat history
- ✅ No memory leaks or performance issues

---

## Visual Checklist

### Chat Input Area:
- [ ] Deep Search button visible (✨ icon)
- [ ] Button turns blue when clicked
- [ ] Button shows "Deep Search enabled" text when active
- [ ] Button resets to gray after sending

### Workbench:
- [ ] Three tabs visible: Code | Preview | Research
- [ ] Research tab is rightmost
- [ ] Research tab becomes active when deep search is sent
- [ ] Panel shows correct content (not empty)

### ResearchPanel States:
- [ ] **Empty state**: "No active research" with globe icon
- [ ] **Running state**: Progress indicators with checkmarks/spinners
- [ ] **Complete state**: Full report with citations
- [ ] **Error state**: Red error message

### Chat Messages:
- [ ] User message appears with query
- [ ] Assistant message appears with research notification
- [ ] Message includes emoji indicators (🔍 📊)
- [ ] Message text is clear and helpful

---

## Browser Console Debugging

### Open DevTools Console and Filter by:
- `[ResearchStore]` - Client-side research operations
- `[API]` - Server-side research orchestration

### Healthy Research Flow Logs:
```
[ResearchStore] Starting research: ...
[ResearchStore] Research started with taskId: ...
[ResearchStore] Starting to poll for task: ...
[ResearchStore] Task update: { status: "running", planLength: 5, evidenceLength: 0 }
[ResearchStore] Task update: { status: "running", planLength: 5, evidenceLength: 9 }
[ResearchStore] Task update: { status: "running", planLength: 5, evidenceLength: 9, draft: {...} }
[ResearchStore] Research completed with status: done
```

### Error Logs to Watch For:
```
❌ [ResearchStore] Failed to start research: ...
❌ [ResearchStore] Poll error: 404
❌ [API] Research orchestration error: ...
```

---

## Performance Metrics

### Expected Timing (with OpenRouter free tier):
- **Initial response**: < 1 second (task created)
- **Plan generation**: 2-5 seconds
- **Search + Fetch**: 5-15 seconds per sub-question
- **Judge + Synthesize**: 10-20 seconds
- **Reflect (heavy mode)**: +10-30 seconds
- **Total (heavy mode)**: 1-3 minutes

### Polling Frequency:
- Polls every 1 second for updates
- Stops when status is "done" or "error"

---

## Common Issues & Solutions

### Issue: "Deep Search button doesn't appear"
**Solution**: Check that `PromptBox` component has `deepSearchEnabled` and `onToggleDeepSearch` props

### Issue: "Workbench doesn't open"
**Solution**: Check console for workbenchStore errors, ensure it's imported correctly

### Issue: "Research tab is empty"
**Solution**: Verify ResearchPanel is imported in Workbench.client.tsx

### Issue: "404 error when polling"
**Solution**: Check that `api.research-v2.$id.ts` file exists in routes folder

### Issue: "Chat message doesn't appear"
**Solution**: Check that `sendMessage` is being called with correct format (role + content)

### Issue: "Research never completes"
**Solution**: 
- Check OPENROUTER_API_KEY is valid
- Check console for orchestration errors
- Verify OpenRouter has credits/quota available

---

## Success Criteria

✅ All test cases pass
✅ No errors in browser console (except unrelated files)
✅ Research completes in reasonable time
✅ UI remains responsive during research
✅ Error states are handled gracefully
✅ User can perform multiple researches in one session
✅ Tabs can be switched without breaking research

---

## Next Actions After Testing

If everything works:
1. Test with different types of queries (short, long, technical, general)
2. Test with Quick mode vs Heavy mode
3. Monitor memory usage for potential leaks
4. Test on different browsers (Chrome, Safari, Firefox)
5. Test on mobile viewport
6. Consider adding more visual polish (animations, transitions)

If issues found:
1. Check console logs for `[ResearchStore]` and `[API]` prefixes
2. Verify all environment variables are set
3. Review the RESEARCH_INTEGRATION_FIXES.md document
4. Check Network tab for failed API requests
5. Report specific error messages for further debugging

---

**Happy Testing! 🚀**

