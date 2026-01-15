# User Guide: Mobile

The Mindwtr mobile app is built with React Native and Expo, providing a native experience on Android and iOS.

## Overview

The mobile app uses tab navigation for main views and a drawer for additional views.

---

## Navigation

### Bottom Tabs

| Tab            | Description                          |
| -------------- | ------------------------------------ |
| 📥 **Inbox**    | Capture and process incoming items   |
| 🎯 **Focus**    | Daily dashboard and next actions     |
| 📁 **Projects** | Multi-step outcomes                  |
| ☰ **Menu**     | Access Board, Review, Calendar, etc. |

### Menu Tab
 
Tap the **Menu** tab to access additional views:
 
 - 📋 **Board** — Kanban board view
 - 🗓️ **Calendar** — Time-based view
 - 📝 **Review** — Daily + weekly review
 - 🏷️ **Contexts** — Filter by context
 - ⏳ **Waiting For** — Delegated items
 - 💭 **Someday/Maybe** — Future ideas
 - 📦 **Archived** — Archived tasks
 - ⚙️ **Settings** — App preferences

---

## Global Search

Tap the **search icon** in the header to open Global Search.

### Search Operators

Use operators for powerful filtering:

| Operator   | Example            | Description             |
| ---------- | ------------------ | ----------------------- |
| `status:`  | `status:next`      | Filter by task status   |
| `-status:` | `-status:done`     | Exclude a status        |
| `context:` | `context:@home`    | Filter by context       |
| `tag:`     | `tag:#focused`     | Filter by tag           |
| `project:` | `project:HomeReno` | Filter by project       |
| `due:`     | `due:today`        | Tasks due on date       |
| `due:<=`   | `due:<=7d`         | Tasks due within 7 days |
| `OR`       | `@home OR @work`   | Match either condition  |

### Saved Searches

Save frequently used searches:

1. Enter your search query
2. Tap **"Save Search"**
3. Name your search
4. Access from the drawer under **Saved Searches**

**To delete:** Open the saved search, tap the trash icon in the header.

---


## Quick Capture

Mindwtr offers multiple ways to capture tasks quickly on mobile.

The capture screen is input-first. The syntax help is tucked behind a small “?” toggle to keep the interface clean.

### Share Sheet

Capture tasks from any app using the share sheet:

1. In any app (browser, email, notes), find something you want to capture
2. Tap the **Share** button
3. Select **Mindwtr** from the share options
4. The content is added to your Inbox automatically

Great for:
- Saving articles to read later
- Capturing emails as tasks
- Adding links from web browsing

### Home Widget

Add the Mindwtr widget to your home screen for quick access:

1. Long-press on your home screen
2. Select **Widgets**
3. Find and add the **Mindwtr** widget
4. Tap the widget to open quick capture or view focus items

### Quick-Add Syntax

Mindwtr parses natural language when adding tasks:

| Syntax       | Example           | Result             |
| ------------ | ----------------- | ------------------ |
| `@context`   | `@home`           | Adds context       |
| `#tag`       | `#focused`        | Adds tag           |
| `+Project`   | `+HomeReno`       | Assigns to project |
| `+Multi Word`| `+New Project`    | Assigns to "New Project" |
| `/due:date`  | `/due:friday`     | Sets due date      |
| `/note:text` | `/note:call back` | Adds description   |
| `/status`    | `/next`, `/waiting` | Sets status      |

**Date formats:** today, tomorrow, friday, next week, in 3 days

---

## Audio Capture

Capture tasks using your voice with AI-powered transcription.

### Setup

1. Go to **Settings → AI Assistant** (in the Settings tab).
2. Enable **Speech to Text**.
3. Choose a **Provider**:
   - **OpenAI / Gemini**: Cloud-based (requires API key).
   - **Offline (Whisper)**: Runs locally. You can download a model (e.g., Tiny or Base) directly in settings.
4. Set your **Default Capture Method** in **Settings → General** if you prefer audio-first.

### Using Audio Capture

- **Quick Add**: Tap the **Audio** tab in the Quick Capture screen.
- **Record**: Tap the microphone to start.
- **Transcribe**: Stop recording to process the audio.
- **Smart Parse**: If enabled, the app will extract dates and fields automatically.

---

## Inbox

Your capture zone for quick task entry.

### Adding Tasks

1. Tap the input field at the bottom
2. Use the share sheet from other apps
3. Tap the home widget
4. Type your task with quick-add syntax
5. Tap the add button or press Enter

### Processing Inbox

Tap **Process Inbox** to start the clarify workflow:

1. **Is this actionable?**
   - Yes → Continue
   - No → Trash or Someday/Maybe

2. **Will it take less than 2 minutes?**
   - Yes → Do it now, mark Done
   - No → Continue

3. **What's next?**
   - I'll do it → Add context, move to Next Actions
   - Delegate → Move to Waiting For

4. **Where will you do this?**
   - Select contexts (@home, @work, etc.)
   - Add custom contexts

5. **Assign to a project?** (Optional)
   - Select a project or skip

---

## Focus

Your primary dashboard for doing.

### Sections

| Section      | Content                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **Today**    | Tasks focused for today, due today/overdue, or starting today           |
| **Next**     | Context-filtered actionable tasks ready to be picked up                 |

### Features

- **Context filter** — Tap a context chip to filter the Next list.
- **Swipe to Focus** — Swipe a task right to toggle "Focus" status (moves it to Today).
- **Quick Status** — Tap the status badge to change status.

---

## Review

Review your tasks and update their status.

- See task details (description, start time, deadline, contexts)
- Quickly mark tasks as done
- Navigate between tasks
- **Select mode**: Batch select tasks and share them

---

## Task Editor (Task + View)

The task editor has two modes:

- **Task** — edit fields, checklists, dates, tags, contexts
- **View** — clean read-only summary with tappable checklist

Swipe left/right to switch between **Task** and **View**.

Checklist-first tasks default to View mode for faster checking.

The editor starts minimal. Tap **More options** to reveal advanced fields; any field with existing content stays visible.

### Attachments

You can attach files or links to a task from the editor. Audio notes can be saved as attachments when **Save audio attachments** is enabled.

See [[Attachments]] for details on syncing and cleanup.

---

## AI Assistant (Optional)

Enable in **Settings → Advanced → AI assistant**:

- **Clarify** — turn vague tasks into concrete next actions
- **Break down** — generate checklist steps for big tasks
- **Review analysis** — highlight stale tasks during review
- **Copilot** — context/tag/time suggestions while typing

AI is optional and only runs when you request it.

---

## Reusable Lists

Use checklists as templates:

- **Duplicate task** — copy a master list (packing, travel prep)
- **Reset checklist** — uncheck everything for reuse (groceries)

---

## Calendar Integration

Mindwtr can overlay external calendars (ICS subscriptions) in the Calendar view:

1. Go to **Settings → Advanced → Calendar**
2. Add your **ICS URL**
3. Refresh to fetch events

External events are view‑only and are not synced.

---

## Calendar

Time-based view with scheduling capabilities.

### Views

- **Month View** — Overview of tasks with due dates
- **Day View** — Detailed timeline with scheduled tasks and external events

### Scheduling Tasks

1. On the Calendar day view, tap **Schedule Tasks**
2. Select from Next Actions (shown first) or search Todo tasks
3. Mindwtr finds the earliest free slot (avoids conflicts with external events)
4. Task gets a start time based on its time estimate

### Drag to Reschedule

- Long-press a scheduled task block
- Drag to a new time slot (snaps to 5-minute intervals)
- Release to update the start time

### External Calendars (iCal/ICS)

Subscribe to external calendars to see events alongside your tasks:

1. Go to **Settings → Advanced → Calendar**
2. Enter the calendar URL (ICS/webcal format)
3. Give it a name and tap **Add**
4. External events appear as gray blocks in Day view

---

## Projects

Manage multi-step outcomes.

### Project List

- View all active projects
- See task count per project
- Tap to view project details

### Project Details

- View all tasks in the project
- Add new tasks
- Edit project settings (name, color, notes)
- Assign **Area of Focus** (e.g., Work, Personal)
- Add **Project tags** for filtering
- Set sequential or parallel mode
- Set review date
- Complete or archive the project

### Sequential vs Parallel

| Mode           | Behavior                                             |
| -------------- | ---------------------------------------------------- |
| **Sequential** | Only the first incomplete task shows in the Next Actions list |
| **Parallel**   | All project tasks show in the Next Actions list               |

---

## Swipe Actions

Quickly manage tasks with swipe gestures:

| View             | Swipe Right | Result             |
| ---------------- | ----------- | ------------------ |
| **Inbox**        | Done        | Marks task as done |
| **Focus**        | Focus       | Toggles focus status |

---

## Contexts

Browse and filter tasks by context.

### Location Contexts

- `@home` — Tasks to do at home
- `@work` — Tasks for the office
- `@errands` — Out and about
- `@agendas` — Discussion items
- `@computer` — Need a computer
- `@phone` — Need a phone
- `@anywhere` — Can do anywhere

### Tags

Filter tasks by energy level, mode, or topic:

- `#focused` — Deep work requiring concentration
- `#lowenergy` — Simple tasks for tired moments
- `#creative` — Brainstorming and ideation
- `#routine` — Repetitive/mechanical tasks

---

## Waiting For

Track items delegated or waiting on external events.

- View all waiting tasks
- See deadlines
- Move to Next when ready
- Mark as Done when received

---

## Someday/Maybe

Incubate ideas for the future.

- Review periodically during Weekly Review
- Activate by moving to Next status
- Archive if no longer relevant

---

## Notifications & Reminders

Mindwtr sends push notifications to keep you on track.

### Types of Notifications

- **Due date reminders** — Alerts when tasks are due
- **Start time alerts** — Reminds you when it's time to begin
- **Recurring task reminders** — Notifications for recurring items

### Snooze

When a notification appears, you can snooze it directly:
- Tap **Snooze** to be reminded later
- Choose from preset intervals (5 min, 15 min, 1 hour, etc.)

### Permissions

Make sure notifications are enabled:
1. Go to device **Settings → Apps → Mindwtr**
2. Enable **Notifications**
3. Allow alerts and sounds as desired

---

## Settings

### General

- **Appearance** — System, Light, or Dark
- **Language** — English, Chinese, Spanish, Hindi, Arabic, German, Russian, Japanese, French, Portuguese, Korean, Italian, Turkish

### Notifications

**Task Reminders:**
- Enable/disable notifications for due dates and start times

**Daily Digest:**
- **Morning Briefing** — Summary of due today, overdue, and focus tasks
- **Evening Review** — Prompt to review and wrap up the day
- Configure times for each

**Weekly Review:**
- **Reminders** — Get a weekly notification to start your review
- **Time/Day** — Customize when you want to review (e.g., Friday at 4 PM)

### GTD

Customize how Mindwtr works for your GTD workflow:

**Features (Optional):**
- **Priorities** — Show a priority flag on tasks
- **Time Estimates** — Add a duration field for time blocking

**Time Estimate Presets:**
- Choose which time estimates appear in the task editor
- Options: 5m, 10m, 15m, 30m, 1h, 2h, 3h, 4h, 4h+
- Default: 10m, 30m, 1h, 2h, 3h, 4h, 4h+

**Auto-Archive:**
- Automatically move completed tasks to the Archive after a set number of days (default: 7 days)
- Set to "Never" to keep completions in the Done list indefinitely

**Task Editor Layout:**
- Tap a field to toggle visibility (hidden fields still show when they have values)
- Long-press the drag handle to reorder fields
- Hidden fields can be revealed with the **More** button in the editor

### Data & Sync

See [[Data and Sync]] for sync setup.

**Sync Backend:**
- **File** — Sync via a shared JSON file (Dropbox, Google Drive, etc.)
- **WebDAV** — Sync to a WebDAV server (Nextcloud, ownCloud, etc.)

**Other Options:**
- **Sync** — Manually trigger sync
- **Last sync status** — View when data was last synced
- **Export Backup** — Save data to a file

### Advanced

**AI Assistant:**
- Optional BYOK assistant for clarifying and breaking down tasks

**Calendar (ICS/iCal):**
- **Add Calendar** — Enter a name and URL
- **Enable/Disable** — Toggle visibility of each calendar
- **Remove** — Delete a subscription
- **Test** — Verify the calendar loads correctly

### About

- Version number
- Check for updates
- Website and GitHub links

---

## See Also

- [[Mobile Installation]]
- [[Data and Sync]]
- [[GTD Workflow in Mindwtr]]
