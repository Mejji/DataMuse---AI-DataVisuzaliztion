# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in DataMuse, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email your report to the repository maintainers via the contact information in their GitHub profiles. Include:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (optional)

We will acknowledge your report within **72 hours** and aim to release a fix within **30 days** of confirmation.

## Security Considerations

DataMuse is designed as a **local development / internal tool**. If you plan to deploy it on a public network, please review the following:

- **Authentication**: DataMuse does not include built-in authentication. Add an authentication layer (e.g., OAuth, API gateway) before exposing it to untrusted users.
- **HTTPS**: The development server does not use TLS. Use a reverse proxy (e.g., nginx, Caddy) with a valid TLS certificate for production deployments.
- **CORS**: The default CORS policy allows only `http://localhost:5173`. Update this to match your production domain.
- **Rate Limiting**: No rate limiting is applied by default. Add rate limiting on upload and chat endpoints to prevent abuse.
- **File Uploads**: Only CSV and Excel files are accepted, but you should still restrict upload sizes and scan files in production.
- **Qdrant**: If running Qdrant on a remote server, configure its API key for access control.

## Dependencies

We recommend running `pip audit` and `npm audit` periodically to check for known vulnerabilities in project dependencies.
