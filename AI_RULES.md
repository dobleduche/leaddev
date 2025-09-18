# AI Rules for Freelance Signal Bot

This document outlines the current tech stack and guidelines for library usage within the Freelance Signal Bot application.

## Tech Stack Overview

*   **Language:** JavaScript (ESM modules for Node.js backend).
*   **Frontend:** Vanilla HTML, CSS, and JavaScript. The UI is served as a single `index.html` file.
*   **Backend Framework:** Express.js is used for building RESTful APIs and serving static assets.
*   **Database (Development):** SQLite, managed with the `better-sqlite3` library.
*   **Database (Production):** PostgreSQL, managed with the `pg` library. The `db.js` file handles the abstraction between these two.
*   **Environment Management:** `dotenv` is used for loading environment variables from `.env` files.
*   **HTTP Client (Backend):** `node-fetch` is used for making server-side HTTP requests to external services.
*   **Payment Processing:** Stripe is integrated for handling subscriptions and checkout flows.
*   **Deployment:** The application is configured for deployment on Vercel, utilizing serverless functions for API routes and static site hosting for the frontend.

## Library Usage Rules

*   **Frontend UI:** All user interface changes should be implemented using vanilla HTML, CSS, and JavaScript directly within `public/index.html` or linked external files. Avoid introducing new frontend frameworks (e.g., React, Vue) unless explicitly requested.
*   **Backend API:** Use Express.js for defining and handling all API endpoints.
*   **Database Interactions:** Always interact with the database through the `db.js` module. This module provides a unified interface that abstracts away the underlying database (SQLite for dev, PostgreSQL for prod). Do not directly use `better-sqlite3` or `pg` in other parts of the application.
*   **External HTTP Calls (Backend):** For any server-side HTTP requests to external APIs (e.g., Reddit), use the `node-fetch` library.
*   **Environment Variables:** Access environment variables using `process.env`. Ensure that any new environment variables are documented in `.env.example`.
*   **Stripe Integration:** Use the `stripe` package for all payment-related functionalities, including creating checkout sessions and verifying webhook events.
*   **Module System:** Maintain consistency with ES Modules (`import`/`export`) for all Node.js backend code.
*   **Styling:** Continue using plain CSS for styling. If a CSS framework (like Tailwind CSS) is desired, it must be explicitly added and configured.