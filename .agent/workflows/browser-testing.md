---
description: How to test the frontend in the browser
---

# Browser Testing Workflow

## Frontend Port Configuration
- **Development port**: `9999` (npm run dev)
- **Docker port**: `3000` (when using docker-compose, but this is typically Open WebUI)

## Before Testing
// turbo
1. Ensure the frontend dev server is running on port 9999:
   ```
   cd c:\Users\admin\Desktop\SE Training Portal\frontend
   npm run dev -- --port 9999
   ```

2. If browser shows stale content after code changes:
   - Kill all node processes: `taskkill /F /IM node.exe`
   - Restart the dev server
   - Use incognito mode or hard refresh (Ctrl+Shift+R)

## Browser Testing URLs
- Login: `http://localhost:9999/login`
- Settings: `http://localhost:9999/settings`
- Dashboard: `http://localhost:9999/`

## Important Notes
- ALWAYS use port 9999 for frontend testing
- Port 3000 is typically Open WebUI, NOT the SE Training Portal frontend
- The Docker frontend container maps to different ports - check docker-compose.yml
