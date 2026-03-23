import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const ACCESS_PIN = "1105";
const AUTH_KEY = "daily-photo-auth";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const currentPage = document.body.dataset.page;

setupLogoutButton();

if (currentPage === "index") {
  initPinPage();
}

if (currentPage === "gallery") {
  ensureAccess();
  initGalleryPage();
}

if (currentPage === "upload") {
  ensureAccess();
  initUploadPage();
}

function initPinPage() {
  if (isAuthed()) {
    window.location.href = "gallery.html";
    return;
  }

  const form = document.getElementById("pinForm");
  const pinInput = document.getElementById("pinInput");
  const message = document.getElementById("pinMessage");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const pin = pinInput.value.trim();

    if (pin === ACCESS_PIN) {
      localStorage.setItem(AUTH_KEY, "true");
      message.textContent = "Access granted. Redirecting...";
      message.className = "message success";
      setTimeout(() => {
        window.location.href = "gallery.html";
      }, 350);
      return;
    }

    message.textContent = "Access Denied";
    message.className = "message error";
    form.reset();
  });
}

function initGalleryPage() {
  const timeline = document.getElementById("timeline");
  const loader = document.getElementById("timelineLoader");
  const emptyState = document.getElementById("emptyState");

  const photosQuery = query(collection(db, "photos"), orderBy("createdAt", "desc"));

  onSnapshot(
    photosQuery,
    (snapshot) => {
      timeline.innerHTML = "";
      loader.classList.add("hidden");

      if (snapshot.empty) {
        emptyState.classList.remove("hidden");
        return;
      }

      emptyState.classList.add("hidden");

      snapshot.forEach((doc, index) => {
        const data = doc.data();
        const card = buildPhotoCard(data, index);
        timeline.append(card);
      });
    },
    (error) => {
      console.error(error);
      loader.classList.add("hidden");
      emptyState.classList.remove("hidden");
      emptyState.textContent = "Unable to load photos right now";
    }
  );
}

function initUploadPage() {
  const form = document.getElementById("uploadForm");
  const photoInput = document.getElementById("photoInput");
  const captionInput = document.getElementById("captionInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const message = document.getElementById("uploadMessage");
  const progressWrap = document.getElementById("uploadProgressWrap");
  const progressBar = document.getElementById("uploadProgressBar");
  const progressText = document.getElementById("uploadPercentText");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = photoInput.files[0];
    const caption = captionInput.value.trim();

    if (!file) {
      setMessage(message, "Please choose an image", "error");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage(message, "Only image files are allowed", "error");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage(message, "Image must be 5MB or smaller", "error");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `photos/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, filePath);

    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";
      setMessage(message, "Preparing upload...", "");
      setProgress(progressWrap, progressBar, progressText, 0, false);

      const imageUrl = await uploadImageWithProgress(
        storageRef,
        file,
        (percent) => setProgress(progressWrap, progressBar, progressText, percent, false)
      );

      setMessage(message, "Saving to timeline...", "");

      await addDoc(collection(db, "photos"), {
        imageUrl,
        caption,
        createdAt: serverTimestamp(),
      });

      form.reset();
      setProgress(progressWrap, progressBar, progressText, 100, false);
      setMessage(message, "Photo uploaded successfully", "success");
      setTimeout(() => {
        setProgress(progressWrap, progressBar, progressText, 0, true);
      }, 700);
    } catch (error) {
      console.error(error);
      setMessage(message, getUploadErrorMessage(error), "error");
      setProgress(progressWrap, progressBar, progressText, 0, true);
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload Photo";
    }
  });
}

function uploadImageWithProgress(storageRef, file, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(percent);
      },
      (error) => reject(error),
      async () => {
        const imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(imageUrl);
      }
    );
  });
}

function buildPhotoCard(photo, index) {
  const card = document.createElement("article");
  card.className = "photo-card";
  card.style.animationDelay = `${index * 0.05}s`;

  const image = document.createElement("img");
  image.src = photo.imageUrl;
  image.alt = "Uploaded photo";
  image.loading = "lazy";

  const meta = document.createElement("div");
  meta.className = "photo-meta";

  const date = document.createElement("p");
  date.className = "photo-date";
  date.textContent = formatDate(photo.createdAt);

  meta.append(date);

  if (photo.caption) {
    const caption = document.createElement("p");
    caption.textContent = photo.caption;
    meta.append(caption);
  }

  card.append(image, meta);
  return card;
}

function formatDate(createdAt) {
  if (!createdAt?.toDate) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(createdAt.toDate());
}

function ensureAccess() {
  if (isAuthed()) {
    return;
  }
  window.location.href = "index.html";
}

function isAuthed() {
  return localStorage.getItem(AUTH_KEY) === "true";
}

function setupLogoutButton() {
  const logoutButton = document.getElementById("logoutBtn");
  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "index.html";
  });
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = type ? `message ${type}` : "message";
}

function setProgress(progressWrap, progressBar, progressText, percent, hide) {
  if (hide) {
    progressWrap.classList.add("hidden");
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
    return;
  }

  progressWrap.classList.remove("hidden");
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

function getUploadErrorMessage(error) {
  if (!error || !error.code) {
    return "Upload failed. Please try again.";
  }

  if (error.code === "storage/unauthorized") {
    return "Storage permission denied. Check Firebase Storage rules.";
  }

  if (error.code === "storage/canceled") {
    return "Upload was canceled.";
  }

  if (error.code === "storage/quota-exceeded") {
    return "Storage quota exceeded for this Firebase project.";
  }

  if (error.code.startsWith("storage/")) {
    return "Storage upload failed. Check internet and bucket settings.";
  }

  if (error.code.startsWith("permission-denied")) {
    return "Firestore permission denied. Check Firestore rules.";
  }

  return "Upload failed. Please try again.";
}
