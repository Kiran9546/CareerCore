# CareerCore — web client

React 19 + Vite + Tailwind CSS. Setup, environment and testing instructions are in the [root README](../README.md).

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to http://localhost:4000
npm run lint
npm run build
```

Code layout:

- `src/pages/<role>/`: one folder per role. Routes are defined in `src/App.jsx`.
- `src/components/`: shared components. `components/drive/` holds the placement-drive workflow.
- `src/utils/placement.js`: shared labels, styles and formatters for placement screens.
- `src/api/axios.js`: the API client, which attaches the JWT and redirects to login on 401.

See [docs/PROJECT_STRUCTURE.md](../docs/PROJECT_STRUCTURE.md) for the full architecture.
