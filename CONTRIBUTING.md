# Contributing to DataMuse

Thank you for your interest in contributing to DataMuse! We welcome contributions of all kinds — bug reports, feature requests, documentation improvements, and code changes.

## Getting Started

1. **Fork** the repository and clone your fork locally.
2. Follow the [Quick Start](README.md#quick-start) guide to set up your development environment.
3. Create a new branch for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Backend (Python / FastAPI)

```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
```

### Frontend (React / TypeScript / Vite)

```bash
cd frontend
npm install
```

### Running Locally

```bash
# From project root
./start.sh        # macOS/Linux
start.bat          # Windows
```

This starts Qdrant (Docker), the backend API, and the frontend dev server.

## How to Contribute

### Reporting Bugs

- Open a [GitHub Issue](../../issues/new) with a clear title and description.
- Include steps to reproduce, expected behavior, and actual behavior.
- Add screenshots or error logs if applicable.

### Suggesting Features

- Open a [GitHub Issue](../../issues/new) describing the feature and its use case.
- Explain why it would be valuable and how it fits with the existing project.

### Submitting Code Changes

1. Make sure your changes work locally (backend starts, frontend builds, feature works end-to-end).
2. Keep commits focused — one logical change per commit.
3. Write clear commit messages:
   ```
   feat: add export-to-PDF for data stories
   fix: handle empty CSV upload gracefully
   docs: update README with new environment variable
   ```
4. Open a **Pull Request** against the `master` branch with:
   - A description of what you changed and why
   - Screenshots or GIFs for UI changes
   - Any testing you performed

### Code Style

- **Python**: Follow [PEP 8](https://peps.python.org/pep-0008/). Use type hints where possible.
- **TypeScript/React**: Follow the existing ESLint configuration in `frontend/eslint.config.js`.
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) format when possible.

## Code of Conduct

Be respectful and constructive. We are committed to providing a welcoming and inclusive environment for everyone. Harassment or discriminatory behavior of any kind will not be tolerated.

## Questions?

Open a [Discussion](../../discussions) or reach out to the maintainers. We're happy to help!
