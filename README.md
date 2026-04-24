# Memory-Mirror

Memory-Mirror is a private, completely local, and modular web application designed as a cognitive support tool. Using real-time facial recognition, it helps individuals with memory impairments or prosopagnosia (face blindness) identify people in their environment. The app overlays gentle, highly-translucent floating cards next to recognized faces, providing their name, relationship, a personalized memory prompt, and when they were last seen.

## 🌟 Key Features

* **Real-Time Facial Recognition**: Utilizes `face-api.js` to detect and match faces seamlessly directly in your browser.
* **Privacy First (100% Local)**: All facial data, metadata, and logic are processed locally on the device and securely stored in the browser's `localStorage`. No data is ever sent to a remote server.
* **Accessible Design**: Features both a beautiful Dark Mode and a clean Light Mode, easily switchable via an intuitive icon toggle in the header.
* **Dynamic Memory Management**: 
  * Add people via live webcam scan (5-frame capture) or **bypass the camera entirely by uploading a clear photo**.
  * Complete editing capabilities. Change notes, memory prompts, and names seamlessly on the fly.
  * *Smart Relationships*: Type in custom relationships (e.g. "Colleague" or "Mailman"). The system learns them and permanently adds them to your dropdown for future use.
* **Intelligent Workflows**: 
  * *Drag & Drop Analysis*: Drag any photo onto the browser window. The system instantly analyzes it and tells you who it is, or provides a 1-click flow to add them to your memories.
  * *Batch Processing & Automated Queue*: Select multiple photos at once in the side panel. The AI mathematically groups unknown faces across the photos and drops you into a streamlined queue asking you to name them sequentially without tedious clicking.
* **High-Performance UI**: A scalable, compact management side-panel featuring instant search/filtering, alphabetical sorting, sticky headers, and space-saving icon-based actions.

## ✨ UI/UX Improvements

* **Premium "Pill" UI**: A modernized, de-cluttered interface featuring a compact "Brand Pill" for the title and live indicator, and an animated "Status Pill" that smoothly slides up from the bottom-center to communicate system states without obscuring the camera view.
* **Cognitive-First Memory Cards**: Re-engineered the floating memory cards based on cognitive support best practices. The person's name is rendered as the most prominent element, directly followed by their relationship and memory prompt, entirely removing redundant avatars to maintain a perfectly clean interface.
* **Vibrant Orange Theme**: A meticulously crafted high-contrast orange theme (`#e67e22`) designed to be accessible, warm, and visually striking in both Light and Dark modes.
* **Refined Typography & Spacing**: The management side panel features elegant, scaled-down typography, seamlessly aligned sticky headers, and custom-styled native form elements (like custom chevron dropdowns and theme-matched text selection) for a truly native application feel.
* **Toast Notifications**: System feedback uses a polished slide-in toast system. Replaces all jarring browser `alert()` dialogs.
* **Custom Modals**: Deleting a memory or reviewing faces opens a beautiful in-app modal, replacing the plain browser `confirm()` dialogs.
* **Face Scan Progress Ring**: An animated SVG ring appears during live face enrollment, smoothly filling as each of the 5 required samples is captured.
* **Better Empty States**: The memory list shows a contextual illustration and message — 🧠 "No memories saved yet" on first launch, and 🔍 "No results found" when a search has no matches.

## 🛠 Tech Stack

* **HTML5 / Vanilla CSS3 / Vanilla JavaScript**: Clean, framework-free modular architecture.
* **face-api.js**: For underlying tensor operations and facial feature extraction models.
* **CSS Variables**: Enabling seamless, instant theme switching and frosted glass UI elements.

## 📁 File Structure

* `index.html` - Core markup, semantic tags, and UI layout.
* `style.css` - Extensive styling rules, frosted glassmorphism cards, light/dark themes, custom scrollbars, and animations.
* `app.js` - Logic handling webcam feeds, face detection loops, DB operations, photo uploads, and dynamic UI interactions.

## 🚀 Setup & Usage

Because the app requires secure contexts to access the webcam (`getUserMedia`) and fetch operations to load AI models via CDN, opening the HTML directly via `file://` protocol will be blocked by most modern browsers. **You must serve it via a local web server.**

### Quick Start
1. Open a terminal in the project directory.
2. Run a local development server. For example, using Python:
   ```bash
   python -m http.server 8000
   ```
   Or using Node.js:
   ```bash
   npx serve .
   ```
3. Open your browser and navigate to `http://localhost:8000` (or whichever port your server specifies).
4. Grant the browser permission to access your camera when prompted.

## 📝 How to Use

1. **Initial View**: Sit in front of the camera. The app will detect faces and box them in a soft glow. 
2. **Adding People**: Click the "Manage Memories" button on the top right, then click **"+ Add New Person"**. You can either wait for the camera to scan the person in view, or simply upload a portrait photo of them. Fill out their details and click Save.
3. **Recognizing**: Once a saved person enters the frame, their face bounding box will turn green, and a floating memory card will smoothly follow their movements, displaying your notes.
4. **Managing**: Use the side panel to instantly search through hundreds of memories, edit profiles, or safely delete outdated ones.
