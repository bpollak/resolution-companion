# Resolution Companion

## Overview
Resolution Companion is an AI-powered mobile application built with React Native and Expo, designed to facilitate personal evolution through identity-based behavior change. It helps users define a "Target Persona" via AI-driven interviews, establish Core Benchmarks, and track daily "Elemental Actions." The app promotes sustainable personal growth by focusing on identity transformation rather than traditional goal-setting.

Key capabilities include:
- AI-powered onboarding for Target Persona definition.
- Daily elemental actions with "120 Second Kickstart" versions for habit formation.
- Consistency calendar with momentum chain visualization.
- AI-powered reflection sessions for adaptive coaching.
- Progress tracking with persona alignment metrics.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React Native with Expo SDK 54.
- **Navigation**: React Navigation v7 (native stack, bottom tabs).
- **State Management**: React Context (AppContext) with TanStack React Query.
- **Local Storage**: AsyncStorage for offline-first data persistence.
- **Theming**: Forced high-contrast dark mode with cyan accent (#00D9FF), custom theming system using StyleSheet.
- **Animations**: React Native Reanimated for fluid interactions.
- **Path Aliases**: `@/` for `./client`, `@shared/` for `./shared`.

### Backend
- **Runtime**: Express.js server with TypeScript.
- **API Design**: RESTful endpoints, Server-Sent Events (SSE) for AI streaming responses.
- **AI Integration**: OpenAI API (GPT-4o) for conversational onboarding and reflection coaching.
- **Build**: esbuild for production server bundling.

### Data Storage
- **Primary**: AsyncStorage for client-side persistence.
- **Data Model**: Organizes data around Personas, Benchmarks, Elemental Actions, Daily Logs, and Reflections.

### Promotional Website
- Served by the Express server at the root URL.
- Features: Hero section, key features, inspirational quotes, mission, feedback form, download section.
- Feedback is stored in a PostgreSQL database (website_feedback table).

### Feature Specifications
- **Freemium Model**: Supports multiple personas and custom actions. Premium features include unlimited personas, unlimited AI reflections, and the ability to add new benchmarks.
- **Onboarding Flow**: Multi-screen walkthrough introducing the app, followed by an AI chat for persona definition with a visual progress indicator.
- **Action Logging**: Users can log actions for past dates via the Calendar, with visual feedback.
- **Notifications**: Daily reminder push notifications scheduled for 8:00 PM to log actions, with proper permission handling.
- **Subscription Management**: Implemented Stripe payment integration for premium subscriptions with product creation (Monthly, Yearly), checkout flow, and webhook handling. Includes device-based subscription tracking, restore features, and persistence in a PostgreSQL `device_subscriptions` table.
- **Native In-App Purchases**: expo-in-app-purchases integration for iOS App Store and Google Play Store. Platform detection uses native IAP on iOS/Android and Stripe on web. Server-side receipt validation for both Apple and Google. Environment variables needed for production: APPLE_SHARED_SECRET, GOOGLE_SERVICE_ACCOUNT_KEY, ANDROID_PACKAGE_NAME.

## External Dependencies

- **OpenAI API**: Used for AI-powered conversational onboarding and reflection coaching (GPT-4o).
- **React Native**: Core framework for mobile application development.
- **Expo**: Provides tools and services for React Native development.
- **React Navigation**: Handles in-app navigation.
- **React Context / TanStack React Query**: For state management.
- **AsyncStorage**: For local data persistence.
- **React Native Reanimated**: For animations.
- **Express.js**: Backend server framework.
- **TypeScript**: For type-safe development.
- **esbuild**: For bundling the backend server.
- **Stripe**: For subscription payments and management.
- **PostgreSQL**: Database for storing website feedback and subscription data (used with Drizzle ORM).
- **expo-notifications / expo-device**: For push notifications.