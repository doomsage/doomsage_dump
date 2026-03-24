import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const ACCESS_PIN = "1105";
const AUTH_KEY = "daily-photo-auth";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Supabase project settings placeholders.
const SUPABASE_URL = "https://zaepcbphmrpxtkkbbapx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3a-FbW-iN7FRnrI5po0RYA_tLP0PQ76";
const SUPABASE_BUCKET = "Doomsage_dump";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

async function initGalleryPage() {
  const timeline = document.getElementById("timeline");
  const loader = document.getElementById("timelineLoader");
  const emptyState = document.getElementById("emptyState");

  async function loadPhotos() {
    const { data, error } = await supabase
      .from("photos")
      .select("id, image_url, caption, created_at")
      .order("created_at", { ascending: false });

    timeline.innerHTML = "";
    loader.classList.add("hidden");

    if (error) {
      console.error(error);
      emptyState.classList.remove("hidden");
      emptyState.textContent = "Unable to load photos right now";
      return;
    }

    if (!data || data.length === 0) {
      emptyState.classList.remove("hidden");
      emptyState.textContent = "No photos yet";
      return;
    }

    emptyState.classList.add("hidden");

    data.forEach((photo, index) => {
      const card = buildPhotoCard(photo, index);
      timeline.append(card);
    });
  }

  await loadPhotos();

  supabase
    .channel("photos-timeline")
    .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, () => {
      loadPhotos();
    })
    .subscribe();
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
    const filePath = `${Date.now()}-${safeName}`;

    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";
      setMessage(message, "Preparing upload...", "");
      setProgress(progressWrap, progressBar, progressText, 0, false);

      const imageUrl = await uploadToSupabaseWithProgress(filePath, file, (percent) => {
        setProgress(progressWrap, progressBar, progressText, percent, false);
      });

      setMessage(message, "Saving to timeline...", "");

      const { error: insertError } = await supabase.from("photos").insert({
        image_url: imageUrl,
        caption,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        throw insertError;
      }

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

function uploadToSupabaseWithProgress(filePath, file, onProgress) {
  return new Promise(async (resolve, reject) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURIComponent(filePath)}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    } else {
      xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload."));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let details = "Upload failed.";
        try {
          const parsed = JSON.parse(xhr.responseText);
          details = parsed?.message || parsed?.error || details;
        } catch {
          details = xhr.responseText || details;
        }

        reject(new Error(details));
        return;
      }

      const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
      resolve(data.publicUrl);
    };

    xhr.send(file);
  });
}

function buildPhotoCard(photo, index) {
  const card = document.createElement("article");
  card.className = "photo-card";
  card.style.animationDelay = `${index * 0.05}s`;

  const image = document.createElement("img");
  image.src = photo.image_url;
  image.alt = "Uploaded photo";
  image.loading = "lazy";

  const meta = document.createElement("div");
  meta.className = "photo-meta";

  const date = document.createElement("p");
  date.className = "photo-date";
  date.textContent = formatDate(photo.created_at);

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
  if (!createdAt) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
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
  const raw = String(error?.message || error || "");
  const message = raw.toLowerCase();

  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Supabase policy denied this action. Check storage/table RLS policies.";
  }

  if (message.includes("bucket") && message.includes("not found")) {
    return "Bucket not found. Create the storage bucket and use the same name in code.";
  }

  if (message.includes("jwt") || message.includes("token")) {
    return "Invalid Supabase key or token. Verify URL and anon key.";
  }

  if (message.includes("network")) {
    return "Network issue during upload. Check internet and retry.";
  }

  return "Upload failed. Check Supabase URL/key, bucket, and policies.";
}
