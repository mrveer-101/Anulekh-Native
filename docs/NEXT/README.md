# Anulekh NEXT

This directory serves as the architectural reference and design blueprint for the **`NEXT`** branch of Anulekh.

## Documents

- [**System & Storage Architecture**](./ARCHITECTURE.md): Complete guide to the **Turso + Cloudflare R2 + Rust Axum** stack, including why PostgreSQL was retired, the direct presigned URL upload pipeline, audio streaming, and future zero-cost data migration workflows.

## Core Stack Summary

| Layer | Technology | Status |
| :--- | :--- | :--- |
| **Frontend** | React Native (Expo SDK 56) | Active |
| **Backend** | Rust + Axum | Active |
| **Relational Database** | Turso (Serverless SQLite / `libsql`) | Active |
| **Binary & Media Storage** | Cloudflare R2 (10 GB free, $0 egress) | Active |
| **Legacy Database (PostgreSQL)** | Supabase / PostgreSQL | **Retired / Removed** |
