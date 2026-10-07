# DP DrukBazaars: the website

The website of DP DrukBazaars, an online shop and marketplace for Bhutan: the shop for customers, the dashboards for
sellers and delivery drivers, and the staff tools (counter, orders, stock, reports, administration).
Built with Angular 22. It talks to the server in the **InventoryApi** repository.

## Documentation

The full documentation is in the server repository, in the `docs` folder
(`https://github.com/dikbdr9712/InventoryApi/tree/main/docs`):

| Document | For whom |
|---|---|
| 1. System overview | Everyone: what the system is and how it works, in simple language |
| 2. User guide | Customers, sellers, delivery drivers: every step |
| 3. Staff guide | Shop staff: counter, orders, stock, customers, reports |
| 4. Admin guide | The owner: people and permissions, marketplace, payments, email, backups, problems |
| 5. Technical reference | Developers: architecture, settings, security, database, API |
| 6. Glossary and FAQ | Everyone |

`PROJECT-NOTES.md` in this repository is the project's history, step by step.

## Running it on your computer

You need Node 24 (see `.node-version`) and the server running on port 8080 (see the server's documentation).

```bash
npm install
```

```bash
npm start
```

Then open `http://localhost:4200/`. `proxy.conf.json` forwards `/api` and `/uploads` to the server on
`http://127.0.0.1:8080`. The page reloads by itself when you change a file.

## Building

```bash
npm run build
```

The result is in `dist/inventory-project/browser`. On Render it is published as a static site with these rewrites:
`/api/*` and `/uploads/*` to the server, and `/*` to `/index.html`.

## Where things are

| Folder | What is in it |
|---|---|
| `src/app/Components/<name>` | One folder per page or part of a page |
| `src/app/services` | Talking to the server |
| `src/app/guards`, `src/app/interceptors` | Sign-in and permission checks; signing out when the session ends |
| `src/app/utils` | Permissions, the staff menu, the shop's details (`shop-info.ts`), PDF and printing |
| `src/theme.css` | Colours and sizes used everywhere |
| `public/Images` | Pictures; `public/Images/art` holds the drawn pictures |
| `scripts/draw-art.js` | Draws the pictures in `public/Images/art` (`node scripts/draw-art.js`) |
