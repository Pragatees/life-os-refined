<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=260&section=header&text=Life%20OS&fontSize=80&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Your%20Day.%20Organized.%20Automated.%20Intelligent.&descAlignY=58&descSize=20" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=26&duration=3000&pause=800&color=6C63FF&center=true&vCenter=true&multiline=true&repeat=true&width=800&height=90&lines=Tasks+%2B+Goals+%2B+Journal+%2B+AI+%3D+Life+OS;React+Native+%E2%9A%A1+Spring+Boot+%E2%9A%A1+PostgreSQL;Your+Personal+Productivity+Operating+System" alt="Typing SVG" />

<br/>

![Stars](https://img.shields.io/github/stars/yourusername/life-os?style=for-the-badge&color=6C63FF&logo=github)
![Forks](https://img.shields.io/github/forks/yourusername/life-os?style=for-the-badge&color=FF6584&logo=github)
![Issues](https://img.shields.io/github/issues/yourusername/life-os?style=for-the-badge&color=FFD93D&logo=github)
![License](https://img.shields.io/badge/license-MIT-00C9A7?style=for-the-badge)
![Build](https://img.shields.io/badge/build-passing-4ADE80?style=for-the-badge&logo=githubactions&logoColor=white)

<img src="https://raw.githubusercontent.com/Platane/snk/output/github-contribution-grid-snake.svg" width="100%"/>

</div>

<br/>

## 🧭 Table of Contents

<div align="center">

| [🚀 Overview](#-overview) | [🏗️ Architecture](#️-architecture) | [🔐 Auth Flow](#-authentication-flow) | [✅ Tasks](#-task-management) |
|:---:|:---:|:---:|:---:|
| [🎯 Goals](#-goal-management) | [📓 Journal](#-daily-journal) | [📊 Progress](#-progress-calculation) | [🤖 AI Review](#-ai-review-engine) |
| [🔔 Notifications](#-notification-system) | [🖥️ Backend](#️-backend) | [🗄️ Database](#️-database) | [☁️ Deployment](#️-deployment--cicd) |

</div>

---

## 🚀 Overview

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="500">
</div>

**Life OS** is a full-stack personal productivity system that unifies **Tasks**, **Goals**, **Journaling**, **Progress Analytics**, and **AI-Powered Reviews** into a single mobile-first experience — backed by a robust Spring Boot + PostgreSQL infrastructure and driven by smart, scheduled notifications.

```mermaid
%%{init: {'theme':'dark', 'themeVariables': { 'primaryColor': '#6C63FF','primaryTextColor':'#fff','lineColor':'#FF6584','secondaryColor':'#00C9A7'}}}%%
flowchart LR
    U([👤 User]) --> APP[📱 React Native App]
    APP --> AUTH{🔐 Token?}
    AUTH -- Yes --> DASH[🏠 Dashboard]
    AUTH -- No --> LOGIN[🔑 Login / Signup]
    LOGIN --> DASH
    DASH --> TASKS[✅ Tasks]
    DASH --> GOALS[🎯 Goals]
    DASH --> NOTES[📓 Journal]
    DASH --> PROG[📊 Progress]
    DASH --> AI[🤖 AI Review]
    TASKS & GOALS & NOTES & PROG & AI --> BACKEND[(🖥️ Spring Boot)]
    BACKEND --> DB[(🗄️ PostgreSQL / Neon)]

    style U fill:#6C63FF,stroke:#fff,stroke-width:2px
    style APP fill:#00C9A7,stroke:#fff,stroke-width:2px
    style BACKEND fill:#FF6584,stroke:#fff,stroke-width:2px
    style DB fill:#FFD93D,stroke:#333,stroke-width:2px
```

---

## 🏗️ Architecture

<div align="center">

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart TB
    subgraph CLIENT["📱 React Native (Expo)"]
        direction TB
        SPLASH[Splash Screen] --> STORAGE[AsyncStorage Init]
        STORAGE --> TOKEN{Load User Token}
    end

    subgraph SERVER["🖥️ Spring Boot Backend"]
        direction TB
        A2[Authentication]
        T2[Tasks]
        G2[Goals]
        N2[Notes]
        P2[Progress]
        PR2[Profile]
        AI2[AI Review]
        RT2[Recurring Tasks]
    end

    subgraph DATA["🗄️ Neon PostgreSQL"]
        direction TB
        USERS[(Users)]
        TASKSDB[(Tasks)]
        GOALSDB[(Goals)]
        NOTESDB[(Notes)]
        OTP[(Password Reset OTPs)]
    end

    CLIENT ==>|Secure Requests| SERVER
    SERVER ==>|Persist / Query| DATA
```

</div>

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/213910845-af37a709-8995-40d6-b0bd-07f2ab5efc44.gif" width="80">
<img src="https://user-images.githubusercontent.com/74038190/213910842-0e1cf5db-9948-49b8-93cf-88f3c9b6a4d6.gif" width="80">
<img src="https://user-images.githubusercontent.com/74038190/213910845-af37a709-8995-40d6-b0bd-07f2ab5efc44.gif" width="80">
</div>

---

## 🔐 Authentication Flow

<img src="https://user-images.githubusercontent.com/74038190/216122041-518ac897-8d92-4c6b-9b3f-ca01dcaf38ee.png" width="100%">

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 User
    participant A as 📱 App
    participant B as 🖥️ Spring Boot
    participant S as 📦 AsyncStorage

    U->>A: Login / Signup / Google Login
    A->>B: Submit Credentials
    B->>B: ⚙️ Validate & Generate JWT
    B-->>A: JWT + User Profile
    A->>S: Store token, username, fullname, email, profilePicture
    S-->>A: ✅ Authenticated User
    A->>U: 🏠 Redirect to Dashboard

    Note over U,B: Forgot Password → Reset Password → Logout also supported
```

**Capabilities:** `Login` · `Signup` · `Google Login` · `Forgot Password` · `Reset Password` · `Logout`

---

## 🏠 Home Page

<div align="center">

| Widget | Description |
|---|---|
| 📝 **Today's Tasks** | Everything due today, at a glance |
| 🎯 **Today's Goals** | Active goals and deadlines |
| 📓 **Today's Journal** | Quick entry to today's note |
| 📈 **Daily Progress** | Live completion snapshot |
| ⚡ **Quick Actions** | One-tap create for tasks/goals/notes |
| 🤖 **AI Review** | Smart daily productivity insights |

</div>

---

## ✅ Task Management

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart LR
    ADD[➕ Add Task] --> API1[Backend Endpoint]
    EDIT[✏️ Edit Task] --> API2[Backend Endpoint]
    DEL[🗑️ Delete Task] --> API3[Backend Endpoint]
    DONE[✔️ Complete Task] --> API4[Backend Endpoint]
    REC[🔁 Recurring Tasks] --> RTYPE{Repeat Type}
    RTYPE --> NEVER[Never]
    RTYPE --> DAILY[Daily]
    RTYPE --> WEEKLY[Weekly]
    RTYPE --> MONTHLY[Monthly]
    RTYPE --> YEARLY[Yearly]

    API1 & API2 & API3 & API4 & RTYPE --> VAL[⚙️ Backend Validation]
    VAL --> DB[(🗄️ PostgreSQL)]
```

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/212257468-1e9a91f1-b626-4baa-b15d-5c385dfa7ed2.gif" width="300">
</div>

---

## 🎯 Goal Management

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart LR
    C[✨ Create Goal] --> SB[🖥️ Spring Boot]
    E[✏️ Edit Goal] --> SB
    D[🗑️ Delete Goal] --> SB
    DL[⏰ Goal Deadline] --> SB
    P[📊 Goal Progress] --> SB
    SB --> DB[(🗄️ PostgreSQL)]
```

---

## 📓 Daily Journal

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart LR
    T[📓 Today's Journal] --> CN[Create Note]
    T --> UN[Update Note]
    T --> DN[Delete Note]
    CN & UN & DN --> BE[⚙️ Backend]
    BE --> DB[(🗄️ PostgreSQL)]
```

---

## 📊 Progress Calculation

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/229223263-cf2e4b07-2615-4f87-9c38-e37600f8381a.gif" width="400">
</div>

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart TD
    CHANGE[🔄 Whenever Task Changes] --> INVALIDATE[⚡ Progress Store Invalidates Cache]
    INVALIDATE --> FETCH[Fetch Fresh Data]
    FETCH --> DAILY[📅 Daily Progress]
    FETCH --> WEEKLY[📆 Weekly Progress]
    FETCH --> MONTHLY[🗓️ Monthly Progress]
    DAILY & WEEKLY & MONTHLY --> OUT{{"📈 Charts · ✅ Completion % · 📋 Completed / Pending · 📊 Statistics"}}
```

---

## 🤖 AI Review Engine

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart LR
    D[Daily] & W[Weekly] & M[Monthly] --> PS[🗃️ Progress Store]
    PS --> TASKS2[Tasks]
    PS --> GOALS2[Goals]
    PS --> NOTES2[Notes]
    PS --> STATS[Statistics]
    TASKS2 & GOALS2 & NOTES2 & STATS --> PB[🧠 AI Prompt Builder]
    PB --> LLM[✨ LLM]
    LLM --> REVIEW{{"🏆 Achievements · 💡 Suggestions · 📉 Improvements · 🔥 Motivation"}}
```

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/213866269-5d00981c-7c98-46d7-8a8e-16f462f15227.gif" width="350">
</div>

---

## 🔔 Notification System

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart TB
    BOOT[🚀 Notification Bootstrap] --> MGR[🔔 Notification Manager]
    MGR --> INIT[Initialize]
    INIT --> TN[Task Notifications]
    INIT --> GN[Goal Notifications]
    INIT --> NN[Note Notifications]
    INIT --> AIN[AI Review Notifications]
    INIT --> ACN[Account Notifications]
```

### ⏱️ Task Notifications
```mermaid
flowchart LR
    TC[Task Created] --> RC[Reminder Calculation]
    RC --> M15[⏳ 15 Min Before]
    RC --> M5[⏳ 5 Min Before]
    RC --> IM[⚡ Immediate]
    RC --> OD[🚨 Overdue]
    M15 & M5 & IM & OD --> EXPO[📲 Expo Notification]
```

### 🎯 Goal Notifications
```mermaid
flowchart LR
    GD[Goal Deadline] --> R[Reminder] --> EXPO2[📲 Expo Notification]
```

### 📓 Daily Journal Notification
<div align="center">

| Condition | Notification |
|---|---|
| ✅ Note exists | **📝 Journal Completed** — *Great work! You've already written today's journal.* |
| ❌ Note missing | **📝 Daily Journal Reminder** — *Don't forget to write today's journal before your day ends.* |

⏰ Scheduled Daily at **9:30 PM**

</div>

### 🤖 AI Review Notifications
<div align="center">

| Frequency | Time |
|---|---|
| 📅 Daily | 9:15 PM |
| 📆 Weekly (Sunday) | 9:15 PM |
| 🗓️ Monthly (Last Day) | 9:15 PM |

</div>

### 👆 Notification Response Routing
```mermaid
flowchart LR
    TAP[👆 User Taps Notification] --> NRS[Notification Response Service]
    NRS --> NAV{Navigate}
    NAV --> TS[✅ Task Screen]
    NAV --> GS[🎯 Goal Screen]
    NAV --> NS[📓 Notes Screen]
    NAV --> AIS[🤖 AI Review Screen]
```

---

## 🖥️ Backend

<div align="center">
<img src="https://skillicons.dev/icons?i=java,spring,postgres&theme=dark" />
</div>

**Spring Boot** powers: `Authentication` · `Tasks` · `Goals` · `Notes` · `Progress` · `Profile` · `AI Review` · `Recurring Tasks`

---

## 🗄️ Database

<div align="center">
<img src="https://skillicons.dev/icons?i=postgres&theme=dark" />
</div>

**PostgreSQL (Neon)** tables: `Users` · `Tasks` · `Goals` · `Notes` · `Password Reset OTPs`

---

## ☁️ Deployment & CI/CD

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart TB
    DEV[👨‍💻 Developer] --> PUSH[⬆️ Git Push]
    PUSH --> GH[🐙 GitHub]
    GH --> GA[⚙️ GitHub Actions]
    GA --> BUILD[🔨 Build]
    BUILD --> DEPLOY[🚀 Deploy]
    DEPLOY --> RENDER[☁️ Render]

    subgraph FE[Frontend]
        RN[React Native / Expo] --> APK[📦 Android APK / Dev Build]
    end

    subgraph BE[Backend]
        SB[Spring Boot] --> RENDER
    end

    subgraph DBFLOW[Database]
        NEON[🗄️ Neon PostgreSQL]
    end

    RENDER --> NEON
```

### 💓 Backend Keep-Alive

```mermaid
flowchart LR
    CRON[⏰ cron-job.org] -->|Every 15 Minutes| HEALTH[Health Check Ping]
    HEALTH --> RB[☁️ Render Backend]
    RB -->|200 OK| READY[✅ Backend Ready For Requests]
```

---

## 🌀 Complete Flow

<div align="center">

```mermaid
%%{init: {'theme':'dark'}}%%
flowchart LR
    U([👤 User]) --> L[🔑 Login] --> J[🔐 JWT Auth] --> D[🏠 Dashboard]
    D --> TGN["✅ Tasks · 🎯 Goals · 📓 Notes"]
    TGN --> P[📊 Progress]
    P --> N[🔔 Notifications]
    N --> AI[🤖 AI Review]
    AI --> DP[⚡ Daily Productivity]
    DP --> LOS([🌟 Life OS])

    style U fill:#6C63FF,color:#fff
    style LOS fill:#FF6584,color:#fff
```

</div>

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/212284158-e840e285-664b-44d7-b79b-e264b5e54825.gif" width="500">
</div>

---

<div align="center">

### 💜 Built with passion for productivity

<img src="https://forthebadge.com/images/badges/made-with-typescript.svg">
<img src="https://forthebadge.com/images/badges/built-with-love.svg">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=150&section=footer"/>

</div>
