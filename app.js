/**
 * The Manga Corner — Firebase Cloud Sync + Google Auth Version
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

// ===== YOUR FIREBASE CONFIG =====
// ⚠️ This key is restricted to ines-guizani.github.io only — safe to leave here
const firebaseConfig = {
  apiKey: "AIzaSyA4AqPDWurGDj321-B8DKQRuGtQfl8QULc",
  authDomain: "manga-corner-b0af9.firebaseapp.com",
  projectId: "manga-corner-b0af9",
  storageBucket: "manga-corner-b0af9.firebasestorage.app",
  messagingSenderId: "493110609888",
  appId: "1:493110609888:web:c94b163c51dce675758d85"
};

// ===== YOUR GOOGLE ACCOUNT EMAIL =====
// Only this email can access the app
const OWNER_EMAIL = "inesguizani348@gmail.com";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const MANGAS_COL = collection(db, "mangas");

// ===== CONFIG =====
const DEFAULT_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Isekai', 'Mystery', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
];
const THEME_KEY = 'mangaCorner_theme';

// ===== STATE =====
let state = {
  mangas: [],
  genres: [],
  currentPage: 'home',
  selectedMangaId: null,
  editMode: false,
  addForm: { chapters: [], photos: [], comments: [], cover: '', selectedGenres: [] },
  detailEdit: { chapters: [], photos: [], comments: [], cover: '', selectedGenres: [] },
  filters: { search: '', mangaStatus: 'All', myStatus: 'All', genres: [] },
  showFilters: false,
  showGenreManager: false,
  currentUser: null,
};

// ===== AUTH =====
function setupAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Someone is logged in — check it's YOU
      if (user.email !== OWNER_EMAIL) {
        signOut(auth);
        showLoginScreen("⛔ Access denied. This app is private.");
        return;
      }
      // It's you! Hide login, show app
      state.currentUser = user;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-wrapper').style.display = 'block';
      document.getElementById('user-avatar').src = user.photoURL || '';
      document.getElementById('user-avatar').style.display = 'block';
      document.getElementById('user-name').textContent = user.displayName || user.email;
      loadAppData();
    } else {
      // No one logged in — show login screen
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

// ===== LOAD APP DATA (called after successful login) =====
async function loadAppData() {
  showLoadingScreen(true);
  try {
    const [cloudMangas, cloudGenres] = await Promise.all([
      loadMangasFromCloud(),
      loadGenresFromCloud()
    ]);
    state.mangas = cloudMangas;
    if (cloudGenres && cloudGenres.length > 0) {
      state.genres = cloudGenres;
    } else {
      state.genres = [...DEFAULT_GENRES];
      await saveGenresToCloud(state.genres);
    }
    await migrateLocalStorageToCloud();
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
  handleRoute();
  setupRealtimeSync();
}

// ===== CLOUD FUNCTIONS =====
async function saveMangaToCloud(manga) {
  try {
    showSyncing();
    await setDoc(doc(db, "mangas", manga.id), manga);
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
        favoriteChapters: manga.favoriteChapters || [],
        favoritePhotos: manga.favoritePhotos || [],
        comments: manga.comments || [],
        createdAt: manga.createdAt || new Date().toISOString(),
      };
      await setDoc(doc(db, "mangas", clean.id), clean);
      state.mangas.push(clean);
    }
  }
  localStorage.setItem('mangaCorner_migrated_to_cloud', 'true');
}

// ===== REAL-TIME SYNC =====
function setupRealtimeSync() {
  onSnapshot(MANGAS_COL, (snapshot) => {
    const incoming = snapshot.docs.map(d => d.data());
    if (incoming.length !== state.mangas.length) {
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

// ===== GENRES =====
function renderGenrePills(containerId, selectedGenres, onToggle) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `genre-pill ${selectedGenres.includes(genre) ? 'active' : ''}`;
    pill.textContent = genre;
    pill.addEventListener('click', () => onToggle(genre));
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
    renderGenrePills('genre-pills', state.addForm.selectedGenres, (g) => {
      toggleArray(state.addForm.selectedGenres, g);
      renderAllGenrePills();
    });
    renderManagedGenres('genre-list');
  }
  if (state.currentPage === 'list') {
    renderGenrePills('filter-genre-pills', state.filters.genres, (g) => {
      toggleArray(state.filters.genres, g);
      renderList();
      renderAllGenrePills();
    });
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
  if (added) saveGenresToCloud(state.genres);
  return added;
}

function deleteGenre(genre) {
  if (!confirm(`Delete genre "${genre}"?`)) return;
  state.genres = state.genres.filter(g => g !== genre);
  saveGenresToCloud(state.genres);
  state.mangas.forEach(m => {
    m.genre = m.genre.filter(g => g !== genre);
    saveMangaToCloud(m);
  });
  state.addForm.selectedGenres = state.addForm.selectedGenres.filter(g => g !== genre);
  state.filters.genres = state.filters.genres.filter(g => g !== genre);
  state.detailEdit.selectedGenres = state.detailEdit.selectedGenres.filter(g => g !== genre);
}

// ===== FILE TO BASE64 =====
function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ===== ADD PAGE =====
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

  const myStatus = document.getElementById('my-status');
  myStatus.addEventListener('change', () => {
    document.getElementById('dropped-field').classList.toggle('hidden', myStatus.value !== 'Dropped');
    document.getElementById('current-field').classList.toggle('hidden', myStatus.value !== 'In Chapter');
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

  document.getElementById('photo-upload').addEventListener('click', () => {
    document.getElementById('photo-input').click();
  });
  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const dataUrls = await Promise.all(files.map(fileToBase64));
    state.addForm.photos.push(...dataUrls);
    renderPhotos('photo-grid', state.addForm.photos, true);
    updateTabCount('tab-count-photos', state.addForm.photos.length);
  });

  document.getElementById('add-comment-btn').addEventListener('click', () => {
    const text = document.getElementById('comment-input').value.trim();
    if (!text) return;
    state.addForm.comments.push(text);
    document.getElementById('comment-input').value = '';
    renderComments('comments-list', state.addForm.comments, true);
    updateTabCount('tab-count-comments', state.addForm.comments.length);
  });

  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value.trim();
    if (!title) { alert('Please enter a title!'); return; }

    const myStatusEl = document.getElementById('my-status');
    let myStatusVal = myStatusEl.value;
    if (myStatusVal === 'Dropped') {
      const chap = document.getElementById('dropped-chapter').value.trim();
      if (chap) myStatusVal = `Dropped (at chapter ${chap})`;
    } else if (myStatusVal === 'In Chapter') {
      const chap = document.getElementById('current-chapter').value.trim();
      if (chap) myStatusVal = `In Chapter ${chap}`;
    }

    const manga = {
      id: `manga_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      title,
      otherTitles: document.getElementById('other-titles').value.trim(),
      genre: [...state.addForm.selectedGenres],
      mangaStatus: document.getElementById('manga-status').value,
      myStatus: myStatusVal,
      summary: document.getElementById('summary').value.trim(),
      cover: state.addForm.cover,
      favoriteChapters: [...state.addForm.chapters],
      favoritePhotos: [...state.addForm.photos],
      comments: [...state.addForm.comments],
      createdAt: new Date().toISOString(),
    };

    state.mangas.push(manga);
    await saveMangaToCloud(manga);
    alert('Manga saved to cloud! ☁️');
    navigate('list');
  });
}

function resetAddForm() {
  state.addForm = { chapters: [], photos: [], comments: [], cover: '', selectedGenres: [] };
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
  switchTab('add', 'chapters');
  renderChapters('chapters-list', [], true);
  renderPhotos('photo-grid', [], true);
  renderComments('comments-list', [], true);
  updateTabCount('tab-count-chapters', 0);
  updateTabCount('tab-count-photos', 0);
  updateTabCount('tab-count-comments', 0);
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
      ${editable ? `<button class="item-delete" data-idx="${i}" title="Remove">&#10005;</button>` : ''}
    </div>
  `).join('');
  if (editable) {
    container.querySelectorAll('.item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        chapters.splice(parseInt(btn.dataset.idx), 1);
        renderChapters(containerId, chapters, editable);
        updateTabCount(containerId === 'chapters-list' ? 'tab-count-chapters' : 'detail-tab-count-chapters', chapters.length);
      });
    });
  }
}

function renderPhotos(containerId, photos, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (photos.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = photos.map((src, i) => `
    <div class="photo-item">
      <img src="${src}" alt="Photo ${i + 1}">
      ${editable ? `<button class="photo-remove" data-idx="${i}" title="Remove">&#10005;</button>` : ''}
    </div>
  `).join('');
  if (editable) {
    container.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        photos.splice(parseInt(btn.dataset.idx), 1);
        renderPhotos(containerId, photos, editable);
        updateTabCount(containerId === 'photo-grid' ? 'tab-count-photos' : 'detail-tab-count-photos', photos.length);
      });
    });
  }
}

function renderComments(containerId, comments, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (comments.length === 0) {
    container.innerHTML = '<p class="empty-hint">No comments yet. Share your thoughts!</p>';
    return;
  }
  container.innerHTML = comments.map((c, i) => `
    <div class="comment-bubble">
      <p>${escapeHtml(c)}</p>
      ${editable ? `<button class="item-delete" data-idx="${i}" title="Remove">&#10005;</button>` : ''}
    </div>
  `).join('');
  if (editable) {
    container.querySelectorAll('.item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        comments.splice(parseInt(btn.dataset.idx), 1);
        renderComments(containerId, comments, editable);
        updateTabCount(containerId === 'comments-list' ? 'tab-count-comments' : 'detail-tab-count-comments', comments.length);
      });
    });
  }
}

// ===== LIST PAGE =====
function setupListPage() {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  searchInput.addEventListener('input', () => {
    state.filters.search = searchInput.value;
    searchClear.classList.toggle('hidden', !searchInput.value);
    renderList();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.search = '';
    searchClear.classList.add('hidden');
    renderList();
  });
  document.getElementById('toggle-filters').addEventListener('click', () => {
    state.showFilters = !state.showFilters;
    document.getElementById('filters-panel').classList.toggle('hidden', !state.showFilters);
    document.getElementById('toggle-filters').classList.toggle('active', state.showFilters);
  });
  document.getElementById('filter-manga-status').addEventListener('change', (e) => {
    state.filters.mangaStatus = e.target.value; renderList();
  });
  document.getElementById('filter-my-status').addEventListener('change', (e) => {
    state.filters.myStatus = e.target.value; renderList();
  });
  document.getElementById('clear-filters').addEventListener('click', () => {
    state.filters = { search: '', mangaStatus: 'All', myStatus: 'All', genres: [] };
    state.showFilters = false;
    searchInput.value = '';
    searchClear.classList.add('hidden');
    document.getElementById('filter-manga-status').value = 'All';
    document.getElementById('filter-my-status').value = 'All';
    document.getElementById('filters-panel').classList.add('hidden');
    document.getElementById('toggle-filters').classList.remove('active');
    renderList();
    renderAllGenrePills();
  });
}

function renderList() {
  const { search, mangaStatus, myStatus, genres } = state.filters;
  const filtered = state.mangas.filter(m => {
    const matchSearch = !search ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.otherTitles && m.otherTitles.toLowerCase().includes(search.toLowerCase()));
    const matchMangaStatus = mangaStatus === 'All' || m.mangaStatus === mangaStatus;
    const matchMyStatus = myStatus === 'All' || m.myStatus.startsWith(myStatus);
    const matchGenre = genres.length === 0 || genres.some(g => m.genre.includes(g));
    return matchSearch && matchMangaStatus && matchMyStatus && matchGenre;
  });

  const subtitle = document.getElementById('list-subtitle');
  subtitle.innerHTML = `${state.mangas.length} manga${state.mangas.length !== 1 ? 's' : ''} total` +
    (filtered.length !== state.mangas.length ? ` &middot; <span style="color:var(--primary)">${filtered.length} shown</span>` : '');

  const activeFilterCount = [search, mangaStatus !== 'All', myStatus !== 'All', genres.length > 0].filter(Boolean).length;
  const badge = document.getElementById('filter-badge');
  badge.textContent = activeFilterCount;
  badge.classList.toggle('hidden', activeFilterCount === 0);

  const grid = document.getElementById('manga-grid');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    const hasFilters = activeFilterCount > 0;
    document.getElementById('empty-title').textContent = hasFilters ? 'No manga matches your filters' : 'No manga yet';
    document.getElementById('empty-desc').textContent = hasFilters ? 'Try adjusting your search or filters.' : 'Start building your collection by adding your first manga!';
    const actionBtn = document.getElementById('empty-action');
    if (hasFilters) {
      actionBtn.textContent = 'Clear Filters';
      actionBtn.href = '#list';
      actionBtn.addEventListener('click', () => {
        state.filters = { search: '', mangaStatus: 'All', myStatus: 'All', genres: [] };
        document.getElementById('search-input').value = '';
        document.getElementById('filter-manga-status').value = 'All';
        document.getElementById('filter-my-status').value = 'All';
        renderList();
        renderAllGenrePills();
      }, { once: true });
    } else {
      actionBtn.textContent = 'Add Your First Manga';
      actionBtn.href = '#add';
    }
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(manga => {
    const statusClass = manga.mangaStatus === 'Completed' ? 'completed' : 'ongoing';
    const myStatusClass = manga.myStatus.startsWith('Completed') ? 'status-completed'
      : manga.myStatus.startsWith('Dropped') ? 'status-dropped'
      : manga.myStatus.startsWith('In Chapter') ? 'status-inchapter'
      : 'status-default';
    return `
      <div class="manga-card cute-card">
        <div class="manga-cover-wrap">
          ${manga.cover
            ? `<img src="${manga.cover}" alt="${escapeHtml(manga.title)}" class="manga-cover">`
            : `<div class="manga-cover-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg></div>`}
          <span class="manga-status-badge ${statusClass}">${manga.mangaStatus}</span>
        </div>
        <div class="manga-info">
          <div class="manga-title" title="${escapeHtml(manga.title)}">${escapeHtml(manga.title)}</div>
          <div class="manga-genres">
            ${manga.genre.slice(0, 3).map(g => `<span class="manga-genre-tag">${escapeHtml(g)}</span>`).join('')}
            ${manga.genre.length > 3 ? `<span class="manga-genre-tag" style="background:var(--muted);color:var(--muted-fg)">+${manga.genre.length - 3}</span>` : ''}
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

function truncateStatus(status) {
  if (status.length > 25) return status.slice(0, 22) + '...';
  return status;
}

// ===== DETAIL PAGE =====
function setupDetailPage() {
  document.getElementById('save-btn').addEventListener('click', saveEditing);
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    state.editMode = false; renderDetail();
  });
  document.getElementById('detail-cover-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.detailEdit.cover = await fileToBase64(file);
    const cover = document.getElementById('detail-cover');
    cover.src = state.detailEdit.cover;
    cover.classList.remove('hidden');
    document.getElementById('detail-cover-fallback').classList.add('hidden');
  });
  document.getElementById('detail-toggle-genre-manager').addEventListener('click', () => {
    document.getElementById('detail-genre-manager').classList.toggle('hidden');
  });
  document.getElementById('detail-add-genre-btn').addEventListener('click', () => {
    const input = document.getElementById('detail-new-genre');
    if (addGenre(input.value)) {
      input.value = '';
      renderDetailGenrePills();
      renderDetailManagedGenres();
    }
  });
  document.querySelectorAll('#page-detail .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab('detail', btn.dataset.detailTab));
  });
  document.getElementById('detail-add-chapter-btn').addEventListener('click', () => {
    const num = document.getElementById('detail-chapter-num').value.trim();
    const reason = document.getElementById('detail-chapter-reason').value.trim();
    if (!num || !reason) return;
    state.detailEdit.chapters.push({ number: parseInt(num), reason });
    document.getElementById('detail-chapter-num').value = '';
    document.getElementById('detail-chapter-reason').value = '';
    renderChapters('detail-chapters-list', state.detailEdit.chapters, true);
    updateTabCount('detail-tab-count-chapters', state.detailEdit.chapters.length);
  });
  document.getElementById('detail-photo-upload').addEventListener('click', () => {
    document.getElementById('detail-photo-input').click();
  });
  document.getElementById('detail-photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const dataUrls = await Promise.all(files.map(fileToBase64));
    state.detailEdit.photos.push(...dataUrls);
    renderPhotos('detail-photo-grid', state.detailEdit.photos, true);
    updateTabCount('detail-tab-count-photos', state.detailEdit.photos.length);
  });
  document.getElementById('detail-add-comment-btn').addEventListener('click', () => {
    const text = document.getElementById('detail-comment-input').value.trim();
    if (!text) return;
    state.detailEdit.comments.push(text);
    document.getElementById('detail-comment-input').value = '';
    renderComments('detail-comments-list', state.detailEdit.comments, true);
    updateTabCount('detail-tab-count-comments', state.detailEdit.comments.length);
  });
}

function renderDetail() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) { navigate('list'); return; }

  const coverEl = document.getElementById('detail-cover');
  const fallbackEl = document.getElementById('detail-cover-fallback');
  if (manga.cover) {
    coverEl.src = manga.cover; coverEl.classList.remove('hidden'); fallbackEl.classList.add('hidden');
  } else {
    coverEl.src = ''; coverEl.classList.add('hidden'); fallbackEl.classList.remove('hidden');
  }
  document.getElementById('cover-change-overlay').classList.toggle('hidden', !state.editMode);
  document.getElementById('detail-readonly').classList.toggle('hidden', state.editMode);
  document.getElementById('detail-edit').classList.toggle('hidden', !state.editMode);

  const actionsEl = document.getElementById('detail-actions');
  actionsEl.innerHTML = state.editMode
    ? `<button class="btn btn-danger" id="detail-cancel-btn">✕ Cancel</button>`
    : `<button class="btn btn-danger" id="detail-delete-btn">🗑 Delete</button>
       <button class="btn btn-edit" id="detail-edit-btn">✏️ Edit</button>`;

  if (state.editMode) {
    document.getElementById('detail-cancel-btn').addEventListener('click', () => {
      state.editMode = false; renderDetail();
    });
  } else {
    document.getElementById('detail-edit-btn').addEventListener('click', startEditing);
    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
      if (confirm(`Delete "${manga.title}"? This cannot be undone.`)) {
        state.mangas = state.mangas.filter(m => m.id !== state.selectedMangaId);
        await deleteMangaFromCloud(state.selectedMangaId);
        navigate('list');
      }
    });
  }

  if (!state.editMode) {
    document.getElementById('detail-view-title').textContent = manga.title;
    const otherEl = document.getElementById('detail-view-other');
    if (manga.otherTitles) { otherEl.textContent = manga.otherTitles; otherEl.style.display = 'block'; }
    else { otherEl.style.display = 'none'; }
    const myClass = manga.myStatus.startsWith('Completed') ? 'my-completed'
      : manga.myStatus.startsWith('Dropped') ? 'my-dropped'
      : manga.myStatus.startsWith('In Chapter') ? 'my-inchapter' : 'my-default';
    document.getElementById('detail-view-badges').innerHTML = `
      <span class="detail-badge ${manga.mangaStatus === 'Completed' ? 'completed' : 'ongoing'}">${manga.mangaStatus}</span>
      <span class="detail-badge ${myClass}">${manga.myStatus}</span>`;
    document.getElementById('detail-view-genres').innerHTML =
      manga.genre.map(g => `<span class="detail-genre-tag">${escapeHtml(g)}</span>`).join('');
    const summaryEl = document.getElementById('detail-view-summary');
    if (manga.summary) { summaryEl.innerHTML = `<p>${escapeHtml(manga.summary)}</p>`; summaryEl.style.display = 'block'; }
    else { summaryEl.style.display = 'none'; }
  } else {
    document.getElementById('detail-edit-title').value = state.detailEdit.title;
    document.getElementById('detail-edit-other').value = state.detailEdit.otherTitles;
    document.getElementById('detail-edit-manga-status').value = state.detailEdit.mangaStatus;
    document.getElementById('detail-edit-my-status').value = state.detailEdit.myStatus;
    document.getElementById('detail-edit-summary').value = state.detailEdit.summary;
    renderDetailGenrePills();
    renderDetailManagedGenres();
  }

  document.getElementById('detail-chapter-edit-row').classList.toggle('hidden', !state.editMode);
  document.getElementById('detail-photo-upload').classList.toggle('hidden', !state.editMode);
  document.getElementById('detail-comment-edit-row').classList.toggle('hidden', !state.editMode);

  const chapters = state.editMode ? state.detailEdit.chapters : manga.favoriteChapters;
  const photos = state.editMode ? state.detailEdit.photos : manga.favoritePhotos;
  const comments = state.editMode ? state.detailEdit.comments : manga.comments;

  renderChapters('detail-chapters-list', chapters, state.editMode);
  renderPhotos('detail-photo-grid', photos, state.editMode);
  renderComments('detail-comments-list', comments, state.editMode);
  updateTabCount('detail-tab-count-chapters', chapters.length);
  updateTabCount('detail-tab-count-photos', photos.length);
  updateTabCount('detail-tab-count-comments', comments.length);
}

function startEditing() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) return;
  state.editMode = true;
  state.detailEdit = {
    title: manga.title, otherTitles: manga.otherTitles,
    mangaStatus: manga.mangaStatus, myStatus: manga.myStatus,
    summary: manga.summary, cover: manga.cover,
    chapters: [...manga.favoriteChapters],
    photos: [...manga.favoritePhotos],
    comments: [...manga.comments],
    selectedGenres: [...manga.genre],
  };
  renderDetail();
}

async function saveEditing() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) return;
  manga.title = document.getElementById('detail-edit-title').value.trim();
  manga.otherTitles = document.getElementById('detail-edit-other').value.trim();
  manga.mangaStatus = document.getElementById('detail-edit-manga-status').value;
  manga.myStatus = document.getElementById('detail-edit-my-status').value.trim();
  manga.summary = document.getElementById('detail-edit-summary').value.trim();
  manga.cover = state.detailEdit.cover;
  manga.favoriteChapters = [...state.detailEdit.chapters];
  manga.favoritePhotos = [...state.detailEdit.photos];
  manga.comments = [...state.detailEdit.comments];
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

// ===== START =====
document.addEventListener('DOMContentLoaded', setupAuth);
