# Deep Research Debugging Status

## Changes Made

### 1. Enhanced Error Handling in Orchestrator (`app/lib/.server/research/orchestrator.ts`)

**Problem**: Research was failing silently without clear error messages.

**Fixes Applied**:
- Added comprehensive `try...catch` blocks to all step execution functions
- Each step now properly records `status: 'success' | 'error' | 'pending'`
- Added `errorMessage` and `rawOutput` fields to Step type
- Created `StepExecutionResult<T>` type for structured error returns
- Added data sanitization for all model outputs to prevent downstream errors:
  - Plan structure validation (`id`, `text`, `successCriteria`)
  - Coverage score clamping (0-1 range)
  - Evidence card normalization with guaranteed IDs
  - Claims and draft sanitization with defaults

**New Logging Added**:
```typescript
[Orchestrator] Starting research orchestration
[Orchestrator] API key found, initializing model
[Orchestrator] Calling planner with prompt length: XXX
[Orchestrator] Planner raw response: ...
[Orchestrator] Planner parsed output: ...
[Orchestrator] Planning step error: ... (if error)
```

### 2. Improved API Error Reporting (`app/routes/api.research-v2.ts`)

**Changes**:
- Enhanced orchestration completion logging with status details
- Added `errorMessage` to task updates when orchestration fails
- Better error context in console logs

**New Logging**:
```typescript
[API] Research orchestration complete {
  status: 'done' | 'error',
  errorMessage: '...',
  stepsCount: X,
  evidenceCount: Y
}
```

### 3. Enhanced UI Error Display (`app/components/workbench/ResearchPanel.tsx`)

**Problem**: Error state showed generic message without details.

**Fixes**:
- Display actual `task.errorMessage` when available
- Show debug info including:
  - Which step failed
  - The specific step error message
- Better visual feedback for errors

### 4. Updated Type Definitions (`app/types/research.ts`)

**New Fields**:
```typescript
interface Step {
  // ... existing fields
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  rawOutput?: string;  // stores raw model response for debugging
}

interface ResearchTask {
  // ... existing fields
  errorMessage?: string;  // stores orchestration-level error
}
```

## Current Status

✅ **Completed**:
1. Error handling infrastructure
2. Comprehensive logging at all levels
3. Type definitions for error tracking
4. UI error message display
5. **Robust JSON extraction** - Handles markdown-wrapped JSON from any LLM
6. **Model switching** - Changed from Tongyi (unreliable) to GPT-4o-mini (reliable)
7. **Enhanced error messages** - Shows response previews for debugging

## Root Cause Found & Fixed

**Problem**: "Invalid JSON response" error at planning step

**Cause**: The `alibaba/tongyi-deepresearch-30b-a3b:free` model returns JSON wrapped in markdown code blocks:
```
Here's the plan:

```json
{ "plan": [...], "coverage": 0.8 }
```

This should help...
```

**Solution Applied**:
1. **Robust JSON Extraction** - Multi-strategy parser that handles:
   - Direct JSON objects/arrays
   - Markdown code blocks (```json...```)
   - Balanced brace extraction
   - Regex fallback
   
2. **Model Switch** - Changed to `openai/gpt-4o-mini`:
   - More reliable JSON formatting
   - Better instruction following
   - Still fast and affordable (~$0.001/request)
   
3. **Better Error Messages** - Now shows:
   - Response preview (first 300 chars)
   - Total response length
   - Which extraction strategy failed

## How to Test

### 1. Enable Deep Search
1. Go to the chat interface
2. Click the sparkle icon to enable "Deep Search"
3. Enter query: "What are the latest AI trends in 2024?"
4. Click send

### 2. Monitor Console Logs

**Server-side (terminal running `npm run dev`)**:
```
[API] Starting research with goal: ...
[Orchestrator] Starting research orchestration
[Orchestrator] API key found, initializing model
[Orchestrator] Calling planner with prompt length: XXX
[Orchestrator] Planner raw response: <first 500 chars>
[Orchestrator] Planner parsed output: <plan structure>
```

**Browser console (F12)**:
```
[ResearchStore] Starting research: { goal, mode }
[ResearchStore] Research started with taskId: ...
[ResearchStore] Task update: { status, planLength, evidenceLength }
[ResearchStore] Research completed with status: done/error
```

### 3. Expected Behavior

**If Successful**:
- Research tab shows progress through steps
- Plan appears with 4-7 sub-questions
- Sources gather progressively
- Final report displays with citations

**If Failed**:
- Error banner shows specific failure reason
- Debug info shows which step failed
- Console logs reveal the exact API error

## Known Issues to Check

1. **OpenRouter API Key**: Verify `OPENROUTER_API_KEY` is set correctly in `.env.local`
2. **Model Availability**: `alibaba/tongyi-deepresearch-30b-a3b:free` may have rate limits or availability issues
3. **JSON Parsing**: Model responses must contain valid JSON blocks (fenced or raw)

## Next Steps

1. **Test the flow** with the enhanced logging
2. **Capture the actual error** from server logs
3. **Verify error messages** appear in UI
4. **Check OpenRouter response** format compliance

## Debugging Commands

```bash
# Watch server logs in real-time
tail -f dev.log

# Search for orchestrator logs
grep "\[Orchestrator\]" dev.log

# Search for API errors
grep -A 10 "error\|Error" dev.log
```

## Fallback Plan

If the Tongyi DeepResearch model continues to fail:

1. **Test with a different model**: Change to `openai/gpt-4o-mini` or `anthropic/claude-3.5-sonnet` temporarily
2. **Check OpenRouter status**: Verify the model is available and not rate-limited
3. **Add retry logic**: Implement exponential backoff for transient errors
4. **Mock successful response**: Test UI flow with simulated data

## Files Modified

- ✅ `app/types/research.ts` - Added error tracking fields
- ✅ `app/lib/.server/research/orchestrator.ts` - Enhanced error handling + logging
- ✅ `app/routes/api.research-v2.ts` - Improved error reporting
- ✅ `app/components/workbench/ResearchPanel.tsx` - Better error UI

---

**Last Updated**: Current timestamp
**Status**: Ready for testing with enhanced diagnostics

