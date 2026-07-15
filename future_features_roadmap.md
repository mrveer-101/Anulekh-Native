# 🚀 Anulekh future features roadmap & specifications

This document outlines the upcoming features and technical improvements planned for the Anulekh student-scribe matching platform. These enhancements aim to optimize matching efficiency, safeguard user privacy, and streamline the onboarding/booking user experience.

---

## 📅 1. Exam Scheduling & Booking

### 🧬 Multiple Subject requests
* **Feature:** Bulk Exam Creation.
* **Specification:** Allows candidates to input multiple exam subjects, dates, and venues in a single request flow. The backend processes this submission and splits them into individual request entries so scribes can apply for specific exams.
* **Benefits:** Reduces form completion fatigue for students sitting multiple semester exams.

### 📅 Scribe Time Slot Preferences
* **Feature:** Availability Windows (Morning, Afternoon, Evening).
* **Specification:** Scribes can specify their preferred daily shifts (e.g., Morning: 8 AM–12 PM, Noon: 12 PM–4 PM, Evening: 4 PM–8 PM) in their profile. Matches are suggested based on these windows.
* **Benefits:** Scribes don't have to share detailed schedules; matching remains simple and flexible.

### 🎟️ Pre-Booking Slots
* **Feature:** Advance Scribe Reservations.
* **Specification:** Students can reserve/pre-book scribe availability schedules before official hall tickets are published. Supports both individual testing slots and multi-exam bookings.
* **Benefits:** Secures volunteers early in the academic season.

---

## 🔒 2. Privacy, Safety & Communications

### 🕒 Time-Restricted calling
* **Feature:** Exam-Day Only Contacts.
* **Specification:** The Call option inside the chat page is locked and remains hidden until the day of the exam. The button is deactivated immediately after the exam ends.
* **Benefits:** Prevents off-hours calling, harassment, and secures personal boundaries.

### 🙈 Review & Rating Privacy
* **Feature:** Numerical-Only Public Reviews.
* **Specification:** Written qualitative review remarks (from past matches) are visible only to the candidate in their dashboard. Scribes' public profiles display only the average star rating (e.g., ⭐ 4.8).
* **Benefits:** Protects volunteer privacy while keeping matching criteria transparent.

### 🚨 SOS Emergency Scribe Broadcast
* **Feature:** Last-Minute SOS Request.
* **Specification:** An emergency broadcast system for last-minute cancellations (within 12-24 hours). Broadcasts high-priority alerts with push notifications to all registered scribes within a 5km radius.
* **Benefits:** Quickly resolves critical cancellations on short notice.

---

## 🎨 3. Rich Content & AI Integration

### 🎙️ Voice-Enabled Notes & Guidelines
* **Feature:** Audio Request Notes.
* **Specification:** Students can record a brief audio message detailing special instructions or special assistance needs. Includes updated terms, conditions, and scribe conduct guidelines.
* **Benefits:** Assists students with visual or physical impairments.

### 📄 AI PDF Hall Ticket Analysis
* **Feature:** Auto-Fill request creation.
* **Specification:** Students upload their official hall ticket PDF. The app auto-extracts exam details (subject, date, time, venue) using document parser API to instantly generate requests.
* **Benefits:** Simplifies request creation and eliminates typos.

---

## 📚 4. Domain matching & Personal Connections

### 🧪 Subject Domain Scribe Profiles
* **Feature:** Domain-Specific Entries.
* **Specification:** Scribes can declare academic strengths (e.g. Science, Mathematics, Commerce). Students can filter scribes whose background fits the subject domain of the exam.
* **Benefits:** Ensures scribes are familiar with subject terminology.

### 🤝 Direct Invites (Preferred Scribes)
* **Feature:** Past Experience Connections.
* **Specification:** Candidates can invite specific scribes directly, prioritizing volunteers they had positive past experiences with or whose profiles they favor.
* **Benefits:** Builds trust and long-term volunteer relationships.

---

## ⚙️ 5. Matching & Recommendation Algorithm Rules

### 🏛️ Government Exam Scribe Eligibility Constraint (State & Central)
* **Rule Specification:** For all government exam types (both **State-level** and **Central-level** exams), the recommendation algorithm must enforce the following strict criteria:
  - Scribe education level must be **Undergraduate (UG) level** or below.
  - Scribe age must be **below 21 years**.
* **Rationale:** Complies with official exam board policies and guidelines for academic support volunteers in government examinations.

---
