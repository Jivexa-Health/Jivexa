# 🏥 JIVEXA Health OS
### AI-Powered Health. Connected Care.

<p align="center">
  <strong>Building the Future of Connected Healthcare</strong>
</p>

<p align="center">
  <a href="https://jivexa-mvp.vercel.app/">Live Website</a> •
  <a href="https://jivexa-main.onrender.com/">Backend API</a> •
  <a href="https://jivexa-main.onrender.com/">Backend Health</a>
</p>

---

## 🚀 About JIVEXA

**JIVEXA Health OS** is an AI-powered digital healthcare platform designed to make healthcare more accessible, connected, and organized.

JIVEXA aims to bring patients, healthcare professionals, medical records, AI-powered health assistance, and emergency healthcare services together in one connected digital ecosystem.

Our vision is to simplify healthcare access through technology, intelligent health insights, and connected care infrastructure.

**Project:** JIVEXA Health OS  
**Founder & CEO:** Mayank Gangwar  
**Industry:** HealthTech / Artificial Intelligence  
**Product Stage:** Pre-MVP / Patient MVP  
**Platform:** Web Application

## 🌐 Live Platform

| Component | URL |
|---|---|
| Frontend Application | https://jivexa-mvp.vercel.app/ |
| Backend Service | https://jivexa-main.onrender.com/ |
| Backend Health Check | https://jivexa-main.onrender.com/ |

## ✨ Key Features

### 1. Patient Dashboard
- Centralized patient dashboard.
- Patient profile management.
- Health information overview.
- Access to available healthcare features.

### 2. JHID – JIVEXA Health ID
- Digital health identity concept.
- Unique health identification.
- Emergency health information access.
- Designed to support connected healthcare records.

### 3. AI Health Assistant
- AI-powered health information assistance.
- Health-related question answering.
- Conversational AI interface.
- Designed to improve healthcare awareness.

### 4. AI Medical Report Analyzer
- AI-assisted medical report interpretation.
- Simplified explanations of medical terminology.
- Health report insights.
- Designed to help patients better understand their reports.

### 5. Digital Health Records
- Centralized health record management.
- Health history organization.
- Patient-focused digital health information.

### 6. Connected Healthcare Ecosystem

Planned ecosystem modules:

- Doctor Platform
- Pharmacy Integration
- Ambulance Services
- Emergency Healthcare Support
- Connected Healthcare Administration

*Availability of individual modules depends on the current development stage.*

## 🧠 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React / Vite |
| Backend | Node.js |
| API | REST API |
| Database | MongoDB Atlas |
| AI Integration | Google Gemini |
| Authentication | JWT |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Version Control | Git & GitHub |

## 🏗️ System Architecture

```text
                JIVEXA HEALTH OS
                       |
              Frontend Application
                       |
                  Vercel
                       |
                 REST API
                       |
                Node.js Backend
                       |
          +------------+------------+
          |            |            |
       MongoDB       Gemini       Auth
       Atlas           AI         JWT
          |            |            |
          +------------+------------+
                       |
              Patient Experience
```

## 📂 Project Structure

```text
Jivexa/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── server.js
│   │
│   └── package.json
│
├── README.md
└── .gitignore
```

*The structure above describes the intended major project areas; individual files may vary across versions.*

## ⚙️ Local Installation

### Prerequisites

Install the following:

- Node.js
- npm
- Git
- MongoDB Atlas account
- Google Gemini API access (for AI features)

### Step 1: Clone Repository

```bash
git clone https://github.com/Jivexa-Health/Jivexa-Health-.git
```

```bash
cd Jivexa-Health-
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file inside the backend directory.

```env
PORT=4000
NODE_ENV=development

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_secure_jwt_secret

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Replace the example values with your own credentials.

Never upload your `.env` file to GitHub.

### Step 4: Start Backend

```bash
node src/server.js
```

Backend will run on:

```text
http://localhost:4000
```

### Step 5: Install Frontend Dependencies

Open another terminal:

```bash
cd frontend
npm install
```

### Step 6: Start Frontend

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## ☁️ Deployment Architecture

### Frontend – Vercel

Live deployment:

https://jivexa-mvp.vercel.app/

### Backend – Render

Backend service:

https://jivexa-main.onrender.com/

### Database – MongoDB Atlas

JIVEXA uses MongoDB Atlas for cloud database connectivity.

Production environment variables must be configured securely in the hosting dashboard.

## 🔐 Security & Privacy

JIVEXA is being developed with a focus on responsible healthcare data management.

Security priorities include:

- Secure authentication.
- JWT-based session authorization.
- Protected environment variables.
- Controlled access to patient information.
- Responsible handling of healthcare data.
- Privacy-conscious data sharing.
- Secure API configuration.

Security and regulatory compliance are ongoing development responsibilities. This project does not claim ISO 27001 certification or regulatory approval.

## 🩺 Important Medical Disclaimer

JIVEXA's AI features are intended to provide informational assistance and help users understand health-related information.

- AI-generated information is not a medical diagnosis.
- AI-generated insights are not a substitute for professional medical advice.
- Medical decisions should be made with qualified healthcare professionals.
- In an emergency, contact local emergency medical services immediately.

## 🛣️ Product Roadmap

| Module | Development Stage |
|---|---|
| Patient Dashboard | Patient MVP |
| JHID | Patient MVP |
| AI Health Assistant | Patient MVP |
| AI Report Analyzer | Patient MVP |
| Digital Health Records | In Development |
| Doctor Platform | Planned |
| Pharmacy Integration | Planned |
| Ambulance Integration | Planned |
| Healthcare Administration | Planned |

## 🎯 Our Vision

Our vision is to build a connected healthcare operating system that brings patients, doctors, health records, AI assistance, pharmacies, and emergency healthcare services into a unified digital ecosystem.

We believe technology can help make healthcare more accessible, understandable, and connected.

## 👨‍💻 Founder

**Mayank Gangwar**  
Founder & CEO – JIVEXA Health

Building AI-powered solutions for healthcare and education.

## 📬 Connect With Us

- Website: https://jivexa-mvp.vercel.app/
- GitHub Organization: https://github.com/Jivexa-Health

## 📄 License

Copyright © 2026 JIVEXA Health.

All rights reserved unless otherwise specified by an accompanying license.

---

<p align="center">
  <strong>JIVEXA Health OS</strong><br/>
  AI-Powered Health. Connected Care.
  <br/><br/>
  Building the Future of Healthcare.
</p>
