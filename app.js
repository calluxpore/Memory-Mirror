let memoryDB = [];
let faceMatcher = null;
let isDetecting = false;
window.isDetectionEnabled = true;
let isEnrollmentMode = false;
let enrollmentSamples = [];
let capturedAvatar = null;
let reviewQueue = [];

function showToast(message, type = 'info', duration = 3800) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 400);
  }, duration);
}

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay-canvas');
const uiLayer = document.getElementById('ui-layer');

const activeCards = {};
const usedKeys = new Set();
const lastLogged = {};
let lastFaceDetectedTime = Date.now();

// Theme setup
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  const toggleBtn = document.getElementById('theme-toggle');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    if(toggleBtn) toggleBtn.innerText = '🌙';
  } else {
    if(toggleBtn) toggleBtn.innerText = '☀️';
  }
});

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('analysis-modal');
    const panel = document.getElementById('side-panel');
    if (modal.style.display !== 'none') {
      closeAnalysisModal();
    } else if (panel.classList.contains('open')) {
      closeSidePanel();
    }
  }
});

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').innerText = isLight ? '🌙' : '☀️';
}

function updatePersistentStatus(msg, spinning = false) {
  // Removed per user request
}

function loadDB() {
  const data = localStorage.getItem("memoryMirrorDB");
  if (data) {
    try {
      const parsed = JSON.parse(data);
      memoryDB = parsed.map(person => ({
        ...person,
        faceDescriptors: person.faceDescriptors ? person.faceDescriptors.map(desc => new Float32Array(desc)) : []
      }));
    } catch(e) { console.error("Failed to parse DB", e); }
  } else {
    memoryDB = [
      {
        id: crypto.randomUUID(),
        name: "Sarah",
        relationship: "Daughter",
        memoryPrompt: "Sarah visits every Tuesday and loves chamomile tea.",
        lastInteraction: new Date().toISOString(),
        interactionNote: "Demo profile",
        faceDescriptors: [],
        addedAt: new Date().toISOString(),
        avatar: null
      }
    ];
    saveDB();
  }
}

function saveDB() {
  const toSave = memoryDB.map(person => ({
    ...person,
    faceDescriptors: person.faceDescriptors ? person.faceDescriptors.map(desc => Array.from(desc)) : []
  }));
  localStorage.setItem("memoryMirrorDB", JSON.stringify(toSave));
}

function updateFaceMatcher() {
  const labeledDescriptors = memoryDB
    .filter(p => p.faceDescriptors && p.faceDescriptors.length > 0)
    .map(p => new faceapi.LabeledFaceDescriptors(p.id, p.faceDescriptors));

  if (labeledDescriptors.length > 0) {
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
  } else {
    faceMatcher = null;
  }
}

const WEIGHTS_URLS = [
  'https://cdn.jsdelivr.net/npm/face-api.js/weights/',
  'https://justadudewhohacks.github.io/face-api.js/models',
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'
];

async function loadModels() {
  updatePersistentStatus("Loading AI Models...", true);
  for (const url of WEIGHTS_URLS) {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(url);
      await faceapi.nets.faceLandmark68Net.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
      console.log("Successfully loaded models from", url);
      return;
    } catch(e) {
      console.warn("Failed to load from", url, e.message);
    }
  }
  throw new Error("Could not load face-api models.");
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" } 
    });
    video.srcObject = stream;
    
    video.addEventListener('loadedmetadata', () => {
      video.play();
      resizeVideo();
      
      const dot = document.getElementById('camera-status-dot');
      if (dot) {
          dot.style.backgroundColor = '#2ea043';
          dot.style.boxShadow = '0 0 10px #2ea043';
      }
      
      updatePersistentStatus("Looking for familiar faces...");
      isDetecting = true;
      setTimeout(detectLoop, 500); 
    });
    
    window.addEventListener('resize', resizeVideo);
    
  } catch (err) {
    console.error(err);
    const dot = document.getElementById('camera-status-dot');
    if (dot) {
        dot.style.backgroundColor = '#dc3545';
        dot.style.boxShadow = 'none';
    }
    updatePersistentStatus("Error accessing camera.");
  }
}

function resizeVideo() {
  if (!video.videoWidth) return;
  const videoRatio = video.videoWidth / video.videoHeight;
  const windowRatio = window.innerWidth / window.innerHeight;

  if (windowRatio < videoRatio) {
    video.style.height = '100vh';
    video.style.width = (100 * videoRatio) + 'vh';
  } else {
    video.style.width = '100vw';
    video.style.height = (100 / videoRatio) + 'vw';
  }
  
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  canvas.style.width = video.style.width;
  canvas.style.height = video.style.height;

  const pCanvas = document.getElementById('pointillism-canvas');
  if (pCanvas) {
    pCanvas.width = video.clientWidth;
    pCanvas.height = video.clientHeight;
    pCanvas.style.width = video.style.width;
    pCanvas.style.height = video.style.height;
  }
}

function getFaceCrop(box, sourceEl) {
    const pad = 30;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    
    const srcWidth = sourceEl.videoWidth || sourceEl.width || sourceEl.naturalWidth;
    const srcHeight = sourceEl.videoHeight || sourceEl.height || sourceEl.naturalHeight;
    
    const w = Math.min(srcWidth - x, box.width + pad * 2);
    const h = Math.min(srcHeight - y, box.height + pad * 2);
    
    if (w <= 0 || h <= 0) return null;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 120;
    cropCanvas.height = 120;
    const ctx = cropCanvas.getContext('2d');
    
    ctx.drawImage(sourceEl, x, y, w, h, 0, 0, 120, 120);
    return cropCanvas.toDataURL('image/jpeg', 0.6);
}

async function detectLoop() {
  if (!isDetecting || !video || video.paused || video.ended) return;

  if (!window.isDetectionEnabled) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    usedKeys.clear();
    cleanupUI();
    setTimeout(detectLoop, 600);
    return;
  }

  try {
    const detections = await faceapi.detectAllFaces(video, new faceapi.SsdMobilenetv1Options())
                                    .withFaceLandmarks()
                                    .withFaceDescriptors();

    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    if(canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
        faceapi.matchDimensions(canvas, displaySize);
    }
    
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    usedKeys.clear();

    if (isEnrollmentMode) {
      if (resizedDetections.length > 0) {
        const det = resizedDetections[0];
        enrollmentSamples.push(det.descriptor);

        if (enrollmentSamples.length === 1 && !capturedAvatar) {
           capturedAvatar = getFaceCrop(det.detection.box, video);
        }

        // Update scan progress ring
        const scanCount = enrollmentSamples.length;
        const scanProgressEl = document.getElementById('scan-progress');
        const scanCircle = document.getElementById('scan-ring-circle');
        const scanCountText = document.getElementById('scan-count-text');
        scanProgressEl.style.display = 'flex';
        if (scanCountText) scanCountText.innerHTML = `${scanCount}<small>/5</small>`;
        if (scanCircle) scanCircle.style.strokeDashoffset = String(175.93 * (1 - scanCount / 5));

        updatePersistentStatus(`Scanning face... ${scanCount}/5`);
        drawGlowBox(ctx, det.detection.box, '#f39c12');

        if (enrollmentSamples.length >= 5) {
          isEnrollmentMode = false;
          document.getElementById('scan-progress').style.display = 'none';
          updatePersistentStatus("Scan complete. Please fill in details.");

          if (!document.getElementById('side-panel').classList.contains('open')) {
            window.showEnrollmentForm();
          } else {
            showToast('Face captured! Fill in the details and save.', 'success');
          }
        }
      } else {
        updatePersistentStatus("No face detected. Look at the camera.");
      }
    } else {
      document.getElementById('scan-progress').style.display = 'none';
      let recognizedNames = [];

      resizedDetections.forEach((det, index) => {
        let match = null;
        let distance = 1;

        if (faceMatcher) {
          const result = faceMatcher.findBestMatch(det.descriptor);
          if (result.label !== 'unknown') {
            match = memoryDB.find(p => p.id === result.label);
            distance = result.distance;
          }
        }

        drawGlowBox(ctx, det.detection.box, match ? '#e67e22' : '#f39c12');

        const videoRect = video.getBoundingClientRect();
        const flippedX = videoRect.width - (det.detection.box.x + det.detection.box.width / 2);
        const faceCX = videoRect.left + flippedX;
        const faceCY = videoRect.top + det.detection.box.y + det.detection.box.height / 2;

        if (match) {
          recognizedNames.push(match.name);
          updateMemoryCard(match, faceCX, faceCY, det.detection.box, distance);
          logInteraction(match.id);
          if (!match.avatar) {
              match.avatar = getFaceCrop(det.detection.box, video);
              saveDB();
              if (document.getElementById('side-panel').classList.contains('open') && 
                  document.getElementById('management-list-container').style.display !== 'none') {
                  renderMemoryList();
              }
          }
        } else {
          updateUnknownCard(faceCX, faceCY, det.detection.box, index);
        }
      });

      if (recognizedNames.length > 0) {
        updatePersistentStatus(`Recognized: ${recognizedNames.join(', ')}`);
        lastFaceDetectedTime = Date.now();
      } else if (resizedDetections.length > 0) {
        updatePersistentStatus("Analyzing face...", true);
        lastFaceDetectedTime = Date.now();
      } else if (Date.now() - lastFaceDetectedTime > 3000) {
        updatePersistentStatus("Looking for familiar faces...");
      }
    }
    
    cleanupUI();
  } catch (error) {
    console.error("Detection error:", error);
  }

  setTimeout(detectLoop, 600);
}

function drawGlowBox(ctx, box, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  
  ctx.globalAlpha = 0.5;

  const length = 20; 
  const r = 8; 
  const { x, y, width: w, height: h } = box;

  ctx.beginPath();
  ctx.moveTo(x, y + length);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + length, y);
  
  ctx.moveTo(x + w - length, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + length);

  ctx.moveTo(x + w, y + h - length);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + w - length, y + h);

  ctx.moveTo(x + length, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + h - length);

  ctx.stroke();
  ctx.globalAlpha = 1.0;
}

function drawConnector(cardX, cardY, cardW, cardH, faceCX, faceCY, isMatch) {
  const ctx = canvas.getContext('2d');
  
  let anchorX = cardX > faceCX ? cardX : cardX + cardW;
  let anchorY = cardY + cardH / 2;

  ctx.beginPath();
  ctx.moveTo(faceCX, faceCY);
  ctx.lineTo(anchorX, anchorY);
  ctx.strokeStyle = isMatch ? '#e67e22' : '#f39c12';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
}

function adjustCardPosition(faceCX, faceCY, boxW, cardW, cardH) {
  const padding = 60;
  let cardX, cardY;

  if (faceCX > window.innerWidth / 2) {
     cardX = faceCX - (boxW/2) - cardW - padding;
  } else {
     cardX = faceCX + (boxW/2) + padding;
  }
  
  cardY = faceCY - (cardH/2);
  
  if(cardX < 20) cardX = 20;
  if(cardX + cardW > window.innerWidth - 20) cardX = window.innerWidth - cardW - 20;
  if(cardY < 120) cardY = 120; 
  if(cardY + cardH > window.innerHeight - 20) cardY = window.innerHeight - cardH - 20;

  return { x: cardX, y: cardY };
}

window.speakMemory = function(text) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

function updateMemoryCard(person, faceCX, faceCY, box, distance) {
  const key = `known_${person.id}`;
  usedKeys.add(key);

  let confClass = "conf-low";
  let confText = "Possible Match";
  if (distance < 0.35) { confClass = "conf-high"; confText = "Certain"; }
  else if (distance < 0.45) { confClass = "conf-med"; confText = "Likely"; }

  let card = activeCards[key];
  if (!card) {
    const el = document.createElement('div');
    el.className = 'memory-card visible';
    
    let dateStr = "Recently";
    if (person.lastInteraction) {
        const lastSeenDate = new Date(person.lastInteraction);
        dateStr = lastSeenDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
    
    const promptText = person.memoryPrompt || 'I recognize this person, but I have no memory prompt saved.';
    const escapedPrompt = promptText.replace(/'/g, "\\'");

    el.innerHTML = `
      <div class="card-header" style="margin-bottom:16px; padding-top:0; border-top:none; align-items:flex-start;">
        <div class="name-role">
          <h2 style="font-size:28px; margin:0 0 2px 0;">${person.name}</h2>
          <div style="display:flex; align-items:center; gap:8px;">
            <p style="margin:0;">${person.relationship}</p>
            <span class="confidence-badge ${confClass}">${confText}</span>
          </div>
        </div>
      </div>
      <div class="memory-prompt">
        "${promptText}"
      </div>
      <div class="last-seen">Last seen: ${dateStr}</div>
      <button class="btn-tts" onclick="window.speakMemory('${escapedPrompt}')" title="Read Aloud" aria-label="Read Aloud" style="top:24px; right:24px;">🔊</button>
    `;
    uiLayer.appendChild(el);
    card = { el, width: 360, height: 220 };
    activeCards[key] = card;
  } else {
    if(card.timeout) { clearTimeout(card.timeout); card.timeout = null; }
    card.el.classList.add('visible');
    const badge = card.el.querySelector('.confidence-badge');
    if(badge) {
        badge.className = `confidence-badge ${confClass}`;
        badge.innerText = confText;
    }
  }

  const rect = card.el.getBoundingClientRect();
  card.width = rect.width || 360;
  card.height = rect.height || 220;

  const pos = adjustCardPosition(faceCX, faceCY, box.width, card.width, card.height);
  card.el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  
  drawConnector(pos.x, pos.y, card.width, card.height, faceCX, faceCY, true);
}

function updateUnknownCard(faceCX, faceCY, box, index) {
  const key = `unknown_${index}`;
  usedKeys.add(key);

  let card = activeCards[key];
  if (!card) {
    const el = document.createElement('div');
    el.className = 'memory-card unknown-card visible';
    el.innerHTML = `
      <h2>Unknown Person</h2>
      <button class="btn-primary" onclick="startEnrollment()" ontouchend="startEnrollment(); event.preventDefault();">Add to Memory</button>
    `;
    uiLayer.appendChild(el);
    card = { el, width: 260, height: 160 };
    activeCards[key] = card;
  } else {
    if(card.timeout) { clearTimeout(card.timeout); card.timeout = null; }
    card.el.classList.add('visible');
  }

  const pos = adjustCardPosition(faceCX, faceCY, box.width, card.width, card.height);
  card.el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  
  drawConnector(pos.x, pos.y, card.width, card.height, faceCX, faceCY, false);
}

function cleanupUI() {
  Object.keys(activeCards).forEach(key => {
    if (!usedKeys.has(key)) {
      const card = activeCards[key];
      card.el.classList.remove('visible');
      if (!card.timeout) {
        card.timeout = setTimeout(() => {
          if (card.el.parentNode) card.el.parentNode.removeChild(card.el);
          delete activeCards[key];
        }, 400);
      }
    }
  });
}

function logInteraction(personId) {
  const now = new Date();
  if (lastLogged[personId] && (now - lastLogged[personId]) < 300000) return; 
  lastLogged[personId] = now;

  const person = memoryDB.find(p => p.id === personId);
  if (person) {
    person.lastInteraction = now.toISOString();
    saveDB();
  }
}

window.startEnrollment = function() {
  enrollmentSamples = [];
  capturedAvatar = null;
  isEnrollmentMode = true;
  updatePersistentStatus("Look at the camera. Capturing face structure...");
}

window.startReTrain = function() {
  isEnrollmentMode = true;
  enrollmentSamples = [];
  capturedAvatar = null;
  updatePersistentStatus("Re-scanning face... Look at the camera.");
}

function updateRelationshipDropdown() {
  const select = document.getElementById('enroll-relationship');
  const currentVal = select.value;
  const standardOptions = ['Family', 'Friend', 'Caregiver', 'Doctor', 'Other'];
  
  const dbRelationships = new Set();
  memoryDB.forEach(p => {
    if (p.relationship && !standardOptions.includes(p.relationship)) {
      dbRelationships.add(p.relationship);
    }
  });
  
  let html = '';
  standardOptions.forEach(opt => html += `<option value="${opt}">${opt}</option>`);
  if (dbRelationships.size > 0) {
    html += `<optgroup label="Custom Options">`;
    dbRelationships.forEach(opt => html += `<option value="${opt}">${opt}</option>`);
    html += `</optgroup>`;
  }
  html += `<option value="custom">+ Add Custom...</option>`;
  select.innerHTML = html;
  
  if (currentVal && (standardOptions.includes(currentVal) || dbRelationships.has(currentVal) || currentVal === 'custom')) {
      select.value = currentVal;
  } else {
      select.value = 'Family';
  }
}

window.backToManageList = function() {
  manageMemories();
}

function setPhotoUploadContext(mode) {
  const label = document.getElementById('photo-upload-label');
  const hint = document.getElementById('photo-upload-hint');
  if (mode === 'edit') {
    label.textContent = 'Update Photo (Optional)';
    hint.textContent = 'Upload a new photo to update this person\'s profile picture.';
  } else {
    label.textContent = 'Enroll via Photo (Optional)';
    hint.textContent = 'Uploading a clear photo overrides live camera scanning.';
  }
}

window.openManualEnrollment = function() {
  isEnrollmentMode = false;
  enrollmentSamples = [];
  capturedAvatar = null;
  document.getElementById('scan-progress').style.display = 'none';
  updateRelationshipDropdown();

  const panel = document.getElementById('side-panel');
  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('panel-title').innerText = "Add to Memory";
  document.getElementById('enrollment-form-container').style.display = 'block';
  document.getElementById('management-list-container').style.display = 'none';
  document.getElementById('back-to-list-btn').style.display = 'block';
  document.getElementById('scan-face-group').style.display = 'block';
  setPhotoUploadContext('add');

  document.getElementById('enroll-id').value = '';
  document.getElementById('enroll-name').value = '';
  document.getElementById('enroll-relationship').value = 'Family';
  document.getElementById('enroll-relationship-custom').style.display = 'none';
  document.getElementById('enroll-relationship-custom').value = '';
  document.getElementById('enroll-prompt').value = '';
  document.getElementById('enroll-note').value = '';
  document.getElementById('enroll-photo').value = '';
  document.getElementById('photo-preview-container').style.display = 'none';
  document.getElementById('rescan-group').style.display = 'none';
}

window.showEnrollmentForm = function() {
  updateRelationshipDropdown();
  const panel = document.getElementById('side-panel');
  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('panel-title').innerText = "Add to Memory";
  document.getElementById('enrollment-form-container').style.display = 'block';
  document.getElementById('management-list-container').style.display = 'none';
  document.getElementById('back-to-list-btn').style.display = 'none';
  document.getElementById('rescan-group').style.display = 'none';
  document.getElementById('scan-face-group').style.display = 'none';
  setPhotoUploadContext('add');

  document.getElementById('enroll-id').value = '';
  document.getElementById('enroll-name').value = '';
  document.getElementById('enroll-relationship').value = 'Family';
  document.getElementById('enroll-relationship-custom').style.display = 'none';
  document.getElementById('enroll-relationship-custom').value = '';
  document.getElementById('enroll-prompt').value = '';
  document.getElementById('enroll-note').value = '';
  document.getElementById('enroll-photo').value = '';
  document.getElementById('photo-preview-container').style.display = 'none';
}

window.editMemory = function(id) {
  isEnrollmentMode = false;
  enrollmentSamples = [];
  capturedAvatar = null;
  document.getElementById('scan-progress').style.display = 'none';

  const person = memoryDB.find(p => p.id === id);
  if(!person) return;

  updateRelationshipDropdown();

  const panel = document.getElementById('side-panel');
  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('panel-title').innerText = "Edit Memory";
  document.getElementById('enrollment-form-container').style.display = 'block';
  document.getElementById('management-list-container').style.display = 'none';
  
  document.getElementById('back-to-list-btn').style.display = 'block';
  document.getElementById('scan-face-group').style.display = 'none';
  setPhotoUploadContext('edit');

  document.getElementById('enroll-id').value = person.id;
  document.getElementById('enroll-name').value = person.name;

  const select = document.getElementById('enroll-relationship');
  let optionExists = false;
  for(let i=0; i<select.options.length; i++) {
     if(select.options[i].value === person.relationship) {
         optionExists = true; break;
     }
  }

  if (optionExists) {
    select.value = person.relationship;
    document.getElementById('enroll-relationship-custom').style.display = 'none';
    document.getElementById('enroll-relationship-custom').value = '';
  } else {
    select.value = 'custom';
    document.getElementById('enroll-relationship-custom').style.display = 'block';
    document.getElementById('enroll-relationship-custom').value = person.relationship;
  }
  
  document.getElementById('enroll-prompt').value = person.memoryPrompt || '';
  document.getElementById('enroll-note').value = person.interactionNote || '';
  document.getElementById('enroll-photo').value = '';
  document.getElementById('photo-preview-container').style.display = 'none';
  
  document.getElementById('rescan-group').style.display = 'block';
}

window.handlePhotoUpload = async function(event) {
  const file = event.target.files[0];
  if(!file) return;

  const imgUrl = URL.createObjectURL(file);
  const imgEl = document.getElementById('photo-preview');
  const previewContainer = document.getElementById('photo-preview-container');
  const photoStatus = document.getElementById('photo-status');
  
  previewContainer.style.display = 'block';
  imgEl.src = imgUrl;
  photoStatus.innerText = "Analyzing...";
  photoStatus.style.display = "block";
  photoStatus.style.background = "rgba(0,0,0,0.7)";

  imgEl.onload = async () => {
    try {
      const detections = await faceapi.detectSingleFace(imgEl, new faceapi.SsdMobilenetv1Options())
                                      .withFaceLandmarks()
                                      .withFaceDescriptor();
      if(detections) {
        enrollmentSamples = [detections.descriptor];
        capturedAvatar = getFaceCrop(detections.detection.box, imgEl);
        
        photoStatus.innerText = "Face Detected!";
        photoStatus.style.background = "rgba(29, 158, 117, 0.8)";
        setTimeout(() => { photoStatus.style.display = 'none'; }, 2000);
      } else {
        photoStatus.innerText = "No face found in photo";
        photoStatus.style.background = "rgba(220, 53, 69, 0.8)";
        enrollmentSamples = [];
        capturedAvatar = null;
      }
    } catch(err) {
      console.error(err);
      photoStatus.innerText = "Error analyzing";
      photoStatus.style.background = "rgba(220, 53, 69, 0.8)";
      enrollmentSamples = [];
      capturedAvatar = null;
    }
  }
}

window.handleRelationshipChange = function() {
  const select = document.getElementById('enroll-relationship');
  const customInput = document.getElementById('enroll-relationship-custom');
  if (select.value === 'custom') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

window.closeSidePanel = function() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('visible');
  document.getElementById('scan-progress').style.display = 'none';
  isEnrollmentMode = false;
  enrollmentSamples = [];
  capturedAvatar = null;
  reviewQueue = [];
  updatePersistentStatus("Looking for familiar faces...");
}

window.saveEnrollment = function() {
  const editId = document.getElementById('enroll-id').value;
  const name = document.getElementById('enroll-name').value.trim();
  
  const relSelect = document.getElementById('enroll-relationship').value;
  let relationship = relSelect;
  if (relSelect === 'custom') {
    relationship = document.getElementById('enroll-relationship-custom').value.trim();
    if (!relationship) {
      showToast("Please enter a custom relationship.", 'error');
      return;
    }
  }

  const prompt = document.getElementById('enroll-prompt').value.trim();
  const note = document.getElementById('enroll-note').value.trim();

  if (!name) {
    showToast("Please enter a name.", 'error');
    document.getElementById('enroll-name').focus();
    return;
  }

  if (editId) {
    const person = memoryDB.find(p => p.id === editId);
    if(person) {
      person.name = name;
      person.relationship = relationship;
      person.memoryPrompt = prompt;
      person.interactionNote = note;
      if (enrollmentSamples.length > 0) {
          person.faceDescriptors = [...person.faceDescriptors, ...enrollmentSamples].slice(-15);
      }
      if (capturedAvatar) {
          person.avatar = capturedAvatar;
      }
    }
    updatePersistentStatus(`Successfully updated ${name}.`);
    showToast(`${name}'s memory updated.`, 'success');
  } else {
    if (enrollmentSamples.length === 0) {
        showToast("No face data found. Please wait for the camera scan or upload a clear photo.", 'error');
        return;
    }
    const person = {
      id: crypto.randomUUID(),
      name,
      relationship,
      memoryPrompt: prompt,
      lastInteraction: new Date().toISOString(),
      interactionNote: note,
      faceDescriptors: enrollmentSamples, 
      addedAt: new Date().toISOString(),
      avatar: capturedAvatar
    };
    memoryDB.push(person);
    updatePersistentStatus(`Successfully added ${name} to memory.`);
    showToast(`${name} added to memory!`, 'success');
  }

  saveDB();
  updateFaceMatcher();
  
  if (reviewQueue.length > 0) {
      processReviewQueue();
  } else if (editId) {
     manageMemories(); 
  } else {
     closeSidePanel();
  }
}

window.manageMemories = function() {
  isEnrollmentMode = false;
  reviewQueue = [];
  document.getElementById('side-panel').classList.add('open');
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('panel-title').innerText = "Manage Memories";
  document.getElementById('enrollment-form-container').style.display = 'none';
  document.getElementById('management-list-container').style.display = 'flex';
  
  const searchInput = document.getElementById('memory-search');
  if (searchInput) searchInput.value = '';
  
  renderMemoryList();
}

window.renderMemoryList = function() {
  const list = document.getElementById('memory-list');
  list.innerHTML = '';
  
  const searchInput = document.getElementById('memory-search');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  
  const filtered = memoryDB.filter(p => {
    return p.name.toLowerCase().includes(query) || p.relationship.toLowerCase().includes(query);
  });
  
  if (filtered.length === 0) {
    const isEmpty = memoryDB.length === 0;
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${isEmpty ? '🧠' : '🔍'}</span>
        <p>${isEmpty ? 'No memories saved yet.' : 'No results found.'}</p>
        ${isEmpty ? '<small>Add your first person to get started.</small>' : ''}
      </div>
    `;
    return;
  }
  
  const groups = {};
  filtered.forEach(p => {
    const r = p.relationship || "Other";
    if(!groups[r]) groups[r] = [];
    groups[r].push(p);
  });
  
  Object.keys(groups).sort().forEach(rel => {
     const header = document.createElement('div');
     header.className = 'group-header';
     header.innerText = rel;
     list.appendChild(header);
     
     const sorted = groups[rel].sort((a,b) => a.name.localeCompare(b.name));
     
     sorted.forEach((person) => {
        const item = document.createElement('div');
        item.className = 'memory-list-item';
        
        let avatarHtml = `<div class="list-avatar">${person.name.charAt(0).toUpperCase()}</div>`;
        if (person.avatar) {
            avatarHtml = `<img src="${person.avatar}" class="list-avatar" alt="Avatar">`;
        }

        const promptSnippet = person.memoryPrompt ? `<p class="prompt-snippet">"${person.memoryPrompt}"</p>` : '';

        item.innerHTML = `
          ${avatarHtml}
          <div class="memory-list-info">
            <h3>${person.name}</h3>
            ${promptSnippet}
          </div>
          <div class="item-actions">
            <button class="btn-icon" aria-label="Edit" onclick="editMemory('${person.id}')" title="Edit">✎</button>
            <button class="btn-icon danger" aria-label="Remove" onclick="deleteMemory('${person.id}', '${person.name.replace(/'/g, "\\'")}')" title="Remove">🗑</button>
          </div>
        `;
        list.appendChild(item);
     });
  });
}

window.deleteMemory = function(id, name) {
  const modal = document.getElementById('analysis-modal');
  const body = document.getElementById('analysis-body');
  modal.style.display = 'flex';
  const safeName = (name || 'this person').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeId = id.replace(/['"]/g, '');
  body.innerHTML = `
    <div style="font-size:52px; margin-bottom:16px; line-height:1;">🗑</div>
    <h3 style="font-size:26px; margin:0 0 10px 0; color:var(--text-color);">Remove ${safeName}?</h3>
    <p style="color:var(--text-muted); margin-bottom:28px; line-height:1.5;">This will permanently erase their face data and memory from your database.</p>
    <button class="btn-primary" style="background:#ef4444; border-color:#ef4444; margin-bottom:12px;" onclick="confirmDeleteMemory('${safeId}')">Yes, Remove</button>
    <button class="btn-outline" style="width:100%;" onclick="closeAnalysisModal()">Cancel</button>
  `;
}

window.confirmDeleteMemory = function(id) {
  memoryDB = memoryDB.filter(p => p.id !== id);
  saveDB();
  updateFaceMatcher();
  closeAnalysisModal();
  renderMemoryList();
  showToast('Memory removed.', 'info');
}

window.onload = async () => {
  if (typeof faceapi === 'undefined') {
    updatePersistentStatus("Error: face-api.js failed to load.");
    return;
  }
  
  loadDB();
  updateFaceMatcher();
  
  try {
    await loadModels();
    await startCamera();
  } catch (e) {
    updatePersistentStatus("Error: " + e.message);
  }
};

let dropZoneTimeout;

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.getElementById('drop-zone').style.display = 'flex';
  clearTimeout(dropZoneTimeout);
  dropZoneTimeout = setTimeout(() => {
    document.getElementById('drop-zone').style.display = 'none';
  }, 300);
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.getElementById('drop-zone').style.display = 'none';
  
  if(e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if(!file.type.startsWith('image/')) {
        showToast("Please drop an image file.", 'error');
        return;
    }
    analyzeDroppedImage(file);
  }
});

async function analyzeDroppedImage(file) {
  const modal = document.getElementById('analysis-modal');
  const body = document.getElementById('analysis-body');
  modal.style.display = 'flex';
  
  body.innerHTML = `
    <div class="status-dot" style="width:16px; height:16px; margin: 0 auto 20px auto; background-color: var(--accent-color); box-shadow: 0 0 10px var(--accent-color);"></div>
    <h3 style="font-size:24px;">Analyzing Photo...</h3>
  `;
  
  const imgUrl = URL.createObjectURL(file);
  const imgEl = document.createElement('img');
  imgEl.src = imgUrl;
  
  imgEl.onload = async () => {
    try {
      const detection = await faceapi.detectSingleFace(imgEl, new faceapi.SsdMobilenetv1Options())
                                      .withFaceLandmarks()
                                      .withFaceDescriptor();
                                      
      if(!detection) {
        body.innerHTML = `
          <h3 style="font-size:24px; color:var(--text-color); margin-top:0;">No Face Detected</h3>
          <p style="color:var(--text-muted); margin-bottom:20px;">We couldn't clearly see a face in that image. Try another one.</p>
          <button class="btn-primary" onclick="closeAnalysisModal()">Okay</button>
        `;
        return;
      }
      
      let match = null;
      
      if(faceMatcher) {
        const result = faceMatcher.findBestMatch(detection.descriptor);
        if(result.label !== 'unknown') {
          match = memoryDB.find(p => p.id === result.label);
        }
      }
      
      const cropData = getFaceCrop(detection.detection.box, imgEl);
      const cropHtml = `<img src="${cropData}" style="width:90px; height:90px; border-radius:50%; object-fit:cover; margin-bottom:20px; border:2px solid var(--accent-color); box-shadow: 0 10px 20px rgba(0,0,0,0.3);">`;
      
      if(match) {
        body.innerHTML = `
          ${cropHtml}
          <h3 style="font-size:28px; margin:0 0 5px 0;">This is ${match.name}</h3>
          <p style="color:var(--accent-color); font-weight:bold; margin:0 0 20px 0; text-transform:uppercase; font-size:14px; letter-spacing:1px;">${match.relationship}</p>
          <div style="background:var(--input-bg); border:1px solid var(--input-border); border-radius:12px; padding:16px; margin-bottom:24px; text-align:left;">
            <p style="font-size:16px; margin:0; line-height:1.5;">"${match.memoryPrompt}"</p>
          </div>
          <button class="btn-outline" onclick="editMemory('${match.id}'); closeAnalysisModal();" style="width:100%; margin-bottom:12px;">Edit Profile</button>
          <button class="btn-primary" onclick="closeAnalysisModal()" style="margin-top:0;">Close</button>
        `;
      } else {
        window._pendingDropDescriptor = detection.descriptor;
        window._pendingDropAvatar = cropData;
        window._pendingDropFile = file;
        
        body.innerHTML = `
          ${cropHtml}
          <h3 style="font-size:26px; margin:0 0 10px 0;">Face Not Recognized</h3>
          <p style="color:var(--text-muted); margin-bottom:24px;">This person is not in your memory database.</p>
          <button class="btn-primary" onclick="enrollFromDrop()" style="margin-bottom:12px; margin-top:0;">Add to Memories</button>
          <button class="btn-outline" onclick="closeAnalysisModal()" style="width:100%;">Cancel</button>
        `;
      }
    } catch(err) {
      console.error(err);
      body.innerHTML = `
        <h3 style="font-size:24px; color:#ff7b8a; margin-top:0;">Analysis Error</h3>
        <p style="color:var(--text-muted); margin-bottom:20px;">Something went wrong while processing the image.</p>
        <button class="btn-primary" onclick="closeAnalysisModal()">Close</button>
      `;
    }
  };
}

window.closeAnalysisModal = function() {
  document.getElementById('analysis-modal').style.display = 'none';
  window._pendingDropDescriptor = null;
  window._pendingDropAvatar = null;
  window._pendingDropFile = null;
}

window.enrollFromDrop = function() {
  document.getElementById('analysis-modal').style.display = 'none';

  isEnrollmentMode = false;
  enrollmentSamples = [window._pendingDropDescriptor];
  capturedAvatar = window._pendingDropAvatar;

  updateRelationshipDropdown();

  const panel = document.getElementById('side-panel');
  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('visible');
  document.getElementById('panel-title').innerText = "Add to Memory";
  document.getElementById('enrollment-form-container').style.display = 'block';
  document.getElementById('management-list-container').style.display = 'none';
  
  document.getElementById('back-to-list-btn').style.display = 'none';
  document.getElementById('scan-face-group').style.display = 'none';
  setPhotoUploadContext('add');

  document.getElementById('enroll-id').value = '';
  document.getElementById('enroll-name').value = '';
  document.getElementById('enroll-relationship').value = 'Family';
  document.getElementById('enroll-relationship-custom').style.display = 'none';
  document.getElementById('enroll-relationship-custom').value = '';
  document.getElementById('enroll-prompt').value = '';
  document.getElementById('enroll-note').value = '';
  document.getElementById('rescan-group').style.display = 'none';

  const imgUrl = URL.createObjectURL(window._pendingDropFile);
  const imgEl = document.getElementById('photo-preview');
  const previewContainer = document.getElementById('photo-preview-container');
  const photoStatus = document.getElementById('photo-status');
  
  previewContainer.style.display = 'block';
  imgEl.src = imgUrl;
  photoStatus.innerText = "Extracted from drop";
  photoStatus.style.display = "block";
  photoStatus.style.background = "rgba(230, 126, 34, 0.8)";
  setTimeout(() => { photoStatus.style.display = 'none'; }, 2000);
}

window.handleBatchUpload = async function(event) {
  const files = event.target.files;
  if(!files || files.length === 0) return;
  
  const modal = document.getElementById('analysis-modal');
  const body = document.getElementById('analysis-body');
  modal.style.display = 'flex';
  
  body.innerHTML = `
    <div class="status-dot" style="width:16px; height:16px; margin: 0 auto 20px auto; background-color: var(--accent-color); box-shadow: 0 0 10px var(--accent-color);"></div>
    <h3 style="font-size:24px;">Analyzing Batch Photos...</h3>
    <p id="batch-progress" style="color:var(--text-muted);">Processing 0 / ${files.length} photos</p>
  `;
  
  let newGroups = []; 

  for(let i=0; i<files.length; i++) {
    const file = files[i];
    const progressEl = document.getElementById('batch-progress');
    if (progressEl) progressEl.innerText = `Processing photo ${i+1} of ${files.length}`;
    
    await new Promise((resolve) => {
       const imgUrl = URL.createObjectURL(file);
       const imgEl = document.createElement('img');
       imgEl.src = imgUrl;
       imgEl.onload = async () => {
          try {
            const detections = await faceapi.detectAllFaces(imgEl, new faceapi.SsdMobilenetv1Options())
                                            .withFaceLandmarks()
                                            .withFaceDescriptors();
            
            for(let det of detections) {
              let isKnown = false;
              if (faceMatcher) {
                 const result = faceMatcher.findBestMatch(det.descriptor);
                 if (result.label !== 'unknown') {
                    const person = memoryDB.find(p => p.id === result.label);
                    if(person) {
                       person.faceDescriptors = [...person.faceDescriptors, det.descriptor].slice(-15);
                    }
                    isKnown = true;
                 }
              }
              
              if (!isKnown) {
                 let matchedGroup = null;
                 for (let group of newGroups) {
                    const tempMatcher = new faceapi.FaceMatcher(
                        [new faceapi.LabeledFaceDescriptors('temp', group.faceDescriptors)], 
                        0.55
                    );
                    const res = tempMatcher.findBestMatch(det.descriptor);
                    if(res.label === 'temp') {
                        matchedGroup = group;
                        break;
                    }
                 }
                 
                 if (matchedGroup) {
                     matchedGroup.faceDescriptors.push(det.descriptor);
                 } else {
                     newGroups.push({
                        faceDescriptors: [det.descriptor],
                        avatar: getFaceCrop(det.detection.box, imgEl)
                     });
                 }
              }
            }
          } catch(err) { console.error("Error processing file", file.name, err); }
          URL.revokeObjectURL(imgUrl);
          resolve();
       };
       imgEl.onerror = () => { URL.revokeObjectURL(imgUrl); resolve(); };
    });
  }
  
  saveDB(); 
  updateFaceMatcher();
  
  if (newGroups.length === 0) {
    body.innerHTML = `
      <h3 style="font-size:24px; color:var(--text-color); margin-top:0;">Batch Complete</h3>
      <p style="color:var(--text-muted); margin-bottom:20px;">No new unknown faces were found. Existing profiles were updated.</p>
      <button class="btn-primary" onclick="closeAnalysisModal(); manageMemories();">Okay</button>
    `;
    return;
  }
  
  reviewQueue = [];
  newGroups.forEach((group, index) => {
     const newPerson = {
        id: crypto.randomUUID(),
        name: `New Person ${index + 1}`,
        relationship: 'Other',
        memoryPrompt: '',
        lastInteraction: new Date().toISOString(),
        interactionNote: 'Found in batch upload',
        faceDescriptors: group.faceDescriptors,
        addedAt: new Date().toISOString(),
        avatar: group.avatar
     };
     memoryDB.push(newPerson);
     reviewQueue.push(newPerson.id);
  });
  
  saveDB();
  updateFaceMatcher();
  
  body.innerHTML = `
    <h3 style="font-size:28px; color:var(--accent-color); margin-top:0;">Found ${newGroups.length} New Faces!</h3>
    <p style="color:var(--text-muted); margin-bottom:24px; font-size:16px;">We grouped the faces and created temporary profiles for them. Let's review and name them now.</p>
    <button class="btn-primary" onclick="startBatchReview()">Start Review Workflow</button>
  `;
  
  document.getElementById('batch-upload').value = '';
}

window.startBatchReview = function() {
   closeAnalysisModal();
   processReviewQueue();
}

window.processReviewQueue = function() {
   if (reviewQueue.length > 0) {
       const nextId = reviewQueue.shift();
       editMemory(nextId);
       document.getElementById('panel-title').innerText = `Reviewing Profile (${reviewQueue.length} remaining)`;
   } else {
       manageMemories();
   }
}

// ── Pointillism Effect ──
let isPointillismActive = false;
const Pointillism = {
  gridSize: 20,
  sliderValue: 30,
  colors: ["#9b2226", "#ae2012", "#bb3e03", "#ca6702", "#ee9b00", "#eeb300", "#e9d8a6", "#94d2bd", "#0a9396", "#005f73"],
  circles: [],
  offscreenCanvas: document.createElement('canvas'),
  offscreenCtx: null,

  init(w, h) {
    this.circles = [];
    for (let y = 0; y < h; y += this.gridSize) {
      let row = [];
      for (let x = 0; x < w; x += this.gridSize) {
        row.push(this.colors[Math.floor(Math.random() * this.colors.length)]);
      }
      this.circles.push(row);
    }
  },

  draw() {
    if (!isPointillismActive) return;
    const pCanvas = document.getElementById('pointillism-canvas');
    if (!pCanvas || !video.videoWidth) {
      requestAnimationFrame(() => this.draw());
      return;
    }
    const ctx = pCanvas.getContext('2d');
    const w = pCanvas.width;
    const h = pCanvas.height;

    if (w === 0 || h === 0) {
      requestAnimationFrame(() => this.draw());
      return;
    }

    if (!this.circles.length || this.circles.length !== Math.ceil(h / this.gridSize)) {
      this.init(w, h);
    }

    if (!this.offscreenCtx) {
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (this.offscreenCanvas.width !== w) {
      this.offscreenCanvas.width = w;
      this.offscreenCanvas.height = h;
    }

    this.offscreenCtx.drawImage(video, 0, 0, w, h);
    const pixels = this.offscreenCtx.getImageData(0, 0, w, h).data;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < this.circles.length; i++) {
      for (let j = 0; j < this.circles[i].length; j++) {
        let x = j * this.gridSize;
        let y = i * this.gridSize;
        if (y >= h || x >= w) continue;

        let index = (y * w + x) * 4;
        let r = pixels[index];
        let dia = this.sliderValue + (2 - this.sliderValue) * (r / 255);

        let px = x + this.gridSize / 2;
        let py = y + this.gridSize / 2;
        let c = this.circles[i][j];

        ctx.beginPath();
        ctx.arc(px, py, dia / 2, 0, Math.PI * 2);
        if (dia > 15) {
          ctx.fillStyle = c;
          ctx.fill();
        } else {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    if (this.circles.length > 0 && this.circles[0].length > 0) {
       let randomRow = Math.floor(Math.random() * this.circles.length);
       let randomCol = Math.floor(Math.random() * this.circles[0].length);
       this.circles[randomRow][randomCol] = this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    requestAnimationFrame(() => this.draw());
  }
};

window.togglePointillism = function() {
  isPointillismActive = !isPointillismActive;
  const btn = document.getElementById('pointillism-btn');
  const pCanvas = document.getElementById('pointillism-canvas');
  const sliderContainer = document.getElementById('pointillism-slider-container');
  
  if (isPointillismActive) {
    btn.style.background = 'var(--accent-color)';
    btn.style.color = '#fff';
    pCanvas.style.display = 'block';
    pCanvas.style.backgroundColor = 'black';
    if (sliderContainer) sliderContainer.style.display = 'block';
    Pointillism.draw();
  } else {
    btn.style.background = 'var(--card-bg)';
    btn.style.color = 'var(--text-color)';
    pCanvas.style.display = 'none';
    pCanvas.style.backgroundColor = 'transparent';
    if (sliderContainer) sliderContainer.style.display = 'none';
    const ctx = pCanvas.getContext('2d');
    ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  }
}

window.updatePointillismSlider = function(val) {
  Pointillism.sliderValue = parseInt(val, 10);
}

window.toggleDetection = function() {
  const toggle = document.getElementById('detection-toggle');
  window.isDetectionEnabled = toggle.checked;
  const dot = document.getElementById('camera-status-dot');
  if (window.isDetectionEnabled) {
    updatePersistentStatus("Looking for familiar faces...");
    dot.style.backgroundColor = '#2ea043';
    dot.style.boxShadow = '0 0 10px #2ea043';
  } else {
    updatePersistentStatus("Face Detection Paused");
    dot.style.backgroundColor = '#ff4757';
    dot.style.boxShadow = 'none';
  }
}

window.exportMemories = function() {
  if (memoryDB.length === 0) {
    showToast("No memories to export.", 'info');
    return;
  }
  const toExport = memoryDB.map(person => ({
    ...person,
    faceDescriptors: person.faceDescriptors ? person.faceDescriptors.map(desc => Array.from(desc)) : []
  }));
  const exportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    count: toExport.length,
    people: toExport
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memory-mirror-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${toExport.length} ${toExport.length === 1 ? 'memory' : 'memories'}.`, 'success');
}

window.handleImportFile = async function(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  let people = [];
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      people = data;
    } else if (data.people && Array.isArray(data.people)) {
      people = data.people;
    } else {
      showToast("Invalid backup file format.", 'error');
      return;
    }
  } catch (e) {
    showToast("Failed to read backup file.", 'error');
    console.error(e);
    return;
  }

  if (people.length === 0) {
    showToast("No people found in backup file.", 'error');
    return;
  }

  const existingNames = new Set(memoryDB.map(p => p.name.toLowerCase()));
  const newPeople = people.filter(p => p.name && !existingNames.has(p.name.toLowerCase()));
  const duplicates = people.filter(p => p.name && existingNames.has(p.name.toLowerCase()));

  window._pendingImportData = people;

  const modal = document.getElementById('analysis-modal');
  const body = document.getElementById('analysis-body');
  modal.style.display = 'flex';
  body.innerHTML = `
    <div style="font-size:52px; margin-bottom:16px; line-height:1;">📥</div>
    <h3 style="font-size:24px; margin:0 0 12px 0; color:var(--text-color);">Import ${people.length} ${people.length === 1 ? 'Memory' : 'Memories'}</h3>
    <div style="background:var(--input-bg); border:1px solid var(--input-border); border-radius:12px; padding:16px; margin-bottom:24px; text-align:left; line-height:1.8;">
      <p style="margin:0;">✅ <strong>${newPeople.length}</strong> new ${newPeople.length === 1 ? 'person' : 'people'} to add</p>
      ${duplicates.length > 0 ? `<p style="margin:0; color:var(--text-muted);">⚠️ <strong>${duplicates.length}</strong> already exist (skipped when merging)</p>` : ''}
    </div>
    <button class="btn-primary" style="margin-bottom:12px;" onclick="confirmImport('merge')">Merge — Add New Only</button>
    <button class="btn-outline" style="width:100%; margin-bottom:12px; border-color:#ef4444; color:#ef4444;" onclick="confirmImport('replace')">Replace — Overwrite All Memories</button>
    <button class="btn-outline" style="width:100%;" onclick="closeAnalysisModal()">Cancel</button>
  `;
}

window.confirmImport = function(mode) {
  const people = window._pendingImportData;
  if (!people) return;

  if (mode === 'replace') {
    memoryDB = [];
  }

  const existingNames = new Set(memoryDB.map(p => p.name.toLowerCase()));
  let addedCount = 0;

  people.forEach(person => {
    if (!person.name) return;
    if (mode === 'replace' || !existingNames.has(person.name.toLowerCase())) {
      memoryDB.push({
        ...person,
        id: crypto.randomUUID(),
        faceDescriptors: person.faceDescriptors ? person.faceDescriptors.map(desc => new Float32Array(desc)) : []
      });
      existingNames.add(person.name.toLowerCase());
      addedCount++;
    }
  });

  saveDB();
  updateFaceMatcher();
  window._pendingImportData = null;
  closeAnalysisModal();
  renderMemoryList();
  showToast(`Imported ${addedCount} ${addedCount === 1 ? 'memory' : 'memories'} successfully!`, 'success');
}


