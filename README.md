# 🌟 Life-OS

> A modern AI-powered daily productivity and task management mobile application built with React Native and Expo.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)
![Built With](https://img.shields.io/badge/built%20with-Expo-blueviolet)

---

## 📖 Overview

Life-OS is a smart daily planner designed to help users organize their day, stay productive, and never miss important tasks.

The application allows users to create daily tasks, receive timely reminders, track their progress, and maintain consistency through an intuitive and modern mobile interface.

---

## ✨ Features

### 🔐 Authentication
- User Registration
- Secure Login
- JWT Authentication
- Forgot Password (OTP Verification)
- Password Reset

---

### ✅ Task Management
- Create Daily Tasks
- Edit Tasks
- Delete Tasks
- Mark Tasks as Completed
- View Today's Tasks
- Task Status Tracking

---

### 🔔 Smart Notifications

| Notification | Time | Purpose |
|---|---|---|
| 🌅 Morning Motivation | 7:00 AM | Start your productive day |
| ⏰ Task Reminder | On time | Notify before scheduled task |
| ⚠️ Overdue Alert | Instant | Remind after task deadline |
| 🌙 Evening Review | 9:00 PM | Review completed and pending tasks |

---

### 👤 User Profile
- View Profile
- Update Profile Picture
- Theme Preferences
- Account Information

---

### 🎨 UI Features
- Modern UI
- Dark Theme
- Responsive Design
- Smooth Animations
- Beautiful Gradient Components

---

## 🛠️ Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React Native | Core mobile framework |
| Expo | Development platform |
| TypeScript | Type-safe development |
| Expo Router | File-based navigation |
| Zustand | State management |
| Axios | HTTP client |
| AsyncStorage | Local data persistence |
| Expo Notifications | Push notifications |
| Expo Image Picker | Profile picture upload |
| React Native Reanimated | Smooth animations |
| React Native Gesture Handler | Touch interactions |

### Backend
- Spring Boot REST API
- JWT Authentication
- Modules: Auth, User Profile, Task Management, Notifications

---

## 📁 Project Structure

```
life-os/
│
├── app/
│   ├── (auth)/
│   ├── (tabs)/
│   ├── profile/
│   ├── task/
│   └── index.tsx
│
├── assets/
│
├── components/
│
├── constants/
│
├── hooks/
│
├── services/
│
├── store/
│
├── types/
│
├── utils/
│
├── app.json
├── package.json
└── README.md
```

---

## 🚀 Installation

**Clone the repository**
```bash
git clone https://github.com/your-username/life-os.git
```

**Move into the project**
```bash
cd life-os
```

**Install dependencies**
```bash
npm install
```

**Start the development server**
```bash
npx expo start
```

**For Android**
```bash
npx expo run:android
```

**For iOS**
```bash
npx expo run:ios
```

---

## 📱 Screens

- Login
- Register
- Forgot Password
- Dashboard
- Add Task
- Task List
- Task Details
- Profile
- Settings

---

## 🔐 Authentication Flow

```
User
   │
   ▼
Login / Register
   │
   ▼
Spring Boot API
   │
   ▼
JWT Token
   │
   ▼
AsyncStorage
   │
   ▼
Protected Screens
```

---

## 📦 Main Dependencies

```json
{
  "expo": "...",
  "react-native": "...",
  "expo-router": "...",
  "zustand": "...",
  "axios": "...",
  "@react-native-async-storage/async-storage": "...",
  "expo-notifications": "...",
  "expo-image-picker": "...",
  "react-native-reanimated": "..."
}
```

---

## 🚧 Future Enhancements

- [ ] Google Authentication
- [ ] AI Task Suggestions
- [ ] Calendar Integration
- [ ] Habit Tracker
- [ ] Productivity Analytics
- [ ] Voice Task Creation
- [ ] Cloud Backup
- [ ] Cross-device Sync
- [ ] Widget Support

---

## 👨‍💻 Developer

**Pragateesh Hari**

B.Tech Artificial Intelligence & Data Science

Sri Eshwar College of Engineering

---

## 📄 License

This project is licensed under the MIT License.

---

## ⭐ Support

If you like this project, consider giving it a ⭐ on GitHub.

Your support motivates future improvements.

---

## 📬 Contact

- GitHub: https://github.com/Pragatees
- Email: haripragateesh7@gmail.com
