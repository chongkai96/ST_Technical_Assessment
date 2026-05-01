# Technical Assessment  

Complete the assessment in 3 days or otherwise stipulated. Do read the following details carefully and thoroughly for the requirements. If you have any queries on the assessment you may ask your interviewer for the contact. If you need time extension do request from your interviewer.

## Problem Statement

Create a React/Svelte frontend in Typescript and NodeJS web backend in Typescript/Javascript with the following functionalities.  

1. Upload a CSV file with appropriate feedback to the user on the upload progress. Data needs to be stored in a database.

2. List the data uploaded with pagination.  

3. Search data from the uploaded file. The web application should be responsive while listing of data and searching of data.  

4. Proper handling and checks for the data uploaded.

5. Real-time collaboration. The application must support two browser sessions simultaneously editing/searching the same dataset. When one user uploads a new CSV that overlaps with existing records (matching by a unique identifier in the data), the application must:
   - Detect duplicate/conflicting records
   - Display a real-time diff UI (without page refresh) showing what changed between the old and new data
   - [Optional] User can be allowed to choose to which version of the data to keep. Tha updates should also be reflected in real-time(within 3 seconds).

## Submission Requirement

In your submission, must include the following:  

1. Use this [csv file](data.csv) as the sample  

2. Include unit tests with complete test cases including edge cases.  

3. Provide a git repository for us to assess your submission.  

4. Provide a docker compose file to run the necessary components for your application.

5. Provide a readme in the git repository on how to setup and run the project.  

# Other notes

- You will be expected to run and demo your application running the docker compose file during the interview.
- During the demo, two browser tabs/windows should be opened and you will be required to perform the conflicting uploads simultaneously. You must explain every design decision in their conflict resolution strategy.

---

## How to run this project

### Docker Compose (recommended for the interview demo)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2.

```bash
docker compose up --build
```

Open **http://localhost:8080**. Postgres is exposed on **localhost:5432** for debugging.

The `web` container serves the built React app via Nginx and proxies `/api` and `/socket.io` to the `api` service.

Stop and remove containers:

```bash
docker compose down
```

### Local development (no Docker for Node)

1. Start PostgreSQL 16+ and create a database (or use the `db` service only: `docker compose up db`).
2. Backend:

   ```bash
   cd backend
   npm install
   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/csvcollab"
   export CORS_ORIGIN="http://localhost:5173"
   npm run dev
   ```

3. Frontend (new terminal):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open **http://localhost:5173**. Vite proxies `/api` and WebSocket traffic to the backend on port 3001.

### Sample CSV

Use the provided [`data.csv`](data.csv). The business **unique key** is the CSV column `id` (distinct from the Postgres surrogate key).

### API overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness |
| `POST` | `/api/upload` | `multipart/form-data` field `file` (CSV) |
| `GET` | `/api/records?page=&limit=&q=` | Paginated listing and `ILIKE` search |
| `GET` | `/api/conflicts` | Open conflict queue |
| `POST` | `/api/conflicts/resolve` | JSON `{ batchId, recordId, choice: "keep_old" \| "keep_new" }` |

### Realtime events (Socket.IO)

Clients join room `collab` on connect. Events:

- `collab:conflicts` — new overlapping rows detected after an upload (diff payload + `batchId`).
- `collab:records_updated` — inserts or post-resolve refresh signal.
- `collab:resolved` — a conflict was resolved.

The UI refetches `/api/records` and `/api/conflicts` on these events so a second browser tab updates without a full page reload.

### Conflict strategy (for the demo narrative)

- Rows are validated with **Zod** (required fields, basic email shape, no empty `body`).
- Duplicate `id` values **inside one upload** are rejected.
- New `id` values are **inserted** immediately.
- Existing `id` values with **identical** field content are counted as **skipped unchanged**.
- Existing `id` values with **any differing field** become a **pending conflict**: stored in `pending_conflicts`, broadcast over Socket.IO, and shown as a **per-field diff**. Users may **keep stored** or **keep incoming**; `keep_new` bumps `version` on `records` so collaborators can see data changed.

### Tests

```bash
cd backend && npm test
```

Covers diff detection and validation edge cases (invalid email, empty body, duplicate ids in file).
