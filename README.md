# Memory Mirror

Memory Mirror is a cognitive support tool for people living with memory impairments or face blindness. Point a webcam at the room and the app quietly identifies the people in front of you — floating a soft card beside each face with their name, your relationship to them, a personal note you wrote, and the last time you saw them. Everything runs locally in the browser. Nothing leaves the device.

---

## What it does

**Live recognition.** The camera runs continuously. When a known face enters the frame, a translucent card appears beside it — no tapping, no searching. The card fades away when the person leaves.

**Memory prompts.** Each person has a short note attached: a reminder of something important about them, a recent conversation, or anything that helps orient you in the moment. A speaker button reads the note aloud.

**Face Blind Mode.** A toggle replaces the camera feed with a painterly pointillist effect — faces become impressionistic colour patterns rather than identifiable images. Useful for carers or family members setting up the app without the user feeling watched.

**Memory management.** A slide-in panel lets you add, edit, and remove people. You can enroll someone by letting the camera scan them live, uploading a photo, or dropping a photo directly onto the page. A batch mode accepts multiple photos at once, groups faces it finds across them, and walks you through naming each one in a queue.

**Export and import.** The full database — face data, photos, names, notes — exports as a single file. Import it on another device to pick up exactly where you left off. Merge with existing data or replace it entirely.

---

## Design

The interface is built around one principle: when you need it, it should already be there.

The camera view fills the entire screen with nothing in the way. Controls live in a frosted pill in the top corners and disappear visually into the background when not needed. Memory cards are positioned dynamically beside each detected face, connected by a faint dashed line, and sized to keep the name large and the note readable at a distance.

The colour system is warm orange on near-black — high contrast, low aggression. A full light mode is available for bright rooms. The theme switch is a single tap.

The side panel slides in from the right. Forms adapt their language to context: the photo field says "Enroll via Photo" when adding someone new and "Update Photo" when editing an existing profile. Opening the add or edit form from the list shows a back button so you never have to close the panel to get back. Toasts slide in from the right edge and automatically shift left when the panel is open so they never cover it.

Every button, input, and card follows a consistent radius scale: 10px for form controls and action buttons, 30px for floating pill-shaped buttons, full circles for icon buttons. Hover states on subtle buttons stay subtle — the accent glow is reserved for primary actions only.

---

## How to use

1. Open the app and allow camera access.
2. Sit in front of the camera. Any face the app doesn't know shows an "Unknown Person" card with an option to add them.
3. Click **Manage** in the top right to open the memory panel.
4. Click **+ Add Person** — either let the camera capture the person in frame (it collects 5 samples automatically) or upload a photo. Fill in their name, relationship, and a memory prompt, then save.
5. Recognized faces now display their card automatically whenever they appear on camera.
6. To move your data to another device: open **Manage**, click **⬆ Export**, then on the new device click **⬇ Import** and choose Merge or Replace.

---

## Tech stack

- **Vanilla HTML, CSS, and JavaScript** — no frameworks, no build step
- **face-api.js** — in-browser face detection and recognition using pre-trained neural network weights
- **localStorage** — all data persists locally in the browser with no server or account required
- **CSS custom properties** — powers the light/dark theme switch and the frosted glass surfaces throughout the UI
