# Feature Ideas from GTD Community

> Ideas extracted from r/gtd Reddit discussions that could enhance Mindwtr

---

## High Priority (Simple & Impactful)

### 1. Person-Based Contexts / Tags
**Problem:** Users struggle to remember agenda items when someone calls unexpectedly.
**Solution:** Allow tagging tasks with person names (e.g., @Bob, +Sarah). Search by person name to see all relevant items.
**Implementation:** Already have contexts - just need to promote person-tagging in onboarding/tutorials.

### 2. Quick Search Before Calls ✅ (Implemented!)
**Status:** Global Search added (Cmd+K on desktop, Search icon on mobile).
**Problem:** Users need fast access to agenda items during surprise interactions.
**Solution:** Quick-access search button or widget. When someone calls, tap to search their name instantly.
**Implementation:** Spotlight-style search on mobile, keyboard shortcut on desktop.

### 3. Sequential vs Parallel Tasks ✅ (Implemented!)
**Status:** Projects now have a Sequential/Parallel toggle. Sequential projects only show first incomplete task in Next Actions.
**Problem:** Some projects have ordered steps; others don't.
**Solution:** Add "sequential" mode to projects where completing one task auto-promotes the next.
**Implementation:** Add a toggle on projects. If sequential, only show first incomplete task in next actions.

### 4. Time Estimates on Tasks ✅ (Implemented!)
**Status:** Tasks now have optional time estimate field with 5min/15min/30min/1hr/2hr+ options.
**Problem:** Users can't quickly filter by available time.
**Solution:** Add optional time estimate field. Allow filtering by "tasks I can do in 15 min".
**Implementation:** Simple dropdown: 5min, 15min, 30min, 1hr, 2hr+

### 5. Energy-Based Contexts ✅ (Already Implemented!)
**Status:** Already added @low-energy, @high-focus, @creative, @admin contexts.

---

## Medium Priority (Valuable but Complex)

### 6. AI-Assisted Clarifying
**Problem:** The hardest part of GTD is the Clarify step - defining next actions and outcomes.
**Solution:** Optional AI helper that asks clarifying questions: "What does done look like?" "What's the very first step?"
**Implementation:** ChatGPT-style assistant for processing inbox items.

### 7. Waiting For Enhancement
**Problem:** Users forget to follow up on delegated/waiting items.
**Solution:** Add auto-reminder for waiting items after X days. Add "last contacted" date.
**Implementation:** Optional follow-up interval on waiting items.

### 8. Project Support Notes ✅ (Implemented!)
**Status:** Collapsible notes section added to Project views.
**Problem:** Future actions and planning notes don't belong on next actions list but need a home.
**Solution:** Rich notes field per project for brainstorms, future steps, reference material.
**Implementation:** Expand project view with collapsible notes section.

### 9. Task Chunking Assistant
**Problem:** Large tasks (8+ hours) need to be broken down, but users forget to do this.
**Solution:** When adding a task with time estimate >2 hours, prompt: "This is a big task. Want to break it into smaller chunks?"
**Implementation:** Optional modal with chunking suggestions.

### 10. Stale Task Indicators ✅ (Already Implemented!)
**Status:** Already added task age badges that show how old tasks are.

---

## Lower Priority (Nice to Have)

### 11. Agenda View Per Person
**Problem:** Need to prep for meetings with specific people.
**Solution:** Dedicated "People" view showing all items tagged with that person.
**Implementation:** Virtual view filtering by person context.

### 12. Gamification Elements
**Problem:** Users find lists demotivating.
**Solution:** Optional streak counters, completion celebrations, progress visualizations.
**Implementation:** Simple completion animations, weekly "wins" summary.

### 13. Location-Based Reminders
**Problem:** Errands list only useful when you're out.
**Solution:** Geo-fencing for @errands context (mobile).
**Implementation:** iOS/Android location permissions, optional reminders when near stores.

### 14. Quick Daily Snapshot
**Problem:** Users want to see "what should I focus on today?" without scanning all lists.
**Solution:** Morning dashboard with: overdue, due today, today's focus (starred), and in-progress.
**Implementation:** Already partially implemented in Agenda view!

### 15. Time-Blocking Calendar Integration
**Problem:** Complex work needs dedicated time blocks.
**Solution:** Drag task to calendar to create time block.
**Implementation:** Google/Apple Calendar integration.

---

## Anti-Patterns to Avoid

Based on community feedback, these features should be avoided or handled carefully:

### ❌ Auto-Completing Tasks
> "The more [AI] tried to auto-complete or suggest next steps, the worse the experience got. 99% of the time, it was wrong."

**Lesson:** AI should help users think, not think for them.

### ❌ Over-Complex Hierarchy
> "Keep your projects flat (no hierarchy) you'll avoid the organizational nightmare."

**Lesson:** Keep structure simple. Don't add sub-sub-projects.

### ❌ Too Many Contexts
> "If you have 50 tags in your agenda section, it's hard to build muscle memory."

**Lesson:** Recommend 8-12 contexts max. Offer presets but let users customize.

### ❌ Rigid Calendar Enforcement
> "The calendar is sacred territory."

**Lesson:** Don't force users to schedule tasks. Keep calendar for true appointments.

---

## Tutorial Content Ideas

Based on common struggles in the community:

### Onboarding Tutorials
1. **"What is a Next Action?"** — Interactive example clarifying vague → concrete
2. **"The 2-Minute Rule"** — Quick training during inbox processing
3. **"Projects vs Tasks"** — Visual explanation of the difference
4. **"Your First Weekly Review"** — Guided checklist walkthrough

### In-App Tooltips
- On empty project: "Every project needs a next action"
- On stale task: "This task is 2 weeks old. Still relevant?"
- On large checklist: "Consider 'Focus Mode' for working through this list"

### Help Articles
- How to break down big tasks
- Using energy contexts for better productivity
- The Weekly Review: Your secret weapon
- GTD for ADHD: Practical adaptations

---

## Summary: What's Already Done vs. Planned

| Feature                         | Status    |
| ------------------------------- | --------- |
| Task Age Indicators             | ✅ Done    |
| Energy-Based Contexts           | ✅ Done    |
| Today's Focus (Daily Dashboard) | ✅ Done    |
| Board View with Drag/Drop       | ✅ Done    |
| Sequential Task Mode            | ✅ Done    |
| Time Estimates                  | ✅ Done    |
| Project Support Notes           | ✅ Done    |
| Global Search                   | ✅ Done    |
| Person-Based Quick Search       | 📋 Planned |
| AI Clarifying Assistant         | 💭 Future  |
| Gamification                    | 💭 Future  |

---

*These ideas are derived from real user pain points in the GTD community. Prioritize features that reduce friction and maintain simplicity.*
