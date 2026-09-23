# HunzAi-O51W — WhatsApp Bot Backend

Backend Node.js untuk menghubungkan bot WhatsApp **asli** ke aplikasi HunzAi-O51W.
Menggunakan **Baileys** (WhatsApp Web API) + **Firebase Admin SDK**.

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)

## ✨ Fitur

- ✅ **Real WhatsApp Connection** — via Baileys (bukan simulasi)
- ✅ **Pairing Code 8-digit** support
- ✅ **QR Code** support (real QR dari WhatsApp)
- ✅ **Real-time sync** ke Firestore
- ✅ **Auto-reconnect** saat koneksi terputus
- ✅ **Session persistence** di disk
- ✅ **Auto-detect bot baru** via polling Firestore
- ✅ **Auto-cleanup** bot yang expired
- ✅ **Graceful shutdown** (SIGTERM/SIGINT)
- ✅ **Docker ready** — deploy di mana saja

---

## 📋 Prasyarat

- **Node.js ≥ 20.0.0**
- **Firebase Project** dengan Firestore enabled
- **Service Account** Firebase (Admin SDK credentials)
- **VPS / Railway / Fly.io / Render** — server yang selalu online

---

## 🚀 Setup Lokal (Development)

### 1. Clone Repository

```bash
git clone https://github.com/username/hunzai-backend.git
cd hunzai-backend
