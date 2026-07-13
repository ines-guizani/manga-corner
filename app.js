/**
 * The Manga Corner — Firebase Cloud Sync + Google Auth Version
 * Fixed: Rating, Year, Pagination, Photos, Filters
 */

// ===== FIREBASE SETUP =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4AqPDWurGDj321-B8DKQRuGtQfl8QULc",
  authDomain: "manga-corner-b0af9.firebaseapp.com",
  projectId: "manga-corner-b0af9",
  storageBucket: "manga-corner-b0af9.firebasestorage.app",
  messagingSenderId: "493110609888",
  appId: "1:493110609888:web:c94b163c51dce675758d85"
};

const OWNER_EMAIL = "inesguizani348@gmail.com";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const MANGAS_COL = collection(db, "mangas");

// ===== CONFIG =====
const DEFAULT_GENRES = []; // No default genres - only use genres from existing manga
const THEME_KEY = 'mangaCorner_theme';
const ITEMS_PER_PAGE = 20;

// ===== STATE =====
let state = {
  mangas: [],
  genres: [],
  currentPage: 'home',
  selectedMangaId: null,
  editMode: false,
  addForm: { chapters: [], photos: [], cover: '', selectedGenres: [], rating: 0, year: '' },
  detailEdit: { chapters: [], photos: [], cover: '', selectedGenres: [], rating: 0, year: '', currentChapter: 1, mangaStatusChapter: 1 },
  filters: { search: '', mangaStatus: 'All', myStatus: 'All', genres: [], excludeGenres: [] },
  showFilters: false,
  showGenreManager: false,
  showDetailGenreManager: false,
  currentUser: null,
  listPage: 1,
  sortBy: 'newest',
  lightbox: { open: false, photos: [], currentIndex: 0 },
};

// ===== AUTH =====
function setupAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (user.email !== OWNER_EMAIL) {
        signOut(auth);
        showLoginScreen("⛔ Access denied. This app is private.");
        return;
      }
      state.currentUser = user;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-wrapper').style.display = 'block';
      document.getElementById('user-avatar').src = user.photoURL || '';
      document.getElementById('user-avatar').style.display = 'block';
      document.getElementById('user-name').textContent = user.displayName || user.email;
      loadAppData();
    } else {
      state.currentUser = null;
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-wrapper').style.display = 'none';
      showLoadingScreen(false);
    }
  });

  document.getElementById('google-signin-btn').addEventListener('click', async () => {
    try {
      document.getElementById('signin-error').style.display = 'none';
      await signInWithPopup(auth, provider);
    } catch (e) {
      document.getElementById('signin-error').textContent = 'Sign-in failed: ' + e.message;
      document.getElementById('signin-error').style.display = 'block';
    }
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut(auth);
  });
}

function showLoginScreen(errorMsg = '') {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-wrapper').style.display = 'none';
  if (errorMsg) {
    document.getElementById('signin-error').textContent = errorMsg;
    document.getElementById('signin-error').style.display = 'block';
  }
}

// ===== LOAD APP DATA =====
async function loadAppData() {
  showLoadingScreen(true);
  try {
    const [cloudMangas, cloudGenres] = await Promise.all([
      loadMangasFromCloud(),
      loadGenresFromCloud()
    ]);

    // Ensure all mangas have rating and year fields
    state.mangas = cloudMangas.map(m => ({
      ...m,
      rating: m.rating ?? 0,
      year: m.year ?? ''
    }));

    // Build genre list from cloud + all genres found in existing manga
    const mangaGenres = new Set();
    state.mangas.forEach(m => {
      if (m.genre && Array.isArray(m.genre)) {
        m.genre.forEach(g => mangaGenres.add(g));
      }
    });

    if (cloudGenres && cloudGenres.length > 0) {
      cloudGenres.forEach(g => mangaGenres.add(g));
    }
    // Only use genres found in existing manga + cloud genres (no defaults)
    state.genres = Array.from(mangaGenres).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    // Always save merged genres back to cloud
    await saveGenresToCloud(state.genres);
    await migrateLocalStorageToCloud();

    // Migrate existing manga to new format (adds missing fields like rating, year, etc.)
    await migrateExistingMangasToNewFormat();
  } catch (e) {
    console.error("Cloud load failed:", e);
    state.mangas = loadFromStorage('mangas_v2', []);
    state.genres = loadFromStorage('genres_v2', [...DEFAULT_GENRES]);
    showSyncError();
  }
  showLoadingScreen(false);
  setupNavigation();
  setupThemeToggle();
  setupMobileMenu();
  setupAddPage();
  setupListPage();
  setupDetailPage();
  setupLightbox();
  handleRoute();
  setupRealtimeSync();
}

// ===== CLOUD FUNCTIONS =====
async function saveMangaToCloud(manga) {
  try {
    showSyncing();
    // Ensure rating and year are always present
    const cleanManga = {
      ...manga,
      rating: manga.rating ?? 0,
      year: manga.year ?? ''
    };
    await setDoc(doc(db, "mangas", cleanManga.id), cleanManga);
    showSynced();
  } catch (e) { console.error("Save failed:", e); showSyncError(); }
}

async function deleteMangaFromCloud(id) {
  try {
    showSyncing();
    await deleteDoc(doc(db, "mangas", id));
    showSynced();
  } catch (e) { console.error("Delete failed:", e); showSyncError(); }
}

async function saveGenresToCloud(genres) {
  try { await setDoc(doc(db, "genres", "list"), { genres }); }
  catch (e) { console.error("Genres save failed:", e); }
}

async function loadMangasFromCloud() {
  const snapshot = await getDocs(MANGAS_COL);
  return snapshot.docs.map(d => d.data());
}

async function loadGenresFromCloud() {
  const snapshot = await getDocs(collection(db, "genres"));
  if (snapshot.empty) return null;
  const docData = snapshot.docs.find(d => d.id === "list");
  return docData ? docData.data().genres : null;
}

// ===== SYNC STATUS =====
function showSyncing() {
  const el = document.getElementById('sync-status');
  if (el) { el.textContent = '☁️ Saving...'; el.className = 'sync-status syncing'; el.style.display = 'flex'; }
}
function showSynced() {
  const el = document.getElementById('sync-status');
  if (el) {
    el.textContent = '✓ Saved to cloud';
    el.className = 'sync-status synced';
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 2500);
  }
}
function showSyncError() {
  const el = document.getElementById('sync-status');
  if (el) { el.textContent = '⚠️ Sync error — check connection'; el.className = 'sync-status error'; el.style.display = 'flex'; }
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showLoadingScreen(show) {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ===== MIGRATION =====
async function migrateLocalStorageToCloud() {
  if (localStorage.getItem('mangaCorner_migrated_to_cloud')) return;
  const oldMangas = loadFromStorage('mangas_v2', null) || loadFromStorage('mangas', null);
  if (oldMangas && oldMangas.length > 0 && state.mangas.length === 0) {
    for (const manga of oldMangas) {
      const clean = {
        id: manga.id || `migrated_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,
        title: manga.title || '',
        otherTitles: manga.otherTitles || '',
        genre: manga.genre || [],
        mangaStatus: manga.mangaStatus || 'Ongoing',
        myStatus: manga.myStatus || "Didn't start yet",
        summary: manga.summary || '',
        cover: manga.cover || '',
        rating: manga.rating ?? 0,
        year: manga.year ?? '',
        favoriteChapters: manga.favoriteChapters || [],
        favoritePhotos: manga.favoritePhotos || [],
        createdAt: manga.createdAt || new Date().toISOString(),
      };
      await setDoc(doc(db, "mangas", clean.id), clean);
      state.mangas.push(clean);
    }
  }
  localStorage.setItem('mangaCorner_migrated_to_cloud', 'true');
}

// ===== MIGRATE EXISTING MANGA TO NEW FORMAT =====
async function migrateExistingMangasToNewFormat() {
  // Check if already migrated
  if (localStorage.getItem('mangaCorner_migrated_v3')) return;

  let migratedCount = 0;
  for (const manga of state.mangas) {
    let needsUpdate = false;

    // Add rating if missing
    if (manga.rating === undefined || manga.rating === null) {
      manga.rating = 0;
      needsUpdate = true;
    }

    // Add year if missing
    if (manga.year === undefined || manga.year === null) {
      manga.year = '';
      needsUpdate = true;
    }

    // Ensure mangaStatus is a string (not undefined)
    if (!manga.mangaStatus) {
      manga.mangaStatus = 'Ongoing';
      needsUpdate = true;
    }

    // Ensure myStatus is a string
    if (!manga.myStatus) {
      manga.myStatus = "Didn't start yet";
      needsUpdate = true;
    }

    // Ensure genre is an array
    if (!manga.genre || !Array.isArray(manga.genre)) {
      manga.genre = [];
      needsUpdate = true;
    }

    // Ensure favoriteChapters is an array
    if (!manga.favoriteChapters || !Array.isArray(manga.favoriteChapters)) {
      manga.favoriteChapters = [];
      needsUpdate = true;
    }

    // Ensure favoritePhotos is an array
    if (!manga.favoritePhotos || !Array.isArray(manga.favoritePhotos)) {
      manga.favoritePhotos = [];
      needsUpdate = true;
    }

    // Ensure createdAt exists
    if (!manga.createdAt) {
      manga.createdAt = new Date().toISOString();
      needsUpdate = true;
    }

    if (needsUpdate) {
      await saveMangaToCloud(manga);
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    showToast(`Updated ${migratedCount} manga to new format! ✨`);
  }

  localStorage.setItem('mangaCorner_migrated_v3', 'true');
}

// ===== REAL-TIME SYNC =====
function setupRealtimeSync() {
  onSnapshot(MANGAS_COL, (snapshot) => {
    const incoming = snapshot.docs.map(d => ({
      ...d.data(),
      rating: d.data().rating ?? 0,
      year: d.data().year ?? ''
    }));
    if (JSON.stringify(incoming) !== JSON.stringify(state.mangas)) {
      state.mangas = incoming;
      if (state.currentPage === 'home') renderHome();
      if (state.currentPage === 'list') renderList();
    }
  });
}

// ===== LOCALSTORAGE FALLBACK =====
function loadFromStorage(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// ===== NAVIGATION =====
function setupNavigation() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      navigate(href.slice(1) || 'home');
    }
  });
  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
}

function navigate(page) {
  window.location.hash = page === 'home' ? '' : page;
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/');
  const page = parts[0] || 'home';

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-link, .mobile-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll(`a[href="#${page}"]`).forEach(l => l.classList.add('active'));

  state.currentPage = page;
  state.editMode = false;

  switch (page) {
    case 'home':
      document.getElementById('page-home').classList.remove('hidden');
      renderHome(); break;
    case 'add':
      document.getElementById('page-add').classList.remove('hidden');
      resetAddForm(); break;
    case 'list':
      document.getElementById('page-list').classList.remove('hidden');
      renderList(); break;
    case 'detail':
      state.selectedMangaId = parts[1];
      document.getElementById('page-detail').classList.remove('hidden');
      renderDetail(); break;
    default: navigate('home');
  }

  document.getElementById('mobile-menu').classList.remove('open');
  window.scrollTo(0, 0);
}

// ===== THEME =====
function setupThemeToggle() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(THEME_KEY, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(THEME_KEY, 'dark');
    }
  });
}

// ===== MOBILE MENU =====
function setupMobileMenu() {
  const toggle = document.getElementById('mobile-toggle');
  const menu = document.getElementById('mobile-menu');
  toggle.addEventListener('click', () => menu.classList.toggle('open'));
  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => menu.classList.remove('open'));
  });
}

// ===== HOME =====
function renderHome() {
  const count = state.mangas.length;
  const countEl = document.getElementById('hero-count');
  if (count > 0) {
    countEl.style.display = 'flex';
    document.getElementById('hero-count-num').textContent = count;
  } else {
    countEl.style.display = 'none';
  }
}

// ===== STAR RATING =====
function setupStarRating(containerId, hiddenInputId, valueDisplayId, initialValue = 0, onChange = null) {
  const container = document.getElementById(containerId);
  const hiddenInput = document.getElementById(hiddenInputId);
  const valueDisplay = document.getElementById(valueDisplayId);
  if (!container) return null;

  const stars = container.querySelectorAll('.star');
  let currentValue = initialValue;

  function updateStars(val) {
    stars.forEach(s => {
      const v = parseInt(s.dataset.value);
      s.classList.toggle('active', v <= val);
    });
    if (hiddenInput) hiddenInput.value = val;
    if (valueDisplay) valueDisplay.textContent = val;
  }

  stars.forEach(star => {
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.value);
      currentValue = currentValue === val ? 0 : val;
      updateStars(currentValue);
      if (onChange) onChange(currentValue);
    });
    star.addEventListener('mouseenter', () => {
      updateStars(parseInt(star.dataset.value));
    });
  });

  container.addEventListener('mouseleave', () => {
    updateStars(currentValue);
  });

  updateStars(currentValue);
  return {
    getValue: () => currentValue,
    setValue: (v) => { currentValue = v; updateStars(v); }
  };
}

function renderStarDisplay(container, rating, size = 'small') {
  if (!container) return;
  const fullStars = Math.floor(rating);
  const stars = [];
  for (let i = 1; i <= 10; i++) {
    stars.push(`<span class="star-display ${i <= fullStars ? '' : 'empty'}">${i <= fullStars ? '&#9733;' : '&#9734;'}</span>`);
  }
  container.innerHTML = stars.join('') + `<span class="rating-number">${rating}/10</span>`;
}

// ===== GENRES =====
function renderGenrePills(containerId, selectedGenres, onToggle, excludedGenres = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('button');
    pill.type = 'button';
    let className = 'genre-pill';
    if (excludedGenres.includes(genre)) {
      className += ' exclude';
    } else if (selectedGenres.includes(genre)) {
      className += ' active';
    }
    pill.className = className;
    pill.textContent = genre;

    let clickTimer = null;
    pill.addEventListener('click', (e) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        onToggle(genre, 'exclude');
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          onToggle(genre, 'include');
        }, 250);
      }
    });
    container.appendChild(pill);
  });
}

function renderManagedGenres(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('span');
    pill.className = 'genre-pill managed';
    pill.innerHTML = `${genre} <span class="remove">&times;</span>`;
    pill.querySelector('.remove').addEventListener('click', () => {
      deleteGenre(genre);
      renderAllGenrePills();
    });
    container.appendChild(pill);
  });
}

function renderAllGenrePills() {
  if (state.currentPage === 'add') {
    renderGenrePills('genre-pills', state.addForm.selectedGenres, (g, mode) => {
      toggleArray(state.addForm.selectedGenres, g);
      renderAllGenrePills();
    });
    renderManagedGenres('genre-list');
  }
  if (state.currentPage === 'list') {
    renderGenrePills('filter-genre-pills', state.filters.genres, (g, mode) => {
      if (mode === 'exclude') {
        toggleArray(state.filters.excludeGenres, g);
        const idx = state.filters.genres.indexOf(g);
        if (idx > -1) state.filters.genres.splice(idx, 1);
      } else {
        toggleArray(state.filters.genres, g);
        const idx = state.filters.excludeGenres.indexOf(g);
        if (idx > -1) state.filters.excludeGenres.splice(idx, 1);
      }
      state.listPage = 1;
      renderList();
      renderAllGenrePills();
    }, state.filters.excludeGenres);
  }
  if (state.currentPage === 'detail' && state.editMode) {
    renderGenrePills('detail-genre-pills', state.detailEdit.selectedGenres, (g, mode) => {
      toggleArray(state.detailEdit.selectedGenres, g);
      renderDetailGenrePills();
    });
    renderDetailManagedGenres();
  }
}

function toggleArray(arr, item) {
  const idx = arr.indexOf(item);
  if (idx > -1) arr.splice(idx, 1); else arr.push(item);
}

function addGenre(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const genres = trimmed.split(',').map(g => g.trim()).filter(g => g);
  let added = false;
  genres.forEach(g => {
    if (!state.genres.includes(g)) { state.genres.push(g); added = true; }
  });
  if (added) {
    state.genres.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    saveGenresToCloud(state.genres);
  }
  return added;
}

// ===== ADD GENRE TO ALL MANGA =====
async function addGenreToAllManga(genreName) {
  const trimmed = genreName.trim();
  if (!trimmed) return;

  // First add the genre to the global list if not exists
  if (!state.genres.includes(trimmed)) {
    state.genres.push(trimmed);
    await saveGenresToCloud(state.genres);
  }

  // Add genre to all manga that don't already have it
  let updatedCount = 0;
  for (const manga of state.mangas) {
    if (!manga.genre) manga.genre = [];
    if (!manga.genre.includes(trimmed)) {
      manga.genre.push(trimmed);
      await saveMangaToCloud(manga);
      updatedCount++;
    }
  }

  showToast(`Added "${trimmed}" to ${updatedCount} manga! 🎉`);
  renderAllGenrePills();
  if (state.currentPage === 'list') renderList();
  if (state.currentPage === 'detail') renderDetail();
}

function deleteGenre(genre) {
  if (!confirm(`Delete genre "${genre}"?`)) return;
  state.genres = state.genres.filter(g => g !== genre);
  state.genres.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  saveGenresToCloud(state.genres);
  state.mangas.forEach(m => {
    m.genre = m.genre.filter(g => g !== genre);
    saveMangaToCloud(m);
  });
  state.addForm.selectedGenres = state.addForm.selectedGenres.filter(g => g !== genre);
  state.filters.genres = state.filters.genres.filter(g => g !== genre);
  state.detailEdit.selectedGenres = state.detailEdit.selectedGenres.filter(g => g !== genre);
}

// ===== IMAGE RESIZE & COMPRESS =====
function resizeImage(base64Str, maxWidth = 1200, maxHeight = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = function() {
      try {
        let width = img.width;
        let height = img.height;

        // Only resize if image is larger than max dimensions
        if (width <= maxWidth && height <= maxHeight) {
          resolve(base64Str);
          return;
        }

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * maxWidth / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * maxHeight / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // For JPEG images, fill white background first
        const isJPEG = base64Str.includes('image/jpeg') || base64Str.includes('image/jpg');
        if (isJPEG) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Detect original format from base64 string
        const isPNG = base64Str.includes('image/png');
        const isWebP = base64Str.includes('image/webp');
        const isGIF = base64Str.includes('image/gif');

        let dataURL;
        if (isPNG) {
          dataURL = canvas.toDataURL('image/png');
        } else if (isWebP) {
          try { 
            dataURL = canvas.toDataURL('image/webp', quality); 
          } catch (e) { 
            dataURL = canvas.toDataURL('image/png'); 
          }
        } else if (isGIF) {
          dataURL = canvas.toDataURL('image/png');
        } else {
          // Default to JPEG for everything else
          dataURL = canvas.toDataURL('image/jpeg', quality);
        }

        // Verify the resized image is valid by checking size
        if (dataURL.length < 100) {
          console.error('Resized image too small, using original');
          resolve(base64Str);
        } else {
          resolve(dataURL);
        }
      } catch (err) {
        console.error('Resize error:', err);
        resolve(base64Str);
      }
    };

    img.onerror = function() {
      console.error('Image load error, returning original');
      resolve(base64Str);
    };

    img.src = base64Str;
  });
}

// ===== FILE TO BASE64 (with resize) =====
async function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const original = e.target.result;
      // Only resize if file is larger than 1MB
      // For PNG/WebP, we also check if resize is needed inside resizeImage
      if (file.size > 1024 * 1024) {
        try {
          const resized = await resizeImage(original, 1200, 1200, 0.85);
          resolve(resized);
        } catch (err) {
          console.error('Resize failed, using original:', err);
          resolve(original);
        }
      } else {
        resolve(original);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// ===== ADD PAGE =====
let addRatingControl = null;

function setupAddPage() {
  const coverBox = document.getElementById('cover-box');
  const coverInput = document.getElementById('cover-input');
  const coverPreview = document.getElementById('cover-preview');
  const coverPlaceholder = document.getElementById('cover-placeholder');
  const removeCover = document.getElementById('remove-cover');

  coverBox.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.addForm.cover = await fileToBase64(file);
    coverPreview.src = state.addForm.cover;
    coverPreview.classList.remove('hidden');
    coverPlaceholder.classList.add('hidden');
    removeCover.classList.remove('hidden');
  });
  removeCover.addEventListener('click', (e) => {
    e.stopPropagation();
    state.addForm.cover = '';
    coverPreview.src = '';
    coverPreview.classList.add('hidden');
    coverPlaceholder.classList.remove('hidden');
    removeCover.classList.add('hidden');
    coverInput.value = '';
  });

  document.getElementById('toggle-genre-manager').addEventListener('click', () => {
    state.showGenreManager = !state.showGenreManager;
    document.getElementById('genre-manager').classList.toggle('hidden', !state.showGenreManager);
    document.getElementById('toggle-genre-manager').textContent = state.showGenreManager ? 'Hide genres' : 'Manage genres';
  });

  document.getElementById('add-genre-btn').addEventListener('click', () => {
    const input = document.getElementById('new-genre');
    if (addGenre(input.value)) { input.value = ''; renderAllGenrePills(); }
  });

  document.getElementById('add-genre-to-all-btn').addEventListener('click', () => {
    const input = document.getElementById('new-genre');
    if (input.value.trim()) {
      addGenreToAllManga(input.value);
      input.value = '';
    }
  });

  const myStatus = document.getElementById('my-status');
  myStatus.addEventListener('change', () => {
    document.getElementById('dropped-field').classList.toggle('hidden', myStatus.value !== 'Dropped');
    document.getElementById('current-field').classList.toggle('hidden', myStatus.value !== 'In Chapter');
  });

  // Manga status chapter controls (for Completed/Stopped)
  const mangaStatusSelect = document.getElementById('manga-status');
  const mangaStatusChapterField = document.getElementById('manga-status-chapter-field');
  const mangaStatusChapterInput = document.getElementById('manga-status-chapter');

  mangaStatusSelect.addEventListener('change', () => {
    const needsChapter = mangaStatusSelect.value === 'Completed' || mangaStatusSelect.value === 'Stopped';
    mangaStatusChapterField.classList.toggle('hidden', !needsChapter);
  });

  document.getElementById('manga-status-chapter-minus').addEventListener('click', () => {
    const val = parseInt(mangaStatusChapterInput.value) || 1;
    if (val > 0) mangaStatusChapterInput.value = val - 1;
  });

  document.getElementById('manga-status-chapter-plus').addEventListener('click', () => {
    const val = parseInt(mangaStatusChapterInput.value) || 0;
    mangaStatusChapterInput.value = val + 1;
  });

  // Setup star rating for add form
  addRatingControl = setupStarRating('add-rating-stars', 'rating-input', 'add-rating-value', 0, (val) => {
    state.addForm.rating = val;
  });

  document.querySelectorAll('#page-add .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab('add', btn.dataset.tab));
  });

  document.getElementById('add-chapter-btn').addEventListener('click', () => {
    const num = document.getElementById('chapter-num').value.trim();
    const reason = document.getElementById('chapter-reason').value.trim();
    if (!num || !reason) return;
    state.addForm.chapters.push({ number: parseInt(num), reason });
    document.getElementById('chapter-num').value = '';
    document.getElementById('chapter-reason').value = '';
    renderChapters('chapters-list', state.addForm.chapters, true);
    updateTabCount('tab-count-chapters', state.addForm.chapters.length);
  });

  // Photo upload - FIX: use proper event delegation
  const photoUpload = document.getElementById('photo-upload');
  const photoInput = document.getElementById('photo-input');

  photoUpload.addEventListener('click', () => {
    photoInput.click();
  });

  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Process files sequentially to avoid memory/canvas issues
    const dataUrls = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToBase64(file);
        if (dataUrl) dataUrls.push(dataUrl);
      } catch (err) {
        console.error('Failed to process file:', file.name, err);
      }
    }

    if (dataUrls.length === 0) {
      showToast('Failed to process photos. Try fewer at a time.', 'error');
      photoInput.value = '';
      return;
    }

    state.addForm.photos.push(...dataUrls);
    renderPhotos('photo-grid', state.addForm.photos, true);
    updateTabCount('tab-count-photos', state.addForm.photos.length);
    // Reset input so same files can be selected again
    photoInput.value = '';
  });

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value.trim();
    if (!title) { alert('Please enter a title!'); return; }

    // Check for duplicates (title + alternative titles)
    const dupCheck = checkDuplicate(title, document.getElementById('other-titles').value);
    if (dupCheck.duplicate) {
      const confirmed = confirm(`A manga titled "${dupCheck.manga.title}" already exists in your collection (matched by ${dupCheck.matchType}). Do you still want to add it?`);
      if (!confirmed) return;
    }

    const myStatusEl = document.getElementById('my-status');
    let myStatusVal = myStatusEl.value;
    if (myStatusVal === 'Dropped') {
      const chap = document.getElementById('dropped-chapter').value.trim();
      if (chap) myStatusVal = `Dropped (at chapter ${chap})`;
    } else if (myStatusVal === 'In Chapter') {
      let chap = document.getElementById('current-chapter').value.trim();
      if (chap) {
        let chapNum = parseInt(chap);
        const mangaStatusChap = document.getElementById('manga-status-chapter').value.trim();
        if (mangaStatusChap) {
          const maxChap = parseInt(mangaStatusChap);
          chapNum = Math.min(chapNum, maxChap);
          chapNum = Math.max(0, chapNum);
        }
        myStatusVal = `In Chapter ${chapNum}`;
      }
    }

    let mangaStatusVal = document.getElementById('manga-status').value;
    if (mangaStatusVal === 'Completed' || mangaStatusVal === 'Stopped') {
      const chap = document.getElementById('manga-status-chapter').value.trim();
      if (chap) mangaStatusVal = `${mangaStatusVal} (at chapter ${chap})`;
    }

    const manga = {
      id: `manga_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      title,
      otherTitles: document.getElementById('other-titles').value.trim(),
      genre: [...state.addForm.selectedGenres],
      mangaStatus: mangaStatusVal,
      myStatus: myStatusVal,
      summary: document.getElementById('summary').value.trim(),
      cover: state.addForm.cover,
      rating: state.addForm.rating || 0,
      year: document.getElementById('year-created').value.trim(),
      favoriteChapters: [...state.addForm.chapters],
      favoritePhotos: [...state.addForm.photos],
      createdAt: new Date().toISOString(),
    };

    state.mangas.push(manga);
    await saveMangaToCloud(manga);
    alert('Manga saved to cloud! ☁️');
    navigate('list');
  });
}

function resetAddForm() {
  state.addForm = { chapters: [], photos: [], cover: '', selectedGenres: [], rating: 0, year: '' };
  state.showGenreManager = false;
  document.getElementById('add-form').reset();
  document.getElementById('cover-preview').src = '';
  document.getElementById('cover-preview').classList.add('hidden');
  document.getElementById('cover-placeholder').classList.remove('hidden');
  document.getElementById('remove-cover').classList.add('hidden');
  document.getElementById('dropped-field').classList.add('hidden');
  document.getElementById('current-field').classList.add('hidden');
  document.getElementById('genre-manager').classList.add('hidden');
  document.getElementById('toggle-genre-manager').textContent = 'Manage genres';
  if (addRatingControl) addRatingControl.setValue(0);
  switchTab('add', 'chapters');
  renderChapters('chapters-list', [], true);
  renderPhotos('photo-grid', [], true);
  updateTabCount('tab-count-chapters', 0);
  updateTabCount('tab-count-photos', 0);
  renderAllGenrePills();
}

// ===== TABS =====
function switchTab(page, tabName) {
  const prefix = page === 'add' ? '' : 'detail-';
  document.querySelectorAll(`#page-${page} .tab-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName || btn.dataset.detailTab === tabName);
  });
  document.querySelectorAll(`#page-${page} .tab-content`).forEach(c => c.classList.add('hidden'));
  const activeContent = document.getElementById(`${prefix}tab-${tabName}`);
  if (activeContent) activeContent.classList.remove('hidden');
}

function updateTabCount(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count;
}

// ===== RENDER SUB-LISTS =====
function renderChapters(containerId, chapters, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (chapters.length === 0) {
    container.innerHTML = '<p class="empty-hint">No favorite chapters yet. Add some!</p>';
    return;
  }
  container.innerHTML = chapters.map((ch, i) => `
    <div class="item-row">
      <div class="item-content">
        <span class="item-title">Chapter ${ch.number}</span>
        <p class="item-desc">${escapeHtml(ch.reason)}</p>
      </div>
      <button class="item-delete" data-idx="${i}" title="Remove">&#10005;</button>
    </div>
  `).join('');
  container.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      if (editable) {
        chapters.splice(idx, 1);
        renderChapters(containerId, chapters, editable);
        updateTabCount(containerId === 'chapters-list' ? 'tab-count-chapters' : 'detail-tab-count-chapters', chapters.length);
      } else {
        // View mode - delete from manga directly
        const manga = state.mangas.find(m => m.id === state.selectedMangaId);
        if (manga && manga.favoriteChapters) {
          manga.favoriteChapters.splice(idx, 1);
          await saveMangaToCloud(manga);
          renderChapters(containerId, manga.favoriteChapters, false);
          updateTabCount('detail-tab-count-chapters', manga.favoriteChapters.length);
          showToast('Chapter removed! 🗑️');
        }
      }
    });
  });
}

function renderPhotos(containerId, photos, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (photos.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = photos.map((src, i) => `
    <div class="photo-item" data-idx="${i}">
      <img src="${src}" alt="Photo ${i + 1}">
      <button class="photo-remove" data-idx="${i}" title="Remove">&#10005;</button>
    </div>
  `).join('');

  // Add click to open lightbox (for viewing) - only on the image, not the remove button
  container.querySelectorAll('.photo-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.photo-remove')) return;
      const idx = parseInt(item.dataset.idx);
      openLightbox(photos, idx);
    });
  });

  container.querySelectorAll('.photo-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      if (editable) {
        photos.splice(idx, 1);
        renderPhotos(containerId, photos, editable);
        updateTabCount(containerId === 'photo-grid' ? 'tab-count-photos' : 'detail-tab-count-photos', photos.length);
      } else {
        // View mode - delete from manga directly
        const manga = state.mangas.find(m => m.id === state.selectedMangaId);
        if (manga && manga.favoritePhotos) {
          manga.favoritePhotos.splice(idx, 1);
          await saveMangaToCloud(manga);
          renderPhotos(containerId, manga.favoritePhotos, false);
          updateTabCount('detail-tab-count-photos', manga.favoritePhotos.length);
          showToast('Photo removed! 🗑️');
        }
      }
    });
  });
}

// ===== LIGHTBOX =====
function setupLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  const closeBtn = document.getElementById('lightbox-close');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  const backdrop = lightbox.querySelector('.lightbox-backdrop');

  closeBtn.addEventListener('click', closeLightbox);
  backdrop.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevLightboxPhoto(); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextLightboxPhoto(); });

  document.addEventListener('keydown', (e) => {
    if (!state.lightbox.open) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevLightboxPhoto();
    if (e.key === 'ArrowRight') nextLightboxPhoto();
  });
}

function openLightbox(photos, startIndex) {
  state.lightbox = { open: true, photos, currentIndex: startIndex };
  updateLightbox();
  document.getElementById('lightbox').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  state.lightbox.open = false;
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}

function updateLightbox() {
  const { photos, currentIndex } = state.lightbox;
  document.getElementById('lightbox-img').src = photos[currentIndex];
  document.getElementById('lightbox-counter').textContent = `${currentIndex + 1} / ${photos.length}`;
  document.getElementById('lightbox-prev').style.display = photos.length > 1 ? 'flex' : 'none';
  document.getElementById('lightbox-next').style.display = photos.length > 1 ? 'flex' : 'none';
}

function prevLightboxPhoto() {
  if (state.lightbox.photos.length <= 1) return;
  state.lightbox.currentIndex = (state.lightbox.currentIndex - 1 + state.lightbox.photos.length) % state.lightbox.photos.length;
  updateLightbox();
}

function nextLightboxPhoto() {
  if (state.lightbox.photos.length <= 1) return;
  state.lightbox.currentIndex = (state.lightbox.currentIndex + 1) % state.lightbox.photos.length;
  updateLightbox();
}

// ===== LIST PAGE =====
function setupListPage() {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    state.filters.search = searchInput.value;
    state.listPage = 1;
    searchClear.classList.toggle('hidden', !searchInput.value);
    renderList();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.search = '';
    state.listPage = 1;
    searchClear.classList.add('hidden');
    renderList();
  });

  // FILTER TOGGLE - FIX: ensure proper class toggling
  const toggleFiltersBtn = document.getElementById('toggle-filters');
  const filtersPanel = document.getElementById('filters-panel');

  toggleFiltersBtn.addEventListener('click', () => {
    state.showFilters = !state.showFilters;
    filtersPanel.classList.toggle('hidden', !state.showFilters);
    toggleFiltersBtn.classList.toggle('active', state.showFilters);
  });

  document.getElementById('filter-manga-status').addEventListener('change', (e) => {
    state.filters.mangaStatus = e.target.value;
    state.listPage = 1;
    renderList();
  });

  document.getElementById('filter-my-status').addEventListener('change', (e) => {
    state.filters.myStatus = e.target.value;
    state.listPage = 1;
    renderList();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    state.filters = { search: '', mangaStatus: 'All', myStatus: 'All', genres: [], excludeGenres: [] };
    state.showFilters = false;
    state.listPage = 1;
    searchInput.value = '';
    searchClear.classList.add('hidden');
    document.getElementById('filter-manga-status').value = 'All';
    document.getElementById('filter-my-status').value = 'All';
    filtersPanel.classList.add('hidden');
    toggleFiltersBtn.classList.remove('active');
    renderList();
    renderAllGenrePills();
  });

  // Sort
  document.getElementById('sort-by').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.listPage = 1;
    renderList();
  });
}

function getFilteredAndSortedMangas() {
  const { search, mangaStatus, myStatus, genres, excludeGenres } = state.filters;
  let filtered = state.mangas.filter(m => {
    const matchSearch = !search ||
      (m.title && m.title.toLowerCase().includes(search.toLowerCase())) ||
      (m.otherTitles && m.otherTitles.toLowerCase().includes(search.toLowerCase()));
    const matchMangaStatus = mangaStatus === 'All' || (m.mangaStatus && m.mangaStatus.startsWith(mangaStatus));
    const matchMyStatus = myStatus === 'All' || (m.myStatus && m.myStatus.startsWith(myStatus));
    const matchGenre = genres.length === 0 || genres.every(g => m.genre && m.genre.includes(g));
    const matchExclude = excludeGenres.length === 0 || !excludeGenres.some(g => m.genre && m.genre.includes(g));
    return matchSearch && matchMangaStatus && matchMyStatus && matchGenre && matchExclude;
  });

  // Sort
  filtered.sort((a, b) => {
    switch (state.sortBy) {
      case 'title-asc': return (a.title || '').localeCompare(b.title || '');
      case 'title-desc': return (b.title || '').localeCompare(a.title || '');
      case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
      case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
      case 'year-desc': return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
      case 'year-asc': return (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999);
      case 'newest': default: return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
  });

  return filtered;
}

function renderPagination(totalItems, currentPage, containerId) {
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Prev button
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&#10094;</button>`;

  // Page numbers
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button class="page-btn" data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="page-btn dots">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="page-btn dots">...</span>`;
    html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  // Next button
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">&#10095;</button>`;

  container.innerHTML = html;

  container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages) {
        state.listPage = page;
        renderList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

function renderList() {
  const filtered = getFilteredAndSortedMangas();
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const currentPage = Math.min(state.listPage, totalPages);
  state.listPage = currentPage;

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, end);

  const subtitle = document.getElementById('list-subtitle');
  if (subtitle) {
    subtitle.innerHTML = `${state.mangas.length} manga${state.mangas.length !== 1 ? 's' : ''} total` +
      (filtered.length !== state.mangas.length ? ` &middot; <span style="color:var(--primary)">${filtered.length} shown</span>` : '');
  }

  // Pagination info
  const paginationInfo = document.getElementById('pagination-info');
  if (paginationInfo) {
    if (totalItems > 0) {
      paginationInfo.textContent = `Page ${currentPage} of ${totalPages} (${start + 1}-${Math.min(end, totalItems)} of ${totalItems})`;
    } else {
      paginationInfo.textContent = '';
    }
  }

  const activeFilterCount = [
    state.filters.search, 
    state.filters.mangaStatus !== 'All', 
    state.filters.myStatus !== 'All', 
    state.filters.genres.length > 0,
    state.filters.excludeGenres.length > 0
  ].filter(Boolean).length;

  const badge = document.getElementById('filter-badge');
  if (badge) {
    badge.textContent = activeFilterCount;
    badge.classList.toggle('hidden', activeFilterCount === 0);
  }

  const grid = document.getElementById('manga-grid');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    if (grid) grid.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    const hasFilters = activeFilterCount > 0;
    const emptyTitle = document.getElementById('empty-title');
    const emptyDesc = document.getElementById('empty-desc');
    const actionBtn = document.getElementById('empty-action');
    if (emptyTitle) emptyTitle.textContent = hasFilters ? 'No manga matches your filters' : 'No manga yet';
    if (emptyDesc) emptyDesc.textContent = hasFilters ? 'Try adjusting your search or filters.' : 'Start building your collection by adding your first manga!';
    if (actionBtn) {
      if (hasFilters) {
        actionBtn.textContent = 'Clear Filters';
        actionBtn.href = '#list';
        actionBtn.onclick = () => {
          state.filters = { search: '', mangaStatus: 'All', myStatus: 'All', genres: [], excludeGenres: [] };
          state.listPage = 1;
          document.getElementById('search-input').value = '';
          document.getElementById('filter-manga-status').value = 'All';
          document.getElementById('filter-my-status').value = 'All';
          renderList();
          renderAllGenrePills();
          return false;
        };
      } else {
        actionBtn.textContent = 'Add Your First Manga';
        actionBtn.href = '#add';
        actionBtn.onclick = null;
      }
    }
    renderPagination(0, 1, 'pagination-bottom');
    return;
  }

  if (grid) grid.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  if (grid) {
    grid.innerHTML = pageItems.map(manga => {
      let statusClass = 'ongoing';
      if (manga.mangaStatus && manga.mangaStatus.startsWith('Completed')) statusClass = 'completed';
      else if (manga.mangaStatus && manga.mangaStatus.startsWith('Stopped')) statusClass = 'dropped';
      const myStatusClass = manga.myStatus && manga.myStatus.startsWith('Completed') ? 'status-completed'
        : manga.myStatus && manga.myStatus.startsWith('Dropped') ? 'status-dropped'
        : manga.myStatus && manga.myStatus.startsWith('In Chapter') ? 'status-inchapter'
        : 'status-default';
      const rating = manga.rating || 0;
      const year = manga.year ? `<div class="manga-year">${escapeHtml(manga.year)}</div>` : '';
      const stars = [];
      for (let i = 1; i <= 10; i++) {
        stars.push(`<span class="star-display ${i <= rating ? '' : 'empty'}" data-manga-id="${manga.id}" data-star="${i}">${i <= rating ? '&#9733;' : '&#9734;'}</span>`);
      }
      return `
        <div class="manga-card cute-card" data-manga-id="${manga.id}">
          <div class="manga-cover-wrap">
            ${manga.cover
              ? `<img src="${manga.cover}" alt="${escapeHtml(manga.title)}" class="manga-cover">`
              : `<div class="manga-cover-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg></div>`}
            <span class="manga-status-badge ${statusClass}">${manga.mangaStatus}</span>
          </div>
          <div class="manga-info">
            <div class="manga-title" title="${escapeHtml(manga.title)}">${escapeHtml(manga.title)}</div>
            ${year}
            <div class="manga-rating">${stars.join('')}<span class="rating-number">${rating}/10</span></div>
            <div class="manga-genres">
              ${manga.genre && manga.genre.slice(0, 3).map(g => `<span class="manga-genre-tag">${escapeHtml(g)}</span>`).join('')}
              ${manga.genre && manga.genre.length > 3 ? `<span class="manga-genre-tag" style="background:var(--muted);color:var(--muted-fg)">+${manga.genre.length - 3}</span>` : ''}
            </div>
            <span class="manga-my-status ${myStatusClass}">${escapeHtml(truncateStatus(manga.myStatus))}</span>
            <div class="manga-actions">
              <a href="#detail/${manga.id}" class="btn btn-primary" style="font-size:0.75rem" data-link>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                View
              </a>
              <button class="btn btn-danger manga-delete" data-id="${manga.id}" style="font-size:0.75rem;flex:0 0 36px;padding:0.45rem 0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.manga-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const manga = state.mangas.find(m => m.id === btn.dataset.id);
        if (manga && confirm(`Delete "${manga.title}"?`)) {
          state.mangas = state.mangas.filter(m => m.id !== btn.dataset.id);
          await deleteMangaFromCloud(btn.dataset.id);
          renderList();
        }
      });
    });
  }

  renderPagination(totalItems, currentPage, 'pagination-bottom');
}

function truncateStatus(status) {
  if (!status) return '';
  if (status.length > 25) return status.slice(0, 22) + '...';
  return status;
}

// ===== DETAIL PAGE =====
let detailRatingControl = null;

function setupDetailPage() {
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');

  if (saveBtn) saveBtn.addEventListener('click', saveEditing);
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    state.editMode = false; renderDetail();
  });

  const detailCoverInput = document.getElementById('detail-cover-input');
  if (detailCoverInput) {
    detailCoverInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      state.detailEdit.cover = await fileToBase64(file);
      const cover = document.getElementById('detail-cover');
      cover.src = state.detailEdit.cover;
      cover.classList.remove('hidden');
      document.getElementById('detail-cover-fallback').classList.add('hidden');
    });
  }

  const detailToggleGenre = document.getElementById('detail-toggle-genre-manager');
  if (detailToggleGenre) {
    detailToggleGenre.addEventListener('click', () => {
      state.showDetailGenreManager = !state.showDetailGenreManager;
      const manager = document.getElementById('detail-genre-manager');
      if (manager) manager.classList.toggle('hidden', !state.showDetailGenreManager);
    });
  }

  const detailAddGenreBtn = document.getElementById('detail-add-genre-btn');
  if (detailAddGenreBtn) {
    detailAddGenreBtn.addEventListener('click', () => {
      const input = document.getElementById('detail-new-genre');
      if (addGenre(input.value)) {
        input.value = '';
        renderDetailGenrePills();
        renderDetailManagedGenres();
      }
    });
  }

  const detailAddGenreToAllBtn = document.getElementById('detail-add-genre-to-all-btn');
  if (detailAddGenreToAllBtn) {
    detailAddGenreToAllBtn.addEventListener('click', () => {
      const input = document.getElementById('detail-new-genre');
      if (input.value.trim()) {
        addGenreToAllManga(input.value);
        input.value = '';
      }
    });
  }

  // Chapter controls (+/- buttons) for my status
  const chapterMinus = document.getElementById('detail-chapter-minus');
  const chapterPlus = document.getElementById('detail-chapter-plus');
  if (chapterMinus) {
    chapterMinus.addEventListener('click', () => {
      if (state.detailEdit.currentChapter > 0) {
        state.detailEdit.currentChapter--;
        document.getElementById('detail-chapter-display').textContent = state.detailEdit.currentChapter;
      }
    });
  }
  if (chapterPlus) {
    chapterPlus.addEventListener('click', () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      const maxChapter = getMaxChapterFromMangaStatus(manga?.mangaStatus);
      if (maxChapter !== null && state.detailEdit.currentChapter >= maxChapter) {
        showToast(`Cannot exceed manga's max chapter (${maxChapter})! ⚠️`, 'error');
        return;
      }
      state.detailEdit.currentChapter++;
      document.getElementById('detail-chapter-display').textContent = state.detailEdit.currentChapter;
    });
  }

  // Dropped chapter controls
  const droppedMinus = document.getElementById('detail-dropped-chapter-minus');
  const droppedPlus = document.getElementById('detail-dropped-chapter-plus');
  const droppedInput = document.getElementById('detail-edit-dropped-chapter');
  if (droppedMinus) {
    droppedMinus.addEventListener('click', () => {
      const val = parseInt(droppedInput.value) || 1;
      if (val > 0) droppedInput.value = val - 1;
    });
  }
  if (droppedPlus) {
    droppedPlus.addEventListener('click', () => {
      const val = parseInt(droppedInput.value) || 0;
      droppedInput.value = val + 1;
    });
  }

  // My status select change -> show/hide chapter controls
  const myStatusSelect = document.getElementById('detail-edit-my-status-select');
  if (myStatusSelect) {
    myStatusSelect.addEventListener('change', () => {
      const chapterControls = document.getElementById('detail-edit-chapter-controls');
      const droppedChapterField = document.getElementById('detail-edit-dropped-chapter-field');
      if (chapterControls) {
        chapterControls.classList.toggle('hidden', myStatusSelect.value !== 'In Chapter');
      }
      if (droppedChapterField) {
        droppedChapterField.classList.toggle('hidden', myStatusSelect.value !== 'Dropped');
      }
    });
  }

  // Manga status chapter controls (for Completed/Stopped)
  const detailMangaStatusSelect = document.getElementById('detail-edit-manga-status');
  const detailMangaStatusChapterField = document.getElementById('detail-edit-manga-status-chapter-field');
  const detailMangaStatusChapterInput = document.getElementById('detail-edit-manga-status-chapter');

  if (detailMangaStatusSelect) {
    detailMangaStatusSelect.addEventListener('change', () => {
      const needsChapter = detailMangaStatusSelect.value === 'Completed' || detailMangaStatusSelect.value === 'Stopped';
      if (detailMangaStatusChapterField) {
        detailMangaStatusChapterField.classList.toggle('hidden', !needsChapter);
      }
    });
  }

  const detailMangaStatusChapterMinus = document.getElementById('detail-manga-status-chapter-minus');
  const detailMangaStatusChapterPlus = document.getElementById('detail-manga-status-chapter-plus');

  if (detailMangaStatusChapterMinus) {
    detailMangaStatusChapterMinus.addEventListener('click', () => {
      const val = parseInt(detailMangaStatusChapterInput.value) || 1;
      if (val > 0) detailMangaStatusChapterInput.value = val - 1;
    });
  }
  if (detailMangaStatusChapterPlus) {
    detailMangaStatusChapterPlus.addEventListener('click', () => {
      const val = parseInt(detailMangaStatusChapterInput.value) || 0;
      detailMangaStatusChapterInput.value = val + 1;
    });
  }

  // Quick chapter controls in view mode
  const quickChapterMinus = document.getElementById('quick-chapter-minus');
  const quickChapterPlus = document.getElementById('quick-chapter-plus');
  const quickChapterInput = document.getElementById('quick-chapter-input');
  const quickChapterSave = document.getElementById('quick-chapter-save');

  if (quickChapterMinus) {
    quickChapterMinus.addEventListener('click', () => {
      const val = parseInt(quickChapterInput.value) || 1;
      if (val > 0) quickChapterInput.value = val - 1;
    });
  }
  if (quickChapterPlus) {
    quickChapterPlus.addEventListener('click', () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      const val = parseInt(quickChapterInput.value) || 0;
      const maxChapter = getMaxChapterFromMangaStatus(manga?.mangaStatus);
      if (maxChapter !== null && val >= maxChapter) {
        showToast(`Cannot exceed manga's max chapter (${maxChapter})! ⚠️`, 'error');
        return;
      }
      quickChapterInput.value = val + 1;
    });
  }
  if (quickChapterInput) {
    quickChapterInput.addEventListener('change', () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      const val = parseInt(quickChapterInput.value) || 0;
      const maxChapter = getMaxChapterFromMangaStatus(manga?.mangaStatus);
      if (maxChapter !== null && val > maxChapter) {
        quickChapterInput.value = maxChapter;
        showToast(`Capped at manga's max chapter (${maxChapter})`, 'error');
      }
      if (val < 0) quickChapterInput.value = 0;
    });
  }
  if (quickChapterSave) {
    quickChapterSave.addEventListener('click', async () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      if (!manga || !quickChapterInput.value) return;
      let chapterNum = parseInt(quickChapterInput.value);
      const maxChapter = getMaxChapterFromMangaStatus(manga.mangaStatus);
      if (maxChapter !== null) {
        chapterNum = Math.min(chapterNum, maxChapter);
        chapterNum = Math.max(0, chapterNum);
      }
      manga.myStatus = `In Chapter ${chapterNum}`;
      await saveMangaToCloud(manga);
      showToast(`Updated to chapter ${chapterNum}! 📖`);
      renderDetail();
    });
  }

  // Quick dropped chapter controls
  const quickDroppedMinus = document.getElementById('quick-dropped-minus');
  const quickDroppedPlus = document.getElementById('quick-dropped-plus');
  const quickDroppedInput = document.getElementById('quick-dropped-input');
  const quickDroppedSave = document.getElementById('quick-dropped-save');

  if (quickDroppedMinus) {
    quickDroppedMinus.addEventListener('click', () => {
      const val = parseInt(quickDroppedInput.value) || 1;
      if (val > 0) quickDroppedInput.value = val - 1;
    });
  }
  if (quickDroppedPlus) {
    quickDroppedPlus.addEventListener('click', () => {
      const val = parseInt(quickDroppedInput.value) || 0;
      quickDroppedInput.value = val + 1;
    });
  }
  if (quickDroppedSave) {
    quickDroppedSave.addEventListener('click', async () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      if (!manga || !quickDroppedInput.value) return;
      let chapterNum = parseInt(quickDroppedInput.value);
      chapterNum = Math.max(0, chapterNum);
      manga.myStatus = `Dropped (at chapter ${chapterNum})`;
      await saveMangaToCloud(manga);
      showToast(`Updated dropped at chapter ${chapterNum}! 📖`);
      renderDetail();
    });
  }

  document.querySelectorAll('#page-detail .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab('detail', btn.dataset.detailTab));
  });

  const detailAddChapter = document.getElementById('detail-add-chapter-btn');
  if (detailAddChapter) {
    detailAddChapter.addEventListener('click', async () => {
      const num = document.getElementById('detail-chapter-num').value.trim();
      const reason = document.getElementById('detail-chapter-reason').value.trim();
      if (!num || !reason) return;

      if (state.editMode) {
        state.detailEdit.chapters.push({ number: parseInt(num), reason });
        renderChapters('detail-chapters-list', state.detailEdit.chapters, true);
        updateTabCount('detail-tab-count-chapters', state.detailEdit.chapters.length);
      } else {
        // View mode - save directly to manga
        const manga = state.mangas.find(m => m.id === state.selectedMangaId);
        if (manga) {
          if (!manga.favoriteChapters) manga.favoriteChapters = [];
          manga.favoriteChapters.push({ number: parseInt(num), reason });
          await saveMangaToCloud(manga);
          renderChapters('detail-chapters-list', manga.favoriteChapters, false);
          updateTabCount('detail-tab-count-chapters', manga.favoriteChapters.length);
          showToast(`Added chapter ${num} to favorites! ⭐`);
        }
      }
      document.getElementById('detail-chapter-num').value = '';
      document.getElementById('detail-chapter-reason').value = '';
    });
  }

  const detailPhotoUpload = document.getElementById('detail-photo-upload');
  const detailPhotoInput = document.getElementById('detail-photo-input');

  if (detailPhotoUpload) {
    detailPhotoUpload.addEventListener('click', () => {
      detailPhotoInput.click();
    });
  }

  if (detailPhotoInput) {
    detailPhotoInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      // Process files sequentially to avoid memory/canvas issues with many files
      const dataUrls = [];
      for (const file of files) {
        try {
          const dataUrl = await fileToBase64(file);
          if (dataUrl) dataUrls.push(dataUrl);
        } catch (err) {
          console.error('Failed to process file:', file.name, err);
        }
      }

      if (dataUrls.length === 0) {
        showToast('Failed to process photos. Try fewer at a time.', 'error');
        detailPhotoInput.value = '';
        return;
      }

      if (state.editMode) {
        state.detailEdit.photos.push(...dataUrls);
        renderPhotos('detail-photo-grid', state.detailEdit.photos, true);
        updateTabCount('detail-tab-count-photos', state.detailEdit.photos.length);
      } else {
        // View mode - save directly to manga
        const manga = state.mangas.find(m => m.id === state.selectedMangaId);
        if (manga) {
          if (!manga.favoritePhotos) manga.favoritePhotos = [];
          manga.favoritePhotos.push(...dataUrls);
          await saveMangaToCloud(manga);
          renderPhotos('detail-photo-grid', manga.favoritePhotos, false);
          updateTabCount('detail-tab-count-photos', manga.favoritePhotos.length);
          showToast(`Added ${dataUrls.length} photo${dataUrls.length > 1 ? 's' : ''}! 📸`);
        }
      }
      detailPhotoInput.value = '';
    });
  }
}

function renderDetail() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) { navigate('list'); return; }

  const coverEl = document.getElementById('detail-cover');
  const fallbackEl = document.getElementById('detail-cover-fallback');
  if (manga.cover) {
    if (coverEl) { coverEl.src = manga.cover; coverEl.classList.remove('hidden'); }
    if (fallbackEl) fallbackEl.classList.add('hidden');
  } else {
    if (coverEl) { coverEl.src = ''; coverEl.classList.add('hidden'); }
    if (fallbackEl) fallbackEl.classList.remove('hidden');
  }

  const coverOverlay = document.getElementById('cover-change-overlay');
  if (coverOverlay) coverOverlay.classList.toggle('hidden', !state.editMode);

  const readonlyEl = document.getElementById('detail-readonly');
  const editEl = document.getElementById('detail-edit');
  if (readonlyEl) readonlyEl.classList.toggle('hidden', state.editMode);
  if (editEl) editEl.classList.toggle('hidden', !state.editMode);

  const actionsEl = document.getElementById('detail-actions');
  if (actionsEl) {
    actionsEl.innerHTML = state.editMode
      ? `<button class="btn btn-danger" id="detail-cancel-btn">&#10005; Cancel</button>`
      : `<button class="btn btn-danger" id="detail-delete-btn">&#128465; Delete</button>
         <button class="btn btn-edit" id="detail-edit-btn">&#9998; Edit</button>`;
  }

  if (state.editMode) {
    const cancelBtn = document.getElementById('detail-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        state.editMode = false; renderDetail();
      });
    }
  } else {
    const editBtn = document.getElementById('detail-edit-btn');
    const deleteBtn = document.getElementById('detail-delete-btn');
    if (editBtn) editBtn.addEventListener('click', startEditing);
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Delete "${manga.title}"? This cannot be undone.`)) {
          state.mangas = state.mangas.filter(m => m.id !== state.selectedMangaId);
          await deleteMangaFromCloud(state.selectedMangaId);
          navigate('list');
        }
      });
    }
  }

  if (!state.editMode) {
    const titleEl = document.getElementById('detail-view-title');
    if (titleEl) titleEl.textContent = manga.title;

    const otherEl = document.getElementById('detail-view-other');
    if (otherEl) {
      if (manga.otherTitles) {
        const altTitles = autoSplitTitles(manga.otherTitles, manga.title);
        if (altTitles.length > 0) {
          otherEl.innerHTML = altTitles.map(t => `<span class="alt-title-tag">${escapeHtml(t)}</span>`).join('');
          otherEl.style.display = 'flex';
        } else {
          otherEl.style.display = 'none';
        }
      } else { otherEl.style.display = 'none'; }
    }

    const myClass = manga.myStatus && manga.myStatus.startsWith('Completed') ? 'my-completed'
      : manga.myStatus && manga.myStatus.startsWith('Dropped') ? 'my-dropped'
      : manga.myStatus && manga.myStatus.startsWith('In Chapter') ? 'my-inchapter' : 'my-default';

    // Determine manga status badge class
    let mangaStatusClass = 'ongoing';
    if (manga.mangaStatus && manga.mangaStatus.startsWith('Completed')) mangaStatusClass = 'completed';
    else if (manga.mangaStatus && manga.mangaStatus.startsWith('Stopped')) mangaStatusClass = 'stopped';

    const badgesEl = document.getElementById('detail-view-badges');
    if (badgesEl) {
      badgesEl.innerHTML = `
        <span class="detail-badge ${mangaStatusClass}">${manga.mangaStatus}</span>
        <span class="detail-badge ${myClass}">${manga.myStatus}</span>`;
    }

    // View mode - setup quick chapter controls
    const quickChapterControls = document.getElementById('quick-chapter-controls');
    const quickChapterInput = document.getElementById('quick-chapter-input');
    const quickDroppedControls = document.getElementById('quick-dropped-controls');
    const quickDroppedInput = document.getElementById('quick-dropped-input');

    if (quickChapterControls && quickChapterInput) {
      const isInChapter = manga.myStatus && manga.myStatus.startsWith('In Chapter');
      quickChapterControls.style.display = isInChapter ? 'block' : 'none';
      if (isInChapter) {
        const match = manga.myStatus.match(/In Chapter (\d+)/);
        quickChapterInput.value = match ? parseInt(match[1]) : 0;
      }
      // Show max chapter hint if available
      const maxChapter = getMaxChapterFromMangaStatus(manga.mangaStatus);
      const label = quickChapterControls.querySelector('.field-label');
      if (label && maxChapter !== null) {
        label.textContent = `Quick Update Chapter (0 - ${maxChapter})`;
      } else if (label) {
        label.textContent = 'Quick Update Chapter';
      }
    }

    if (quickDroppedControls && quickDroppedInput) {
      const isDropped = manga.myStatus && manga.myStatus.startsWith('Dropped');
      quickDroppedControls.style.display = isDropped ? 'block' : 'none';
      if (isDropped) {
        const match = manga.myStatus.match(/Dropped \(at chapter (\d+)\)/);
        quickDroppedInput.value = match ? parseInt(match[1]) : 0;
      }
    }

    // Rating display with quick edit
    const ratingEl = document.getElementById('detail-view-rating');
    renderStarDisplay(ratingEl, manga.rating || 0, 'large');

    // Add click handlers for quick rating in readonly view
    if (ratingEl) {
      ratingEl.style.cursor = 'pointer';
      const stars = ratingEl.querySelectorAll('.star-display');
      stars.forEach((star, idx) => {
        star.style.cursor = 'pointer';
        star.addEventListener('click', async () => {
          const newRating = idx + 1;
          manga.rating = newRating;
          await saveMangaToCloud(manga);
          showToast(`Rated "${manga.title}" ${newRating}/10 ★`);
          renderDetail();
        });
      });
    }

    // Year display
    const infoEl = document.getElementById('detail-view-badges');
    if (infoEl && manga.year) {
      let yearEl = document.getElementById('detail-year-display');
      if (!yearEl) {
        yearEl = document.createElement('div');
        yearEl.id = 'detail-year-display';
        yearEl.className = 'detail-year';
        infoEl.after(yearEl);
      }
      yearEl.textContent = `Year: ${escapeHtml(manga.year)}`;
      yearEl.style.display = 'block';
    } else {
      const existingYear = document.getElementById('detail-year-display');
      if (existingYear) existingYear.style.display = 'none';
    }

    const genresEl = document.getElementById('detail-view-genres');
    if (genresEl) {
      genresEl.innerHTML = manga.genre && manga.genre.map(g => `<span class="detail-genre-tag">${escapeHtml(g)}</span>`).join('');
    }

    const summaryEl = document.getElementById('detail-view-summary');
    if (summaryEl) {
      if (manga.summary) { summaryEl.innerHTML = `<p>${escapeHtml(manga.summary)}</p>`; summaryEl.style.display = 'block'; }
      else { summaryEl.style.display = 'none'; }
    }
  } else {
    const editTitle = document.getElementById('detail-edit-title');
    const editOther = document.getElementById('detail-edit-other');
    const editMangaStatus = document.getElementById('detail-edit-manga-status');
    const editMyStatusSelect = document.getElementById('detail-edit-my-status-select');
    const editSummary = document.getElementById('detail-edit-summary');
    const editYear = document.getElementById('detail-edit-year');

    if (editTitle) editTitle.value = state.detailEdit.title;
    if (editOther) editOther.value = state.detailEdit.otherTitles;
    if (editMangaStatus) editMangaStatus.value = state.detailEdit.mangaStatus;
    if (editMyStatusSelect) editMyStatusSelect.value = state.detailEdit.myStatus;
    if (editSummary) editSummary.value = state.detailEdit.summary;
    if (editYear) editYear.value = state.detailEdit.year || '';

    // Setup manga status chapter field visibility and value
    const mangaStatusChapterField = document.getElementById('detail-edit-manga-status-chapter-field');
    const mangaStatusChapterInput = document.getElementById('detail-edit-manga-status-chapter');
    if (mangaStatusChapterField) {
      const needsChapter = state.detailEdit.mangaStatus === 'Completed' || state.detailEdit.mangaStatus === 'Stopped';
      mangaStatusChapterField.classList.toggle('hidden', !needsChapter);
      if (mangaStatusChapterInput) {
        mangaStatusChapterInput.value = needsChapter ? (state.detailEdit.mangaStatusChapter || '') : '';
      }
    }

    // Setup my status chapter controls visibility based on status
    const chapterControls = document.getElementById('detail-edit-chapter-controls');
    const droppedChapterField = document.getElementById('detail-edit-dropped-chapter-field');
    if (chapterControls) {
      const isInChapter = state.detailEdit.myStatus && state.detailEdit.myStatus.startsWith('In Chapter');
      chapterControls.classList.toggle('hidden', !isInChapter);
      if (isInChapter) {
        const match = state.detailEdit.myStatus.match(/In Chapter (\d+)/);
        state.detailEdit.currentChapter = match ? parseInt(match[1]) : 1;
        document.getElementById('detail-chapter-display').textContent = state.detailEdit.currentChapter;
      }
    }
    if (droppedChapterField) {
      const isDropped = state.detailEdit.myStatus && state.detailEdit.myStatus.startsWith('Dropped');
      droppedChapterField.classList.toggle('hidden', !isDropped);
      const droppedInput = document.getElementById('detail-edit-dropped-chapter');
      if (droppedInput) {
        droppedInput.value = isDropped ? (state.detailEdit.droppedChapter || '') : '';
      }
    }

    // Setup star rating for edit
    if (!detailRatingControl) {
      detailRatingControl = setupStarRating('detail-rating-stars', 'detail-rating-input', 'detail-rating-value', state.detailEdit.rating || 0, (val) => {
        state.detailEdit.rating = val;
      });
    } else {
      detailRatingControl.setValue(state.detailEdit.rating || 0);
    }

    renderDetailGenrePills();
    renderDetailManagedGenres();
  }

  const chapterEditRow = document.getElementById('detail-chapter-edit-row');
  const photoUpload = document.getElementById('detail-photo-upload');
  // Chapter edit row and photo upload are now always visible (for quick add in view mode)
  // But we still need to handle the chapter input visibility for edit mode vs view mode
  if (chapterEditRow) {
    // Always show the chapter add row
    chapterEditRow.classList.remove('hidden');
  }
  if (photoUpload) {
    // Always show the photo upload area
    photoUpload.classList.remove('hidden');
  }

  const chapters = state.editMode ? state.detailEdit.chapters : manga.favoriteChapters;
  const photos = state.editMode ? state.detailEdit.photos : manga.favoritePhotos;

  renderChapters('detail-chapters-list', chapters, state.editMode);
  renderPhotos('detail-photo-grid', photos, state.editMode);
  updateTabCount('detail-tab-count-chapters', chapters.length);
  updateTabCount('detail-tab-count-photos', photos.length);
}

function startEditing() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) return;
  state.editMode = true;
  state.showDetailGenreManager = false;

  // Parse current chapter from my status
  let currentChapter = 0;
  if (manga.myStatus && manga.myStatus.startsWith('In Chapter')) {
    const match = manga.myStatus.match(/In Chapter (\d+)/);
    if (match) currentChapter = parseInt(match[1]);
  }

  // Parse manga status chapter
  let mangaStatusChapter = '';
  let mangaStatusClean = manga.mangaStatus || 'Ongoing';
  if (manga.mangaStatus && (manga.mangaStatus.includes('(at chapter') || manga.mangaStatus.includes('Completed (at chapter') || manga.mangaStatus.includes('Stopped (at chapter'))) {
    const match = manga.mangaStatus.match(/(Completed|Stopped) \(at chapter (\d+)\)/);
    if (match) {
      mangaStatusChapter = parseInt(match[2]);
      mangaStatusClean = match[1];
    }
  }

  // Parse dropped chapter from my status
  let droppedChapter = '';
  if (manga.myStatus && manga.myStatus.startsWith('Dropped') && manga.myStatus.includes('(at chapter')) {
    const match = manga.myStatus.match(/Dropped \(at chapter (\d+)\)/);
    if (match) droppedChapter = match[1];
  }

  state.detailEdit = {
    title: manga.title, 
    otherTitles: formatTitlesForEdit(manga.otherTitles || ''),
    mangaStatus: mangaStatusClean, 
    myStatus: manga.myStatus,
    summary: manga.summary || '', 
    cover: manga.cover || '',
    rating: manga.rating || 0, 
    year: manga.year || '',
    currentChapter: currentChapter,
    mangaStatusChapter: mangaStatusChapter,
    droppedChapter: droppedChapter,
    chapters: [...(manga.favoriteChapters || [])],
    photos: [...(manga.favoritePhotos || [])],
    selectedGenres: [...(manga.genre || [])],
  };
  renderDetail();
}

async function saveEditing() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) return;

  const editTitle = document.getElementById('detail-edit-title');
  const editOther = document.getElementById('detail-edit-other');
  const editMangaStatus = document.getElementById('detail-edit-manga-status');
  const editMyStatusSelect = document.getElementById('detail-edit-my-status-select');
  const editSummary = document.getElementById('detail-edit-summary');
  const editYear = document.getElementById('detail-edit-year');

  const newTitle = editTitle ? editTitle.value.trim() : manga.title;
  const newOtherTitles = editOther ? editOther.value.trim() : manga.otherTitles;

  // Check for duplicates when editing (exclude current manga)
  const dupCheck = checkDuplicate(newTitle, newOtherTitles, manga.id);
  if (dupCheck.duplicate) {
    const confirmed = confirm(`A manga titled "${dupCheck.manga.title}" already exists in your collection (matched by ${dupCheck.matchType}). Do you still want to save?`);
    if (!confirmed) return;
  }

  manga.title = newTitle;
  manga.otherTitles = newOtherTitles;

  // Handle manga status with chapter number for Completed/Stopped
  let mangaStatusVal = editMangaStatus ? editMangaStatus.value : manga.mangaStatus;
  if (mangaStatusVal === 'Completed' || mangaStatusVal === 'Stopped') {
    const chapInput = document.getElementById('detail-edit-manga-status-chapter');
    const chap = chapInput ? chapInput.value.trim() : '';
    if (chap) mangaStatusVal = `${mangaStatusVal} (at chapter ${chap})`;
  }
  manga.mangaStatus = mangaStatusVal;

  // Handle my status with chapter number
  let myStatusVal = editMyStatusSelect ? editMyStatusSelect.value : manga.myStatus;
  if (myStatusVal === 'In Chapter') {
    let chapterNum = state.detailEdit.currentChapter;
    const maxChapter = getMaxChapterFromMangaStatus(manga.mangaStatus);
    if (maxChapter !== null) {
      chapterNum = Math.min(chapterNum, maxChapter);
      chapterNum = Math.max(0, chapterNum);
    }
    myStatusVal = `In Chapter ${chapterNum}`;
  } else if (myStatusVal === 'Dropped') {
    const chapInput = document.getElementById('detail-edit-dropped-chapter');
    const chap = chapInput ? chapInput.value.trim() : '';
    if (chap) myStatusVal = `Dropped (at chapter ${chap})`;
  }
  manga.myStatus = myStatusVal;

  manga.summary = editSummary ? editSummary.value.trim() : manga.summary;
  manga.cover = state.detailEdit.cover;
  manga.rating = state.detailEdit.rating || 0;
  manga.year = editYear ? editYear.value.trim() : manga.year;
  manga.favoriteChapters = [...state.detailEdit.chapters];
  manga.favoritePhotos = [...state.detailEdit.photos];
  manga.genre = [...state.detailEdit.selectedGenres];
  await saveMangaToCloud(manga);
  state.editMode = false;
  renderDetail();
}

function renderDetailGenrePills() {
  renderGenrePills('detail-genre-pills', state.detailEdit.selectedGenres, (g) => {
    toggleArray(state.detailEdit.selectedGenres, g);
    renderDetailGenrePills();
  });
}

function renderDetailManagedGenres() {
  const container = document.getElementById('detail-genre-list');
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('span');
    pill.className = 'genre-pill managed';
    pill.innerHTML = `${genre} <span class="remove">&times;</span>`;
    pill.querySelector('.remove').addEventListener('click', () => {
      deleteGenre(genre);
      renderDetailGenrePills();
      renderDetailManagedGenres();
    });
    container.appendChild(pill);
  });
}

// ===== UTILS =====
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ===== AUTO-SPLIT ALTERNATIVE TITLES =====
function autoSplitTitles(text, mangaTitle = '') {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  // If already has newlines, respect them
  if (trimmed.includes('\n')) {
    return trimmed.split('\n').map(t => t.trim()).filter(t => t.length > 0);
  }

  // If already has commas, split by commas
  if (trimmed.includes(',')) {
    return trimmed.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  // Best-effort auto-split for space-separated blob
  const titles = [];
  let current = '';
  const words = trimmed.split(/\s+/);

  // Heuristic 1: Repeated prefix pattern (e.g., "Yona" appears multiple times)
  if (mangaTitle) {
    const titleWords = mangaTitle.trim().split(/\s+/);
    const firstWord = titleWords[0];
    if (firstWord && firstWord.length > 2) {
      // Find all positions where the first word of title appears again
      const positions = [];
      for (let i = 1; i < words.length; i++) {
        if (words[i].toLowerCase() === firstWord.toLowerCase() ||
            words[i].toLowerCase().startsWith(firstWord.toLowerCase())) {
          positions.push(i);
        }
      }
      if (positions.length > 0) {
        let start = 0;
        for (const pos of positions) {
          const title = words.slice(start, pos).join(' ').trim();
          if (title.length > 0) titles.push(title);
          start = pos;
        }
        const lastTitle = words.slice(start).join(' ').trim();
        if (lastTitle.length > 0) titles.push(lastTitle);
        if (titles.length > 1) return titles;
      }
    }
  }

  // Heuristic 2: Language/script boundary detection
  function getScript(char) {
    const code = char.charCodeAt(0);
    if (code >= 0x0041 && code <= 0x007A) return 'latin'; // Basic Latin
    if (code >= 0x00C0 && code <= 0x024F) return 'latin-ext'; // Latin Extended
    if (code >= 0x0370 && code <= 0x03FF) return 'greek';
    if (code >= 0x0400 && code <= 0x04FF) return 'cyrillic';
    if (code >= 0x0590 && code <= 0x05FF) return 'hebrew';
    if (code >= 0x0600 && code <= 0x06FF) return 'arabic';
    if (code >= 0x0900 && code <= 0x097F) return 'devanagari';
    if (code >= 0x0E00 && code <= 0x0E7F) return 'thai';
    if (code >= 0x3040 && code <= 0x309F) return 'hiragana';
    if (code >= 0x30A0 && code <= 0x30FF) return 'katakana';
    if (code >= 0x4E00 && code <= 0x9FFF) return 'cjk';
    if (code >= 0xAC00 && code <= 0xD7AF) return 'korean';
    if (code >= 0x10A0 && code <= 0x10FF) return 'georgian';
    if (code >= 0x0400 && code <= 0x04FF) return 'cyrillic';
    return 'other';
  }

  let lastScript = null;
  let splitPoints = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.length === 0) continue;
    const firstChar = word.charAt(0);
    const script = getScript(firstChar);

    if (lastScript && lastScript !== 'latin' && lastScript !== 'latin-ext' && 
        script !== 'latin' && script !== 'latin-ext' && 
        lastScript !== script) {
      // Script switch detected
      splitPoints.push(i);
    }
    lastScript = script;
  }

  if (splitPoints.length > 0) {
    let start = 0;
    for (const pos of splitPoints) {
      const title = words.slice(start, pos).join(' ').trim();
      if (title.length > 0) titles.push(title);
      start = pos;
    }
    const lastTitle = words.slice(start).join(' ').trim();
    if (lastTitle.length > 0) titles.push(lastTitle);
    if (titles.length > 1) return titles;
  }

  // Heuristic 3: Capitalization pattern
  // Look for capital letter after lowercase words (new title start)
  splitPoints = [];
  let lowercaseCount = 0;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const prevWord = words[i - 1];

    if (word.length > 0 && word[0] === word[0].toUpperCase() && 
        prevWord && prevWord.length > 0 && 
        prevWord[0] === prevWord[0].toLowerCase() &&
        !prevWord.match(/^(the|a|an|of|in|on|at|to|for|with|and|or|but|from|by)$/i)) {
      lowercaseCount++;
      if (lowercaseCount >= 2) {
        splitPoints.push(i);
        lowercaseCount = 0;
      }
    } else {
      lowercaseCount = 0;
    }
  }

  if (splitPoints.length > 0) {
    titles.length = 0;
    let start = 0;
    for (const pos of splitPoints) {
      const title = words.slice(start, pos).join(' ').trim();
      if (title.length > 0) titles.push(title);
      start = pos;
    }
    const lastTitle = words.slice(start).join(' ').trim();
    if (lastTitle.length > 0) titles.push(lastTitle);
    if (titles.length > 1) return titles;
  }

  // Fallback: return as single title
  return [trimmed];
}

function formatTitlesForDisplay(text, mangaTitle = '') {
  const titles = autoSplitTitles(text, mangaTitle);
  return titles;
}

function formatTitlesForEdit(text) {
  const titles = autoSplitTitles(text);
  return titles.join('\n');
}

function normalizeTitle(title) {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

function checkDuplicate(title, otherTitles, excludeId = null) {
  const normalizedTitle = normalizeTitle(title);
  const altTitles = autoSplitTitles(otherTitles, title);
  const normalizedAlts = altTitles.map(t => normalizeTitle(t));

  for (const manga of state.mangas) {
    if (excludeId && manga.id === excludeId) continue;

    // Check main title
    if (normalizeTitle(manga.title) === normalizedTitle) {
      return { duplicate: true, manga, matchType: 'title' };
    }

    // Check alternative titles of existing manga
    const existingAlts = autoSplitTitles(manga.otherTitles || '', manga.title);
    for (const alt of existingAlts) {
      if (normalizeTitle(alt) === normalizedTitle) {
        return { duplicate: true, manga, matchType: 'alternative title' };
      }
    }

    // Check if any of our alternative titles match existing manga's main title
    for (const ourAlt of normalizedAlts) {
      if (normalizeTitle(manga.title) === ourAlt) {
        return { duplicate: true, manga, matchType: 'alternative title matches existing' };
      }
      // Check if our alternative title matches existing alternative titles
      for (const existingAlt of existingAlts) {
        if (normalizeTitle(existingAlt) === ourAlt) {
          return { duplicate: true, manga, matchType: 'alternative title' };
        }
      }
    }
  }

  return { duplicate: false };
}

// Extract max chapter from manga status like "Completed (at chapter 100)"
function getMaxChapterFromMangaStatus(mangaStatus) {
  if (!mangaStatus) return null;
  const match = mangaStatus.match(/at chapter (\d+)/);
  return match ? parseInt(match[1]) : null;
}

// ===== START =====
document.addEventListener('DOMContentLoaded', setupAuth);
