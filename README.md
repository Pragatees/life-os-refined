<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=220&section=header&text=Life%20OS&fontSize=70&fontColor=ffffff&animation=twinkling&fontAlignY=38&desc=Your%20AI-Powered%20Personal%20Productivity%20Operating%20System&descAlignY=58&descSize=18" width="100%"/>

<br/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=24&duration=3000&pause=800&color=6C63FF&center=true&vCenter=true&width=650&lines=Organize+Tasks.+Track+Goals.+Grow+Daily.;AI-Powered+Reviews+%E2%9A%A1+Smart+Reminders;Built+with+React+Native+%2B+Spring+Boot+%2B+Gemini)](https://git.io/typing-svg)

<br/>

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)

<br/>

![Stars](https://img.shields.io/badge/⭐_Stars-Welcome-yellow?style=flat-square)
![PRs](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square)
![Made with Love](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active%20Development-blue?style=flat-square)

</div>

<br/>

> **Life OS** is an AI-powered personal productivity operating system that helps users organize their daily life through intelligent task management, goal tracking, notes, progress analytics, reminders, and AI-powered daily reviews — all wrapped in one clean, offline-first mobile experience.

<br/>

---

## 📖 Table of Contents

<details open>
<summary>Click to expand</summary>

- [🌟 Overview](#-overview)
- [✨ Features](#-features)
- [🛠 Tech Stack](#-tech-stack)
- [🏗 System Architecture](#-system-architecture)
- [📁 Project Structure](#-project-structure)
- [🔄 Application Workflow](#-complete-application-workflow)
- [🔔 Notification System](#-notification-system-workflow)
- [🤖 AI Workflow](#-ai-workflow)
- [🗂 State Management](#-state-management)
- [💾 Local Storage](#-local-storage)
- [⚙ Background Services](#-background-services)
- [🔒 Security](#-security)
- [📊 Overall Data Flow](#-overall-data-flow)
- [🚀 Startup Sequence](#-startup-sequence)
- [🎯 Design Principles](#-design-principles)
- [🔮 Future Scope](#-future-scope)
- [👨‍💻 Author](#-author)

</details>

<br/>

---

## 🌟 Overview

<img align="right" width="230" src="https://raw.githubusercontent.com/ABSphreak/ABSphreak/master/gifs/Hi.gif">

Life OS is designed to become a **complete personal operating system** rather than just another task management app.

The application combines:

- 🧠 Smart Task Management
- 🎯 Goal Tracking
- 📝 Daily Notes
- 🤖 AI Reviews
- 🔔 Intelligent Notifications
- 📊 Progress Analytics
- 🔐 Secure Authentication

...into one seamless mobile experience.

Life OS follows a **clean layered architecture** where the frontend, backend, database, notification services, and AI services work independently while communicating through secure APIs.

<br clear="right"/>

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🔐 Authentication
- Email Login
- Google Sign In
- JWT Authentication
- Forgot Password
- Secure Session Management
- Profile Management

### ✅ Task Management
- Create / Edit / Delete Tasks
- Mark Complete
- Task Priorities
- Task Date & Time
- Task Descriptions
- Recurring Tasks

### 📝 Notes
- Daily Notes
- Edit / Delete Notes
- Date-based Storage

</td>
<td width="50%" valign="top">

### 🎯 Goals
- Create / Edit / Delete Goals
- Goal Progress Tracking

### 📊 Progress
- Daily Progress
- Weekly Progress
- Monthly Progress
- Completion Statistics

### 🤖 AI
- Daily AI Review
- Weekly Review
- Monthly Review
- Intention Memories

### 🔔 Notifications
- Morning Reminder
- Task / Goal Reminder
- Daily Summary
- AI Review Reminder
- Intention Reminder
- Engagement Reminder
- Midnight Reset

</td>
</tr>
</table>

---

## 🛠 Tech Stack

<div align="center">

### Frontend
![React Native](https://img.shields.io/badge/-React_Native-61DAFB?style=flat-square&logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/-Expo-000020?style=flat-square&logo=expo&logoColor=white)
![Expo Router](https://img.shields.io/badge/-Expo_Router-000020?style=flat-square&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Zustand](https://img.shields.io/badge/-Zustand-433E38?style=flat-square)
![AsyncStorage](https://img.shields.io/badge/-AsyncStorage-6C63FF?style=flat-square)
![Expo Notifications](https://img.shields.io/badge/-Expo_Notifications-000020?style=flat-square&logo=expo&logoColor=white)
![Expo Secure Store](https://img.shields.io/badge/-Expo_Secure_Store-000020?style=flat-square&logo=expo&logoColor=white)

### Backend
![Spring Boot](https://img.shields.io/badge/-Spring_Boot-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![Spring Security](https://img.shields.io/badge/-Spring_Security-6DB33F?style=flat-square&logo=springsecurity&logoColor=white)
![JWT](https://img.shields.io/badge/-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Hibernate](https://img.shields.io/badge/-Hibernate-59666C?style=flat-square&logo=hibernate&logoColor=white)
![Maven](https://img.shields.io/badge/-Maven-C71A36?style=flat-square&logo=apachemaven&logoColor=white)

### Database & AI
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Google Gemini](https://img.shields.io/badge/-Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)

### Deployment
![Expo](https://img.shields.io/badge/Frontend-Expo-000020?style=flat-square&logo=expo&logoColor=white)
![Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat-square&logo=render&logoColor=white)
![Neon](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=white)

</div>

---

## 🏗 System Architecture

```mermaid
flowchart TD
    A["👤 USER"] --> B["📱 React Native (Expo)"]
    B --> C["🗂 Zustand Stores"]
    C --> D["🔌 Service Layer (API)"]
    D --> E["☕ Spring Boot Backend"]
    E --> F["🗄 PostgreSQL Database"]
    E --> G["✨ Gemini AI"]
    F --> H["⏰ Notification Scheduler"]
    H --> I["🔔 Expo Notifications"]
    I --> A

    style A fill:#6C63FF,color:#fff
    style E fill:#6DB33F,color:#fff
    style F fill:#4169E1,color:#fff
    style G fill:#8E75B2,color:#fff
    style I fill:#FF6B6B,color:#fff
```

---

## 📁 Project Structure

```
app/
├── (auth)
├── (tabs)
├── (ai)
├── profile
├── notes
├── goals
└── _layout

src/
├── components
├── services
│   ├── api
│   ├── notification
│   ├── auth
│   └── ai
├── store
│   ├── auth
│   ├── task
│   ├── progress
│   ├── note
│   └── goal
├── hooks
├── constants
├── utils
├── theme
└── types
```

---

## 🔄 Complete Application Workflow

<details>
<summary><strong>1️⃣ Application Launch</strong></summary>

```mermaid
flowchart TD
    A[User Opens App] --> B[Splash Screen]
    B --> C[Initialize Environment]
    C --> D[Initialize Notifications]
    D --> E[Load AsyncStorage]
    E --> F[Restore Zustand Stores]
    F --> G{Validate Authentication}
    G -->|Not Authenticated| H[Login]
    G -->|Authenticated| I[Dashboard]
```

</details>

<details>
<summary><strong>2️⃣ Authentication Workflow</strong></summary>

```mermaid
flowchart TD
    A[User Login] --> B[Validate Credentials]
    B --> C[Backend Authentication]
    C --> D[Generate JWT Token]
    D --> E[Return User Information]
    E --> F[Store Data Locally]
    F --> G[Navigate to Dashboard]
```

</details>

<details>
<summary><strong>3️⃣ Dashboard Loading</strong></summary>

```mermaid
flowchart TD
    A[Dashboard Opens] --> B[Load Tasks]
    B --> C[Load Goals]
    C --> D[Load Notes]
    D --> E[Load Progress]
    E --> F[Schedule Notifications]
    F --> G[Render UI]
```

</details>

<details>
<summary><strong>4️⃣ Task Workflow</strong></summary>

```mermaid
flowchart TD
    A[User Creates Task] --> B[Validate Form]
    B --> C[Save to Backend]
    C --> D[Store Response]
    D --> E[Update Task Store]
    E --> F[Invalidate Progress Store]
    F --> G[Recalculate Progress]
    G --> H[Schedule Reminder]
    H --> I[Refresh Dashboard]
```

</details>

<details>
<summary><strong>5️⃣ Task Completion Workflow</strong></summary>

```mermaid
flowchart TD
    A[User Completes Task] --> B[Update Backend]
    B --> C[Update Task Store]
    C --> D[Cancel Reminder]
    D --> E[Update Progress]
    E --> F[Refresh Dashboard]
```

</details>

<details>
<summary><strong>6️⃣ Goal Workflow</strong></summary>

```mermaid
flowchart TD
    A[Create Goal] --> B[Save Backend]
    B --> C[Goal Store Update]
    C --> D[Goal Reminder]
    D --> E[Dashboard Update]
```

</details>

<details>
<summary><strong>7️⃣ Notes Workflow</strong></summary>

```mermaid
flowchart TD
    A[Create Note] --> B[Save Backend]
    B --> C[Notes Store]
    C --> D[Refresh Notes Screen]
```

</details>

<details>
<summary><strong>8️⃣ Progress Workflow</strong></summary>

```mermaid
flowchart TD
    A[Tasks Changed] --> B[Progress Store Invalidated]
    B --> C[Fetch Latest Tasks]
    C --> D[Generate Statistics]
    D --> E[Daily Progress]
    D --> F[Weekly Progress]
    D --> G[Monthly Progress]
    E --> H[Dashboard Update]
    F --> H
    G --> H
```

</details>

---

## 🔔 Notification System Workflow

```mermaid
flowchart TD
    A[Application Starts] --> B[Notification Permission]
    B --> C[Initialize Scheduler]
    C --> D[Morning Reminder]
    C --> E[Task Reminder]
    C --> F[Goal Reminder]
    C --> G[AI Reminder]
    C --> H[Summary Reminder]
    C --> I[Midnight Reset]
    C --> J[Engagement Reminder]
    D & E & F & G & H & I & J --> K[User Receives Notification]
    K --> L[Tap Notification]
    L --> M[Notification Response Service]
    M --> N[Navigate to Screen]
```

---

## 🤖 AI Workflow

```mermaid
flowchart TD
    A[User Opens AI] --> B[Collect Data]
    B --> C[Tasks]
    B --> D[Goals]
    B --> E[Notes]
    B --> F[Progress]
    C & D & E & F --> G[Generate Prompt]
    G --> H["✨ Gemini AI"]
    H --> I[Receive Analysis]
    I --> J[Display Review]

    style H fill:#8E75B2,color:#fff
```

---

## 🗂 State Management

The application uses **Zustand** for global state management.

```mermaid
flowchart LR
    A[Auth Store] --> B[Task Store]
    B --> C[Progress Store]
    C --> D[Goal Store]
    D --> E[Notes Store]
```

> Each store is responsible only for its own domain while communicating with other stores when required.

---

## 💾 Local Storage

The application stores required information locally to improve performance and support offline persistence:

| Data | Purpose |
|------|---------|
| 🔑 Authentication Token | Session persistence |
| 👤 User Information | Profile display |
| ✅ Cached Tasks | Offline access |
| 📝 Cached Notes | Offline access |
| 🎯 Cached Goals | Offline access |
| 📊 Progress Cache | Fast dashboard load |
| 🎨 Theme Preferences | UI personalization |

---

## ⚙ Background Services

Life OS initializes several background services during startup:

- 🔐 Authentication Restoration
- 🔔 Notification Scheduling
- 🔁 Reminder Synchronization
- 📊 Progress Synchronization
- 💧 Store Hydration
- ✅ Cache Validation
- 🤖 AI Reminder Scheduling

---

## 🔒 Security

<div align="center">

![JWT](https://img.shields.io/badge/-JWT_Authentication-000000?style=flat-square&logo=jsonwebtokens&logoColor=white)
![Encryption](https://img.shields.io/badge/-Password_Encryption-red?style=flat-square)
![HTTPS](https://img.shields.io/badge/-HTTPS_Only-green?style=flat-square)
![Validation](https://img.shields.io/badge/-Input_Validation-blue?style=flat-square)

</div>

- JWT Authentication
- Password Encryption
- Secure Session Validation
- Protected Routes
- Input Validation
- Secure Local Storage
- HTTPS Communication

---

## 📊 Overall Data Flow

```mermaid
flowchart TD
    A[User Action] --> B[UI Component]
    B --> C[Zustand Store]
    C --> D[Service Layer]
    D --> E[Backend]
    E --> F[Database]
    F --> G[Response]
    G --> H[Store Update]
    H --> I[UI Refresh]
```

---

## 🚀 Startup Sequence

```mermaid
flowchart TD
    A[App Starts] --> B[Load Environment Variables]
    B --> C[Initialize Authentication]
    C --> D[Restore Local Storage]
    D --> E[Initialize Stores]
    E --> F[Initialize Notifications]
    F --> G[Sync Tasks]
    G --> H[Sync Goals]
    H --> I[Sync Notes]
    I --> J[Calculate Progress]
    J --> K["🎉 Dashboard Ready"]

    style K fill:#6C63FF,color:#fff
```

---

## 🎯 Design Principles

<div align="center">

| Principle | Principle |
|-----------|-----------|
| 🏛 Layered Architecture | 🧩 Single Responsibility Principle |
| ✂️ Separation of Concerns | 🔄 State-driven UI |
| 📴 Offline-first Caching | 🧱 Modular Services |
| 🧹 Clean Code Structure | ♻️ Reusable Components |
| 🛡 Type Safety | 📈 Scalable Design |

</div>

---

## 🔮 Future Scope

- [ ] 🤖 AI Agent Automation
- [ ] 🎙 Voice Assistant
- [ ] 📅 Calendar Integration
- [ ] 📧 Email Integration
- [ ] 🔁 Habit Tracking
- [ ] ⏱ Pomodoro Timer
- [ ] 🧠 Smart Scheduling
- [ ] 🧬 AI Memory System
- [ ] 🔗 Cross-device Synchronization
- [ ] 👥 Team Collaboration
- [ ] ⌚ Wearable Device Support
- [ ] 🖥 Desktop Application

---

## 👨‍💻 Author

<div align="center">

### **Pragateesh Hari**

*Life OS is a personal AI-powered productivity operating system built to help users organize their life intelligently while providing actionable insights through AI.*

![Profile Views](https://komarev.com/ghpvc/?username=pragateeshhari&label=Profile%20Views&color=6C63FF&style=flat)

</div>

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=120&section=footer" width="100%"/>

</div>
