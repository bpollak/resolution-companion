# Design Guidelines: Persona-Driven Evolution App

## Authentication & User Management
**Auth Required**: Yes - Google Sign-In via Expo AuthSession (specified by user)
- **Login Screen**: Single Google Sign-In button (centered, high contrast)
- **Account Screen**: Access via Profile tab
  - Display name from Google
  - Email (read-only)
  - Log out button (confirmation alert)
  - Delete account (nested: Settings > Account > Delete, double confirmation)

## Navigation Architecture
**Tab Navigation** (5 tabs):
1. **Today** (Home) - Daily kickstart actions
2. **Calendar** - Consistency tracking
3. **Reflect** (Center, primary action) - AI reflection interface
4. **Progress** - Benchmarks and persona alignment
5. **Profile** - Settings and account

## Screen Specifications

### 1. Onboarding Flow (Stack-Only)
**Welcome Screen**
- Full-screen with persona concept introduction
- Google Sign-In button at bottom
- Safe area: top: insets.top + Spacing.xl, bottom: insets.bottom + Spacing.xl

**AI Interview Screen**
- Transparent header with "Skip" button (right)
- Chat interface (scrollable list)
- Fixed input at bottom with safe area: bottom: insets.bottom + Spacing.xl
- Message bubbles: AI (left-aligned), User (right-aligned, accent color)

**Persona Confirmation Screen**
- Header with "Edit" button (right)
- Scrollable content showing generated persona, benchmarks, and elemental actions
- "Begin Journey" button at bottom (floating, with shadow)
- Safe area: bottom: insets.bottom + Spacing.xl

### 2. Today Tab
**Layout**:
- Transparent header with persona name as title
- Scrollable content
- Safe area: top: headerHeight + Spacing.xl, bottom: tabBarHeight + Spacing.xl

**Components**:
- Persona Alignment gauge (circular progress, large, top of screen)
- Today's date header
- Card list of elemental actions with:
  - Action title
  - Kickstart version (emphasized, larger text)
  - Anchor link text (subtle, smaller)
  - Large toggle button (completion state with haptic feedback)
  - Visual state: pending (neutral), completed (success color with checkmark), missed (muted)

### 3. Calendar Tab
**Layout**:
- Default header with month/year title
- Calendar component fills screen
- Safe area: bottom: tabBarHeight + Spacing.xl

**Components**:
- react-native-calendars with custom day markers
- Day states: completed (filled circle), missed (outlined circle), future (empty)
- Momentum chains: connecting lines between consecutive completed days
- Bottom sheet showing selected action details and progress bar
- Progress bar: percentage-based, animated fill

### 4. Reflect Tab (Center Action)
**Layout**:
- Transparent header with "Close" (left) if in active reflection
- Chat-style interface for AI reflection
- Safe area: top: headerHeight + Spacing.xl, bottom: tabBarHeight + Spacing.xl

**Components**:
- Reflection period selector (Weekly/Monthly/Yearly) when not in session
- "Start Reflection" button (large, centered)
- During reflection: same chat UI as onboarding
- AI shows momentum score and adaptive coaching in message bubbles

### 5. Progress Tab
**Layout**:
- Default header "Progress"
- Scrollable content
- Safe area: bottom: tabBarHeight + Spacing.xl

**Components**:
- Persona card at top (name, description)
- List of benchmarks with:
  - Title
  - Target date
  - Progress bar
  - Status indicator
- Expandable benchmark cards showing linked elemental actions

### 6. Profile Tab
**Layout**:
- Default header "Profile"
- Scrollable content
- Safe area: bottom: tabBarHeight + Spacing.xl

**Components**:
- User info section (Google avatar, name, email)
- Settings list:
  - Reflection intervals
  - Notifications
  - Theme preference
  - Account (leads to nested screen)

## Design System

### Color Palette (High Contrast, Minimalist)
- **Background**: Pure black (#000000) for dark mode, pure white (#FFFFFF) for light mode
- **Surface**: #1A1A1A (dark) / #F5F5F5 (light)
- **Primary/Accent**: Vibrant cyan (#00D9FF) - represents growth and momentum
- **Success**: Bright green (#00FF88) - completed actions
- **Warning**: Amber (#FFB800) - reflection prompts
- **Error/Missed**: Coral red (#FF6B6B) - missed actions
- **Text Primary**: #FFFFFF (dark) / #000000 (light)
- **Text Secondary**: #A0A0A0 (dark) / #666666 (light)

### Typography
- **Headers**: SF Pro Display (iOS) / Roboto (Android)
  - Large Title: 34px, Bold
  - Title: 28px, Semibold
  - Headline: 17px, Semibold
- **Body**: SF Pro Text (iOS) / Roboto (Android)
  - Body: 17px, Regular
  - Callout: 16px, Regular
  - Caption: 12px, Regular
- **Kickstart Text**: 19px, Medium (emphasized for quick scanning)

### Visual Design
- **Icons**: Lucide React Native, 24px default size
- **Floating buttons**: 
  - Shadow: shadowOffset {width: 0, height: 2}, shadowOpacity: 0.10, shadowRadius: 2
  - Elevation: 2 (Android)
- **Cards**: 16px border radius, no shadow (flat design)
- **Touchable feedback**: 
  - Scale down to 0.98 on press
  - Opacity 0.7 for text-only buttons
  - Haptic feedback on completion toggles (medium impact)
- **Momentum chains**: 2px solid lines in accent color, animated draw-in
- **Progress bars**: 8px height, rounded ends, animated fill (300ms ease)

### Accessibility
- All touchable targets minimum 44x44pt
- Color contrast ratio 7:1 for text
- Haptic feedback for critical actions (completions)
- VoiceOver/TalkBack labels for all interactive elements
- Dynamic type support for text scaling

### Critical Assets
None required - use system icons from Lucide React Native for all UI elements. The app's visual identity comes from the high-contrast color scheme and momentum visualization, not custom graphics.