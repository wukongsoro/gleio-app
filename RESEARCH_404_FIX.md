# Research API 404 Error - Fixed

## Problem

The research polling was failing with a 404 error:
```
Error: Failed to fetch task
  at research.ts:78
```

## Root Cause

The API route structure was incorrect. The file `app/routes/api.research-v2.ts` was trying to handle dynamic routes with a loader function that parsed the URL manually, but Remix requires proper file-based routing for dynamic segments.

## Solution

Split the single route into proper Remix dynamic routes:

### 1. **Main Route** (`app/routes/api.research-v2.ts`)
- Handles `POST /api/research-v2`
- Creates new research tasks
- Returns `{ taskId }`

### 2. **Task Details Route** (`app/routes/api.research-v2.$id.ts`)
- Handles `GET /api/research-v2/:id`
- Returns task details
- Uses Remix's `params.id` for dynamic routing

### 3. **Stream Route** (`app/routes/api.research-v2.$id.stream.ts`)
- Handles `GET /api/research-v2/:id/stream`
- Server-Sent Events (SSE) for live updates
- Polls every 500ms until complete

## File Structure

```
app/routes/
├── api.research-v2.ts           # POST - Create task
├── api.research-v2.$id.ts       # GET  - Get task details
└── api.research-v2.$id.stream.ts # GET  - SSE stream
```

## How It Works Now

### Creating a Research Task
```typescript
POST /api/research-v2
Body: { goal: "research query", mode: "heavy" }
→ Returns: { taskId: "uuid" }
```

### Getting Task Status
```typescript
GET /api/research-v2/550e8400-e29b-41d4-a716-446655440000
→ Returns: ResearchTask with full details
```

### Streaming Updates
```typescript
GET /api/research-v2/550e8400-e29b-41d4-a716-446655440000/stream
→ SSE stream with events:
  - connected
  - status (every 500ms)
  - complete (when done)
```

## Changes Made

1. ✅ Created `app/routes/api.research-v2.$id.ts`
2. ✅ Created `app/routes/api.research-v2.$id.stream.ts`
3. ✅ Removed loader function from `app/routes/api.research-v2.ts`
4. ✅ Removed `LoaderFunctionArgs` import from main route

## Testing

The error should no longer appear. The research store will now:
1. Create a task via POST
2. Poll for updates via GET `/api/research-v2/:id`
3. Receive proper responses instead of 404s

## Benefits

- ✅ Follows Remix routing conventions
- ✅ Cleaner separation of concerns
- ✅ Proper TypeScript types with `params.id`
- ✅ More maintainable code structure
- ✅ No more 404 errors!

