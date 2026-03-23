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
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

const ACCESS_PIN = "1105";
const AUTH_KEY = "daily-photo-auth";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const firebaseConfig = {
  apiKey: "AIzaSyBfZyrh7c91940XHc4lTZAyPLNCDFaGFhQ",
  authDomain: "doomsage-dump.firebaseapp.com",
  projectId: "doomsage-dump",
  storageBucket: "doomsage-dump.firebasestorage.app",
  messagingSenderId: "800883948883",
  appId: "1:800883948883:web:abcafc1e42ac886e5bf5a6",
  measurementId: "G-T8CJ2EEY0E"
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
    () => {
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

    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";
      setMessage(message, "", "");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `photos/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, filePath);

      await uploadBytes(storageRef, file, {
        contentType: file.type,
      });

      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "photos"), {
        imageUrl,
        caption,
        createdAt: serverTimestamp(),
      });

      form.reset();
      setMessage(message, "Photo uploaded successfully", "success");
    } catch (error) {
      console.error(error);
      setMessage(message, "Upload failed. Please try again.", "error");
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload Photo";
    }
  });
}

function buildPhotoCard(photo, index) {
  const card = document.createElement("article");
  card.className = "photo-card";
  card.style.animationDelay = `${index * 0.05}s`;

  const image = document.createElement("img");
  image.src = photo.imageUrl;
  image.alt = "Uploaded daily memory";
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
