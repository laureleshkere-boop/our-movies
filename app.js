// ==============================
// 1. НАСТРОЙКА FIREBASE
// ==============================
// Вставь сюда конфиг из своего Firebase-проекта
// (Project settings -> General -> Your apps -> SDK setup and configuration)
const firebaseConfig = {
  apiKey: "AIzaSyCCJsXriwKGoth9OKspHtpZw0WFZgjnBCs",
  authDomain: "ourmovies-6097c.firebaseapp.com",
  projectId: "ourmovies-6097c",
  storageBucket: "ourmovies-6097c.firebasestorage.app",
  messagingSenderId: "205244333759",
  appId: "1:205244333759:web:d33d7e133cf8d2ade1d00a"
};

// После того как создашь двух пользователей в Firebase Authentication,
// впиши их UID и имена сюда (UID виден в Authentication -> Users)
const USERS = {
  "v0SB80CbucOHEhXmVnI61zpOp4J2": { name: "влад нос" },
  "PfDv8MRtgthWtmO9ZBfU5tZPeFI3": { name: "ульяна текстиль" }
};

// ==============================
// 2. ИМПОРТЫ FIREBASE (через CDN, модульный SDK v10)
// ==============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Бесплатный ключ на https://www.omdbapi.com/apikey.aspx (необязательно, можно вставлять ссылки вручную)
const OMDB_API_KEY = "3b3dd1df";

const TYPE_LABELS = { movie: "🎬 Фильм", series: "📺 Сериал", cartoon: "🧸 Мультфильм" };

// ==============================
// 3. DOM-ЭЛЕМЕНТЫ
// ==============================
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");
const movieListEl = document.getElementById("movie-list");
const addMovieFab = document.getElementById("add-movie-fab");

const movieModal = document.getElementById("movie-modal");
const movieModalTitle = document.getElementById("movie-modal-title");
const movieTitleInput = document.getElementById("movie-title-input");
const movieDateInput = document.getElementById("movie-date-input");
const posterPreview = document.getElementById("poster-preview");
const posterUrlInput = document.getElementById("poster-url-input");
const fetchPosterBtn = document.getElementById("fetch-poster-btn");
const movieTypeSelect = document.getElementById("movie-type-select");
const movieCancelBtn = document.getElementById("movie-cancel-btn");
const movieSaveBtn = document.getElementById("movie-save-btn");
const typeTabs = document.getElementById("type-tabs");

const statsBtn = document.getElementById("stats-btn");
const statsModal = document.getElementById("stats-modal");
const statsBody = document.getElementById("stats-body");
const statsCloseBtn = document.getElementById("stats-close-btn");
const statusToggle = document.getElementById("status-toggle");
const sortRow = document.getElementById("sort-row");
const sortSelect = document.getElementById("sort-select");
const movieStatusSelect = document.getElementById("movie-status-select");
const dateFieldWrap = document.getElementById("date-field-wrap");

const ratingModal = document.getElementById("rating-modal");
const ratingScoreInput = document.getElementById("rating-score-input");
const ratingCommentInput = document.getElementById("rating-comment-input");
const ratingCancelBtn = document.getElementById("rating-cancel-btn");
const ratingSaveBtn = document.getElementById("rating-save-btn");

let currentUser = null;
let currentMovies = [];
let editingMovieId = null;   // если не null - редактируем существующий фильм (название/дата/постер)
let pendingPosterUrl = "";   // ссылка на постер (текстом)
let pendingType = "movie";
let pendingStatus = "watched";
let currentFilter = "all";
let currentStatusView = "watched";
let currentSort = "date_desc";
let ratingTargetMovieId = null; // фильм, для которого сейчас ставим оценку

// ==============================
// 4. АВТОРИЗАЦИЯ
// ==============================
loginBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
  } catch (e) {
    loginError.textContent = "Не удалось войти: проверь email и пароль";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    subscribeToMovies();
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});

// ==============================
// 5. ПОДПИСКА НА СПИСОК ФИЛЬМОВ (реалтайм)
// ==============================
function subscribeToMovies() {
  onSnapshot(collection(db, "movies"), (snapshot) => {
    currentMovies = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAtMs: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0
      };
    });
    renderMovies();
  });
}

function renderMovies() {
  movieListEl.innerHTML = "";

  let list = currentMovies.filter(m => (m.status || "watched") === currentStatusView);
  if (currentFilter !== "all") {
    list = list.filter(m => (m.type || "movie") === currentFilter);
  }

  if (currentStatusView === "watched") {
    list = sortMovies(list, currentSort);
  } else {
    // watchlist - просто по дате добавления, новые сверху
    list = list.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }

  if (!list.length) {
    movieListEl.innerHTML = `<p style="text-align:center;color:var(--text-dim);padding:30px 10px;">Пусто</p>`;
    return;
  }

  list.forEach((movie, i) => {
    const card = buildMovieCard(movie);
    card.style.animationDelay = `${Math.min(i, 8) * 0.03}s`;
    movieListEl.appendChild(card);
  });
}

function sortMovies(list, sortKey) {
  const withScore = (m) => {
    const scores = Object.values(m.ratings || {}).map(r => r.score).filter(s => typeof s === "number");
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { avg, scores };
  };

  const copy = list.slice();
  switch (sortKey) {
    case "date_asc":
      return copy.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    case "date_desc":
      return copy.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    case "rating_desc":
      return copy.sort((a, b) => {
        const av = withScore(a).avg, bv = withScore(b).avg;
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      });
    case "rating_asc":
      return copy.sort((a, b) => {
        const av = withScore(a).avg, bv = withScore(b).avg;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av - bv;
      });
    case "disagreement":
      return copy.sort((a, b) => {
        const as = withScore(a).scores, bs = withScore(b).scores;
        const ad = as.length === 2 ? Math.abs(as[0] - as[1]) : -1;
        const bd = bs.length === 2 ? Math.abs(bs[0] - bs[1]) : -1;
        return bd - ad;
      });
    default:
      return copy;
  }
}

statusToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".status-opt");
  if (!btn) return;
  statusToggle.querySelectorAll(".status-opt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentStatusView = btn.dataset.status;
  sortRow.classList.toggle("hidden", currentStatusView !== "watched");
  renderMovies();
});

sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  renderMovies();
});

typeTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  typeTabs.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  currentFilter = btn.dataset.type;
  renderMovies();
});

function buildMovieCard(movie) {
  const card = document.createElement("div");
  card.className = "movie-card";
  const isWatchlist = (movie.status || "watched") === "watchlist";

  const ratings = movie.ratings || {};
  const scores = Object.values(ratings).map(r => r.score).filter(s => typeof s === "number");
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";

  const header = document.createElement("div");
  header.className = "movie-card-header";
  header.innerHTML = `
    <img class="movie-poster" src="${movie.posterUrl || ''}" onerror="this.style.visibility='hidden'">
    <div class="movie-info">
      <h3>${escapeHtml(movie.title)}<span class="type-badge">${TYPE_LABELS[movie.type || "movie"]}</span></h3>
      ${isWatchlist
        ? `<span class="watchlist-tag">📌 В планах</span>`
        : `<div class="date">${movie.date || ""}</div><span class="avg-badge">★ ${avg}</span>`}
    </div>
  `;
  header.addEventListener("click", () => {
    card.classList.toggle("expanded");
  });

  const body = document.createElement("div");
  body.className = "movie-card-body";

  if (!isWatchlist) {
    Object.entries(USERS).forEach(([uid, info]) => {
      const r = ratings[uid];
      const row = document.createElement("div");
      row.className = "user-rating-row";
      row.innerHTML = `
        <div>
          <div class="name">${info.name}</div>
          ${r
            ? `<div class="comment">${escapeHtml(r.comment || "")}</div>`
            : `<div class="no-rating">пока нет оценки</div>`}
        </div>
        ${r ? `<div class="score">${r.score}</div>` : ""}
      `;
      body.appendChild(row);
    });
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (isWatchlist) {
    const watchedBtn = document.createElement("button");
    watchedBtn.className = "btn btn-primary";
    watchedBtn.textContent = "✅ Просмотрено";
    watchedBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "movies", movie.id), {
        status: "watched",
        date: new Date().toISOString().slice(0, 10)
      });
    });
    actions.appendChild(watchedBtn);
  } else {
    const rateBtn = document.createElement("button");
    rateBtn.className = "btn btn-primary";
    const myRating = ratings[currentUser.uid];
    rateBtn.textContent = myRating ? "Изменить мою оценку" : "Оценить";
    rateBtn.addEventListener("click", () => openRatingModal(movie));
    actions.appendChild(rateBtn);
  }

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary";
  editBtn.textContent = "Ред.";
  editBtn.addEventListener("click", () => openMovieModal(movie));
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-danger";
  delBtn.textContent = "Удалить";
  delBtn.addEventListener("click", () => {
    if (confirm(`Удалить "${movie.title}"?`)) {
      deleteDoc(doc(db, "movies", movie.id));
    }
  });
  actions.appendChild(delBtn);

  body.appendChild(actions);
  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// ==============================
// 6. МОДАЛКА: ДОБАВИТЬ / РЕДАКТИРОВАТЬ ФИЛЬМ
// ==============================
addMovieFab.addEventListener("click", () => openMovieModal(null));
movieCancelBtn.addEventListener("click", () => movieModal.classList.add("hidden"));

function openMovieModal(movie) {
  editingMovieId = movie ? movie.id : null;
  pendingPosterUrl = movie ? (movie.posterUrl || "") : "";
  pendingType = movie ? (movie.type || "movie") : "movie";
  pendingStatus = movie ? (movie.status || "watched") : currentStatusView;

  movieModalTitle.textContent = movie ? "Редактировать" : "Добавить";
  movieTitleInput.value = movie ? movie.title : "";
  movieDateInput.value = movie ? movie.date : new Date().toISOString().slice(0, 10);
  posterUrlInput.value = pendingPosterUrl;
  posterPreview.innerHTML = pendingPosterUrl ? `<img src="${pendingPosterUrl}">` : "";

  movieTypeSelect.querySelectorAll(".type-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === pendingType);
  });
  movieStatusSelect.querySelectorAll(".type-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === pendingStatus);
  });
  dateFieldWrap.classList.toggle("hidden", pendingStatus === "watchlist");

  movieModal.classList.remove("hidden");
}

movieStatusSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".type-opt");
  if (!btn) return;
  pendingStatus = btn.dataset.status;
  movieStatusSelect.querySelectorAll(".type-opt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  dateFieldWrap.classList.toggle("hidden", pendingStatus === "watchlist");
});

movieTypeSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".type-opt");
  if (!btn) return;
  pendingType = btn.dataset.type;
  movieTypeSelect.querySelectorAll(".type-opt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
});

// Ручной ввод ссылки - превью обновляется на лету
posterUrlInput.addEventListener("input", () => {
  pendingPosterUrl = posterUrlInput.value.trim();
  posterPreview.innerHTML = pendingPosterUrl ? `<img src="${pendingPosterUrl}" onerror="this.style.opacity=0.3">` : "";
});

// Необязательный быстрый поиск постера по названию через OMDb
fetchPosterBtn.addEventListener("click", async () => {
  const title = movieTitleInput.value.trim();
  if (!title) return alert("Сначала введи название");
  posterPreview.innerHTML = "Ищу...";
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.Poster && data.Poster !== "N/A") {
      pendingPosterUrl = data.Poster;
      posterUrlInput.value = pendingPosterUrl;
      posterPreview.innerHTML = `<img src="${pendingPosterUrl}">`;
    } else {
      posterPreview.innerHTML = "";
      alert("OMDb не нашёл постер — вставь ссылку вручную");
    }
  } catch (e) {
    posterPreview.innerHTML = "";
    alert("Ошибка поиска постера — вставь ссылку вручную");
  }
});

movieSaveBtn.addEventListener("click", async () => {
  const title = movieTitleInput.value.trim();
  const date = pendingStatus === "watchlist" ? "" : movieDateInput.value;
  if (!title) return alert("Введи название");

  movieSaveBtn.disabled = true;
  movieSaveBtn.textContent = "Сохраняю...";

  try {
    const posterUrl = posterUrlInput.value.trim();

    if (editingMovieId) {
      await updateDoc(doc(db, "movies", editingMovieId), {
        title, date, posterUrl, type: pendingType, status: pendingStatus
      });
    } else {
      await addDoc(collection(db, "movies"), {
        title, date, posterUrl, type: pendingType, status: pendingStatus,
        ratings: {},
        createdAt: serverTimestamp()
      });
    }
    movieModal.classList.add("hidden");
  } catch (e) {
    alert("Не удалось сохранить: " + e.message);
  } finally {
    movieSaveBtn.disabled = false;
    movieSaveBtn.textContent = "Сохранить";
  }
});

// ==============================
// 7. МОДАЛКА: МОЯ ОЦЕНКА
// ==============================
function openRatingModal(movie) {
  ratingTargetMovieId = movie.id;
  const mine = (movie.ratings || {})[currentUser.uid];
  ratingScoreInput.value = mine ? mine.score : "";
  ratingCommentInput.value = mine ? (mine.comment || "") : "";
  ratingModal.classList.remove("hidden");
}

ratingCancelBtn.addEventListener("click", () => ratingModal.classList.add("hidden"));

ratingSaveBtn.addEventListener("click", async () => {
  const score = parseFloat(ratingScoreInput.value);
  if (isNaN(score) || score < 0 || score > 10) return alert("Оценка должна быть от 0 до 10");

  await updateDoc(doc(db, "movies", ratingTargetMovieId), {
    [`ratings.${currentUser.uid}`]: {
      score,
      comment: ratingCommentInput.value.trim(),
      updatedAt: serverTimestamp()
    }
  });
  ratingModal.classList.add("hidden");
});

// ==============================
// 8. СТАТИСТИКА
// ==============================
statsBtn.addEventListener("click", () => {
  statsBody.innerHTML = buildStatsHtml();
  statsModal.classList.remove("hidden");
});
statsCloseBtn.addEventListener("click", () => statsModal.classList.add("hidden"));

function buildStatsHtml() {
  const watched = currentMovies.filter(m => (m.status || "watched") === "watched");
  const byType = { movie: 0, series: 0, cartoon: 0 };
  watched.forEach(m => { byType[m.type || "movie"]++; });

  const userStats = {};
  Object.keys(USERS).forEach(uid => { userStats[uid] = []; });
  watched.forEach(m => {
    Object.entries(m.ratings || {}).forEach(([uid, r]) => {
      if (userStats[uid] && typeof r.score === "number") userStats[uid].push(r.score);
    });
  });

  const avgOf = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "—";

  let html = `<div class="stats-section-title">Всего просмотрено</div>`;
  html += statRow("Фильмов", byType.movie);
  html += statRow("Сериалов", byType.series);
  html += statRow("Мультфильмов", byType.cartoon);
  html += statRow("Всего", watched.length);

  html += `<div class="stats-section-title">Средняя оценка</div>`;
  Object.entries(USERS).forEach(([uid, info]) => {
    html += statRow(info.name, avgOf(userStats[uid]));
  });

  const watchlistCount = currentMovies.filter(m => (m.status || "watched") === "watchlist").length;
  html += `<div class="stats-section-title">В планах</div>`;
  html += statRow("Watchlist", watchlistCount);

  return html;
}

function statRow(label, value) {
  return `<div class="stat-row"><span class="label">${escapeHtml(String(label))}</span><span class="value">${escapeHtml(String(value))}</span></div>`;
}

// ==============================
// 9. УТИЛИТЫ
// ==============================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
