/**
 * The Manga Corner - Pure HTML/CSS/JS Manga Tracker
 * All data is saved to localStorage - works offline on any device!
 */

// ===== CONFIG =====
const STORAGE_KEYS = {
  mangas: 'mangas_v2',
  genres: 'genres_v2',
  theme: 'mangaCorner_theme',
};

const DEFAULT_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Isekai', 'Mystery', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
];

// ===== STATE =====
let state = {
  mangas: [],
  genres: [],
  currentPage: 'home',
  selectedMangaId: null,
  editMode: false,
  addForm: {
    chapters: [],
    photos: [],
    cover: '',
    selectedGenres: [],
    rating: 0,
    year: '',
  },
  detailEdit: {
    chapters: [],
    photos: [],
    cover: '',
    selectedGenres: [],
    rating: 0,
    year: '',
  },
  filters: {
    search: '',
    mangaStatus: 'All',
    myStatus: 'All',
    genres: [],
  },
  sort: 'newest',
  currentListPage: 1,
  itemsPerPage: 20,
  showFilters: false,
  showGenreManager: false,
  lightbox: { photos: [], index: 0 },
};

// ===== STORAGE HELPERS =====
function loadFromStorage(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      alert('Storage is full! Try removing some cover images or photos to free up space.');
    } else {
      console.error('Failed to save data:', e);
    }
  }
}

// ===== MIGRATION =====
function migrateData() {
  const oldMangas = loadFromStorage('mangas', null);
  if (oldMangas && !loadFromStorage(STORAGE_KEYS.mangas, null)) {
    const migrated = oldMangas.map((m, i) => ({
      id: `migrated_${i}_${Date.now()}`,
      title: m.title || '',
      otherTitles: m.otherTitles || '',
      genre: m.genre || [],
      mangaStatus: m.mangaStatus || 'Ongoing',
      myStatus: m.status || "Didn't start yet",
      summary: m.summary || '',
      cover: m.cover || '',
      favoriteChapters: m.chapters || m.favoriteChapters || [],
      favoritePhotos: m.photos || m.favoritePhotos || [],
      comments: m.comments || [],
      rating: m.rating || 0,
      year: m.year || '',
      createdAt: m.createdAt || new Date().toISOString(),
    }));
    saveToStorage(STORAGE_KEYS.mangas, migrated);
  }
  const oldGenres = loadFromStorage('genres', null);
  if (oldGenres && !loadFromStorage(STORAGE_KEYS.genres, null)) {
    saveToStorage(STORAGE_KEYS.genres, oldGenres);
  }
}

// ===== INITIALIZATION =====
function init() {
  migrateData();
  state.mangas = loadFromStorage(STORAGE_KEYS.mangas, []);
  state.genres = loadFromStorage(STORAGE_KEYS.genres, []);
  if (state.genres.length === 0) {
    state.genres = [...DEFAULT_GENRES];
    saveToStorage(STORAGE_KEYS.genres, state.genres);
  }

  // Theme
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Setup all event listeners
  setupNavigation();
  setupThemeToggle();
  setupMobileMenu();
  setupAddPage();
  setupListPage();
  setupDetailPage();

  // Handle initial route
  handleRoute();
  setupLightbox();
}

// ===== ROUTER =====
function setupNavigation() {
  // Event delegation — catches both static and dynamically injected [data-link] elements
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      navigate(href.slice(1) || 'home');
    }
  });

  // Browser back/forward
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

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-link, .mobile-link').forEach(l => l.classList.remove('active'));

  // Update active nav
  const activeLinks = document.querySelectorAll(`a[href="#${page}"]`);
  activeLinks.forEach(l => l.classList.add('active'));

  state.currentPage = page;
  state.editMode = false;

  switch (page) {
    case 'home':
      document.getElementById('page-home').classList.remove('hidden');
      renderHome();
      break;
    case 'add':
      document.getElementById('page-add').classList.remove('hidden');
      resetAddForm();
      break;
    case 'list':
      document.getElementById('page-list').classList.remove('hidden');
      renderList();
      break;
    case 'detail':
      state.selectedMangaId = parts[1];
      document.getElementById('page-detail').classList.remove('hidden');
      renderDetail();
      break;
    default:
      navigate('home');
  }

  // Close mobile menu
  document.getElementById('mobile-menu').classList.remove('open');
  window.scrollTo(0, 0);
}

// ===== THEME =====
function setupThemeToggle() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(STORAGE_KEYS.theme, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(STORAGE_KEYS.theme, 'dark');
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

// ===== HOME PAGE =====
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

// ===== GENRE PILLS (shared) =====
function renderGenrePills(containerId, selectedGenres, onToggle, managed = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `genre-pill ${selectedGenres.includes(genre) ? 'active' : ''} ${managed ? 'managed' : ''}`;
    pill.innerHTML = `${genre}${managed ? '<span class="remove">&times;</span>' : ''}`;
    pill.addEventListener('click', (e) => {
      if (managed && e.target.classList.contains('remove')) {
        deleteGenre(genre);
        renderAllGenrePills();
      } else {
        onToggle(genre);
      }
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

function renderManagedGenres(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  state.genres.forEach(genre => {
    const pill = document.createElement('span');
    pill.className = 'genre-pill managed';
    pill.innerHTML = `${genre} <span class="remove">&times;</span>`;
    pill.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        deleteGenre(genre);
        renderAllGenrePills();
      }
    });
    container.appendChild(pill);
  });
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
    if (!state.genres.includes(g)) {
      state.genres.push(g);
      added = true;
    }
  });
  if (added) saveToStorage(STORAGE_KEYS.genres, state.genres);
  return added;
}

function deleteGenre(genre) {
  if (!confirm(`Delete genre "${genre}"?`)) return;
  state.genres = state.genres.filter(g => g !== genre);
  saveToStorage(STORAGE_KEYS.genres, state.genres);
  // Remove from all mangas
  state.mangas.forEach(m => { m.genre = m.genre.filter(g => g !== genre); });
  saveMangas();
  // Remove from selected
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

// ===== STAR RATING =====
function renderStars(containerId, currentRating, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star-btn' + (i <= currentRating ? ' active' : '');
    star.innerHTML = '★';
    star.dataset.value = i;
    star.addEventListener('mouseover', () => highlightStars(containerId, i));
    star.addEventListener('mouseout', () => highlightStars(containerId, currentRating));
    star.addEventListener('click', () => {
      onChange(i);
      renderStars(containerId, i, onChange);
    });
    container.appendChild(star);
  }
}

function highlightStars(containerId, upTo) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.star-btn').forEach((s, idx) => {
    s.classList.toggle('hover', idx < upTo);
  });
}

// ===== ADD MANGA PAGE =====
function setupAddPage() {
  // Cover upload
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

  // Genre manager toggle
  document.getElementById('toggle-genre-manager').addEventListener('click', () => {
    state.showGenreManager = !state.showGenreManager;
    document.getElementById('genre-manager').classList.toggle('hidden', !state.showGenreManager);
    const link = document.getElementById('toggle-genre-manager');
    link.textContent = state.showGenreManager ? 'Hide genres' : 'Manage genres';
  });

  // Add new genre
  document.getElementById('add-genre-btn').addEventListener('click', () => {
    const input = document.getElementById('new-genre');
    if (addGenre(input.value)) {
      input.value = '';
      renderAllGenrePills();
    }
  });

  // My status change
  const myStatus = document.getElementById('my-status');
  myStatus.addEventListener('change', () => {
    document.getElementById('dropped-field').classList.toggle('hidden', myStatus.value !== 'Dropped');
    document.getElementById('current-field').classList.toggle('hidden', myStatus.value !== 'In Chapter');
  });

  // Tabs
  document.querySelectorAll('#page-add .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab('add', btn.dataset.tab));
  });

  // Add chapter
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

  // Photo upload
  document.getElementById('photo-upload').addEventListener('click', () => {
    document.getElementById('photo-input').click();
  });
  document.getElementById('photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    // Process photos one by one to avoid memory issues with many photos
    for (const file of files) {
      const dataUrl = await fileToBase64(file);
      state.addForm.photos.push(dataUrl);
    }
    e.target.value = ''; // Reset input so same file can be re-added
    renderPhotos('photo-grid', state.addForm.photos, true);
    updateTabCount('tab-count-photos', state.addForm.photos.length);
  });

  // Init stars for add form
  renderStars('stars-add', 0, (r) => { state.addForm.rating = r; document.getElementById('manga-rating').value = r; });

  // Submit form
  document.getElementById('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value.trim();
    if (!title) { alert('Please enter a title!'); return; }

    let myStatusVal = myStatus.value;
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
      rating: state.addForm.rating || 0,
      year: document.getElementById('manga-year').value.trim(),
      createdAt: new Date().toISOString(),
    };

    state.mangas.push(manga);
    saveMangas();
    alert('Manga saved successfully!');
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
  switchTab('add', 'chapters');
  renderChapters('chapters-list', [], true);
  renderPhotos('photo-grid', [], true);
  updateTabCount('tab-count-chapters', 0);
  updateTabCount('tab-count-photos', 0);
  renderStars('stars-add', 0, (r) => { state.addForm.rating = r; });
  document.getElementById('manga-rating').value = 0;
  document.getElementById('manga-year').value = '';
  renderAllGenrePills();
}

// ===== TAB SWITCHING =====
function switchTab(page, tabName) {
  const prefix = page === 'add' ? '' : 'detail-';
  // Buttons
  document.querySelectorAll(`#page-${page} .tab-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName || btn.dataset.detailTab === tabName);
  });
  // Content
  document.querySelectorAll(`#page-${page} .tab-content`).forEach(content => {
    content.classList.add('hidden');
  });
  const activeContent = document.getElementById(`${prefix}tab-${tabName}`);
  if (activeContent) activeContent.classList.remove('hidden');
}

function updateTabCount(id, count) {
  const el = document.getElementById(id);
  if (el) el.textContent = count;
}

// ===== RENDER LISTS (chapters, photos, comments) =====
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
        const idx = parseInt(btn.dataset.idx);
        chapters.splice(idx, 1);
        renderChapters(containerId, chapters, editable);
        const isAdd = containerId === 'chapters-list';
        updateTabCount(isAdd ? 'tab-count-chapters' : 'detail-tab-count-chapters', chapters.length);
      });
    });
  }
}

function renderPhotos(containerId, photos, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (photos.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = photos.map((src, i) => `
    <div class="photo-item">
      <img src="${src}" alt="Photo ${i + 1}">
      ${editable ? `<button class="photo-remove" data-idx="${i}" title="Remove">&#10005;</button>` : ''}
    </div>
  `).join('');

  if (editable) {
    container.querySelectorAll('.photo-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        photos.splice(idx, 1);
        renderPhotos(containerId, photos, editable);
        const isAdd = containerId === 'photo-grid';
        updateTabCount(isAdd ? 'tab-count-photos' : 'detail-tab-count-photos', photos.length);
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
        const idx = parseInt(btn.dataset.idx);
        comments.splice(idx, 1);
        renderComments(containerId, comments, editable);
        const isAdd = containerId === 'comments-list';
        updateTabCount(isAdd ? 'tab-count-comments' : 'detail-tab-count-comments', comments.length);
      });
    });
  }
}

// ===== LIST PAGE =====
function setupListPage() {
  // Search
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  searchInput.addEventListener('input', () => {
    state.filters.search = searchInput.value;
    state.currentListPage = 1;
    searchClear.classList.toggle('hidden', !searchInput.value);
    renderList();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.filters.search = '';
    state.currentListPage = 1;
    searchClear.classList.add('hidden');
    renderList();
  });

  // Toggle filters
  document.getElementById('toggle-filters').addEventListener('click', () => {
    state.showFilters = !state.showFilters;
    document.getElementById('filters-panel').classList.toggle('hidden', !state.showFilters);
    document.getElementById('toggle-filters').classList.toggle('active', state.showFilters);
  });

  // Filter selects
  document.getElementById('filter-manga-status').addEventListener('change', (e) => {
    state.filters.mangaStatus = e.target.value;
    renderList();
  });
  document.getElementById('filter-my-status').addEventListener('change', (e) => {
    state.filters.myStatus = e.target.value;
    renderList();
  });
  document.getElementById('clear-filters').addEventListener('click', () => {
    state.filters = { search: '', mangaStatus: 'All', myStatus: 'All', genres: [] };
    state.showFilters = false;
    state.currentListPage = 1;
    searchInput.value = '';
    searchClear.classList.add('hidden');
    document.getElementById('filter-manga-status').value = 'All';
    document.getElementById('filter-my-status').value = 'All';
    document.getElementById('filters-panel').classList.add('hidden');
    document.getElementById('toggle-filters').classList.remove('active');
    renderList();
    renderAllGenrePills();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.currentListPage = 1;
    renderList();
  });
}

function sortMangas(arr) {
  const sorted = [...arr];
  switch (state.sort) {
    case 'title-az': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-za': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'rating-high': return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    case 'rating-low': return sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    case 'year-new': return sorted.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    case 'year-old': return sorted.sort((a, b) => (parseInt(a.year) || 9999) - (parseInt(b.year) || 9999));
    case 'oldest': return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'newest': default: return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

function renderList() {
  const { search, mangaStatus, myStatus, genres } = state.filters;
  let filtered = state.mangas.filter(m => {
    const matchSearch = !search ||
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.otherTitles && m.otherTitles.toLowerCase().includes(search.toLowerCase()));
    const matchMangaStatus = mangaStatus === 'All' || m.mangaStatus === mangaStatus;
    const matchMyStatus = myStatus === 'All' || m.myStatus.startsWith(myStatus);
    const matchGenre = genres.length === 0 || genres.some(g => m.genre.includes(g));
    return matchSearch && matchMangaStatus && matchMyStatus && matchGenre;
  });

  // Sort
  filtered = sortMangas(filtered);

  // Update subtitle
  const subtitle = document.getElementById('list-subtitle');
  subtitle.innerHTML = `${state.mangas.length} manga${state.mangas.length !== 1 ? 's' : ''} total` +
    (filtered.length !== state.mangas.length ? ` &middot; <span style="color:var(--primary)">${filtered.length} shown</span>` : '');

  // Update filter badge
  const activeFilterCount = [search, mangaStatus !== 'All', myStatus !== 'All', genres.length > 0].filter(Boolean).length;
  const badge = document.getElementById('filter-badge');
  badge.textContent = activeFilterCount;
  badge.classList.toggle('hidden', activeFilterCount === 0);

  const grid = document.getElementById('manga-grid');
  const empty = document.getElementById('empty-state');
  const paginationEl = document.getElementById('pagination');

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    paginationEl.style.display = 'none';
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

  // Pagination
  const totalPages = Math.ceil(filtered.length / state.itemsPerPage);
  if (state.currentListPage > totalPages) state.currentListPage = 1;
  const start = (state.currentListPage - 1) * state.itemsPerPage;
  const paginated = filtered.slice(start, start + state.itemsPerPage);

  // Render pagination controls
  if (totalPages > 1) {
    paginationEl.style.display = 'flex';
    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
      pages += `<button class="page-btn${i === state.currentListPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationEl.innerHTML = `
      <button class="page-btn page-nav" id="page-prev" ${state.currentListPage === 1 ? 'disabled' : ''}>&#8249;</button>
      ${pages}
      <button class="page-btn page-nav" id="page-next" ${state.currentListPage === totalPages ? 'disabled' : ''}>&#8250;</button>
    `;
    paginationEl.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentListPage = parseInt(btn.dataset.page);
        renderList();
        window.scrollTo(0, 0);
      });
    });
    paginationEl.querySelector('#page-prev')?.addEventListener('click', () => {
      if (state.currentListPage > 1) { state.currentListPage--; renderList(); window.scrollTo(0, 0); }
    });
    paginationEl.querySelector('#page-next')?.addEventListener('click', () => {
      if (state.currentListPage < totalPages) { state.currentListPage++; renderList(); window.scrollTo(0, 0); }
    });
  } else {
    paginationEl.style.display = 'none';
  }

  grid.innerHTML = paginated.map(manga => {
    const statusClass = manga.mangaStatus === 'Completed' ? 'completed' : 'ongoing';
    const myStatusClass = manga.myStatus.startsWith('Completed') ? 'status-completed'
      : manga.myStatus.startsWith('Dropped') ? 'status-dropped'
      : manga.myStatus.startsWith('In Chapter') ? 'status-inchapter'
      : 'status-default';
    const ratingHtml = manga.rating > 0
      ? `<div class="card-stars">${'★'.repeat(manga.rating)}${'☆'.repeat(10 - manga.rating)}</div>`
      : '';
    const yearHtml = manga.year ? `<span class="card-year">${manga.year}</span>` : '';

    return `
      <div class="manga-card cute-card">
        <div class="manga-cover-wrap">
          ${manga.cover ? `<img src="${manga.cover}" alt="${escapeHtml(manga.title)}" class="manga-cover">`
            : `<div class="manga-cover-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg></div>`}
          <span class="manga-status-badge ${statusClass}">${manga.mangaStatus}</span>
        </div>
        <div class="manga-info">
          <div class="manga-title" title="${escapeHtml(manga.title)}">${escapeHtml(manga.title)}</div>
          ${ratingHtml}
          <div class="manga-genres">
            ${manga.genre.slice(0, 3).map(g => `<span class="manga-genre-tag">${escapeHtml(g)}</span>`).join('')}
            ${manga.genre.length > 3 ? `<span class="manga-genre-tag" style="background:var(--muted);color:var(--muted-fg)">+${manga.genre.length - 3}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
            <span class="manga-my-status ${myStatusClass}">${escapeHtml(truncateStatus(manga.myStatus))}</span>
            ${yearHtml}
          </div>
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
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.manga-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const manga = state.mangas.find(m => m.id === btn.dataset.id);
      if (manga && confirm(`Delete "${manga.title}"?`)) {
        state.mangas = state.mangas.filter(m => m.id !== btn.dataset.id);
        saveMangas();
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
  // Save/Cancel are static HTML elements; Edit/Delete are injected dynamically in renderDetail()
  document.getElementById('save-btn').addEventListener('click', saveEditing);
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    state.editMode = false;
    renderDetail();
  });

  // Cover change in edit mode
  document.getElementById('detail-cover-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.detailEdit.cover = await fileToBase64(file);
    const cover = document.getElementById('detail-cover');
    cover.src = state.detailEdit.cover;
    cover.classList.remove('hidden');
    document.getElementById('detail-cover-fallback').classList.add('hidden');
  });

  // Genre manager in detail edit
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

  // Tabs
  document.querySelectorAll('#page-detail .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab('detail', btn.dataset.detailTab));
  });

  // Add chapter in edit
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

  // Photo upload in edit
  document.getElementById('detail-photo-upload').addEventListener('click', () => {
    document.getElementById('detail-photo-input').click();
  });
  document.getElementById('detail-photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const dataUrl = await fileToBase64(file);
      state.detailEdit.photos.push(dataUrl);
    }
    e.target.value = '';
    renderPhotos('detail-photo-grid', state.detailEdit.photos, true);
    updateTabCount('detail-tab-count-photos', state.detailEdit.photos.length);
  });

}

function renderDetail() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) { navigate('list'); return; }

  // Cover
  const coverEl = document.getElementById('detail-cover');
  const fallbackEl = document.getElementById('detail-cover-fallback');
  const overlayEl = document.getElementById('cover-change-overlay');
  if (manga.cover) {
    coverEl.src = manga.cover;
    coverEl.classList.remove('hidden');
    fallbackEl.classList.add('hidden');
  } else {
    coverEl.src = '';
    coverEl.classList.add('hidden');
    fallbackEl.classList.remove('hidden');
  }
  overlayEl.classList.toggle('hidden', !state.editMode);

  // Readonly view
  const readonlyEl = document.getElementById('detail-readonly');
  const editEl = document.getElementById('detail-edit');
  readonlyEl.classList.toggle('hidden', state.editMode);
  editEl.classList.toggle('hidden', !state.editMode);

  // Actions
  const actionsEl = document.getElementById('detail-actions');
  actionsEl.innerHTML = state.editMode
    ? `<button class="btn btn-danger" id="detail-cancel-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel</button>`
    : `<button class="btn btn-danger" id="detail-delete-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Delete</button>
       <button class="btn btn-edit" id="detail-edit-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>`;

  if (state.editMode) {
    document.getElementById('detail-cancel-btn').addEventListener('click', () => {
      state.editMode = false;
      renderDetail();
    });
  } else {
    document.getElementById('detail-edit-btn').addEventListener('click', startEditing);
    document.getElementById('detail-delete-btn').addEventListener('click', () => {
      const manga = state.mangas.find(m => m.id === state.selectedMangaId);
      if (manga && confirm(`Delete "${manga.title}"? This cannot be undone.`)) {
        state.mangas = state.mangas.filter(m => m.id !== state.selectedMangaId);
        saveMangas();
        navigate('list');
      }
    });
  }

  if (!state.editMode) {
    // Render readonly content
    document.getElementById('detail-view-title').textContent = manga.title;
    const otherEl = document.getElementById('detail-view-other');
    if (manga.otherTitles) { otherEl.textContent = manga.otherTitles; otherEl.style.display = 'block'; }
    else { otherEl.style.display = 'none'; }

    const badgesEl = document.getElementById('detail-view-badges');
    const myClass = manga.myStatus.startsWith('Completed') ? 'my-completed'
      : manga.myStatus.startsWith('Dropped') ? 'my-dropped'
      : manga.myStatus.startsWith('In Chapter') ? 'my-inchapter'
      : 'my-default';
    badgesEl.innerHTML = `
      <span class="detail-badge ${manga.mangaStatus === 'Completed' ? 'completed' : 'ongoing'}">${manga.mangaStatus}</span>
      <span class="detail-badge ${myClass}">${manga.myStatus}</span>
    `;

    const genresEl = document.getElementById('detail-view-genres');
    genresEl.innerHTML = manga.genre.map(g => `<span class="detail-genre-tag">${escapeHtml(g)}</span>`).join('');

    const summaryEl = document.getElementById('detail-view-summary');
    if (manga.summary) { summaryEl.innerHTML = `<p>${escapeHtml(manga.summary)}</p>`; summaryEl.style.display = 'block'; }
    else { summaryEl.style.display = 'none'; }
  } else {
    // Edit form fields
    document.getElementById('detail-edit-title').value = state.detailEdit.title;
    document.getElementById('detail-edit-other').value = state.detailEdit.otherTitles;
    document.getElementById('detail-edit-manga-status').value = state.detailEdit.mangaStatus;
    document.getElementById('detail-edit-my-status').value = state.detailEdit.myStatus;
    document.getElementById('detail-edit-summary').value = state.detailEdit.summary;
    renderDetailGenrePills();
    renderDetailManagedGenres();
  }

  // Edit row visibility
  document.getElementById('detail-chapter-edit-row').classList.toggle('hidden', !state.editMode);
  document.getElementById('detail-photo-upload').classList.toggle('hidden', !state.editMode);

  // Render tab contents
  const chapters = state.editMode ? state.detailEdit.chapters : manga.favoriteChapters;
  const photos = state.editMode ? state.detailEdit.photos : manga.favoritePhotos;

  renderChapters('detail-chapters-list', chapters, state.editMode);
  renderPhotos('detail-photo-grid', photos, state.editMode);

  updateTabCount('detail-tab-count-chapters', chapters.length);
  updateTabCount('detail-tab-count-photos', photos.length);

  // Rating & year display
  const ratingYearEl = document.getElementById('detail-view-rating-year');
  if (ratingYearEl && !state.editMode) {
    const r = manga.rating || 0;
    const stars = '★'.repeat(r) + '☆'.repeat(10 - r);
    const yearText = manga.year ? ` · ${manga.year}` : '';
    ratingYearEl.innerHTML = r > 0
      ? `<span class="detail-stars">${stars}</span><span class="detail-rating-num">${r}/10${yearText}</span>`
      : (manga.year ? `<span class="detail-rating-num">📅 ${manga.year}</span>` : '');
  }

  // Edit mode: render stars
  if (state.editMode) {
    renderStars('stars-detail', state.detailEdit.rating || 0, (r) => {
      state.detailEdit.rating = r;
      document.getElementById('detail-edit-rating').value = r;
    });
    const yearInput = document.getElementById('detail-edit-year');
    if (yearInput) yearInput.value = state.detailEdit.year || '';
  }

  // Photo lightbox
  if (!state.editMode) {
    state.lightbox.photos = photos;
    document.getElementById('detail-photo-grid').querySelectorAll('.photo-item img').forEach((img, idx) => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => openLightbox(idx));
    });
  }
}

function startEditing() {
  const manga = state.mangas.find(m => m.id === state.selectedMangaId);
  if (!manga) return;

  state.editMode = true;
  state.detailEdit = {
    title: manga.title,
    otherTitles: manga.otherTitles,
    mangaStatus: manga.mangaStatus,
    myStatus: manga.myStatus,
    summary: manga.summary,
    cover: manga.cover,
    chapters: [...manga.favoriteChapters],
    photos: [...manga.favoritePhotos],
    selectedGenres: [...manga.genre],
    rating: manga.rating || 0,
    year: manga.year || '',
  };
  renderDetail();
}

function saveEditing() {
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
  manga.genre = [...state.detailEdit.selectedGenres];
  manga.rating = state.detailEdit.rating || 0;
  manga.year = document.getElementById('detail-edit-year')?.value.trim() || '';

  saveMangas();
  state.editMode = false;
  renderDetail();
  alert('Saved successfully!');
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
    pill.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove')) {
        deleteGenre(genre);
        renderDetailGenrePills();
        renderDetailManagedGenres();
      }
    });
    container.appendChild(pill);
  });
}

// ===== LIGHTBOX =====
function setupLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => {
    if (state.lightbox.index > 0) openLightbox(state.lightbox.index - 1);
  });
  document.getElementById('lightbox-next').addEventListener('click', () => {
    if (state.lightbox.index < state.lightbox.photos.length - 1) openLightbox(state.lightbox.index + 1);
  });
  document.getElementById('photo-lightbox').addEventListener('click', (e) => {
    if (e.target === document.getElementById('photo-lightbox')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('photo-lightbox').style.display === 'none') return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && state.lightbox.index > 0) openLightbox(state.lightbox.index - 1);
    if (e.key === 'ArrowRight' && state.lightbox.index < state.lightbox.photos.length - 1) openLightbox(state.lightbox.index + 1);
  });
}

function openLightbox(index) {
  const lb = document.getElementById('photo-lightbox');
  const img = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  state.lightbox.index = index;
  img.src = state.lightbox.photos[index];
  counter.textContent = `${index + 1} / ${state.lightbox.photos.length}`;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('photo-lightbox').style.display = 'none';
  document.body.style.overflow = '';
}

// ===== HELPERS =====
function saveMangas() {
  saveToStorage(STORAGE_KEYS.mangas, state.mangas);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
