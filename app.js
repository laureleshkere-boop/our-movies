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
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const TYPE_LABELS = { movie: "🎬 Фильм", series: "📺 Сериал", cartoon: "🧸 Мультфильм" };
const POSTER_W = 300, POSTER_H = 450; // соотношение постера 2:3

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
const posterFileInput = document.getElementById("poster-file-input");
const posterCanvas = document.getElementById("poster-canvas");
const movieTypeSelect = document.getElementById("movie-type-select");
const movieCancelBtn = document.getElementById("movie-cancel-btn");
const movieSaveBtn = document.getElementById("movie-save-btn");
const typeTabs = document.getElementById("type-tabs");

const ratingModal = document.getElementById("rating-modal");
const ratingScoreInput = document.getElementById("rating-score-input");
const ratingCommentInput = document.getElementById("rating-comment-input");
const ratingCancelBtn = document.getElementById("rating-cancel-btn");
const ratingSaveBtn = document.getElementById("rating-save-btn");

let currentUser = null;
let currentMovies = [];
let editingMovieId = null;   // если не null - редактируем существующий фильм (название/дата/постер)
let pendingPosterUrl = "";   // URL уже сохранённого постера (при редактировании)
let pendingPosterBlob = null; // новый обрезанный файл постера, ждущий загрузки
let pendingType = "movie";
let currentFilter = "all";
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
  const q = query(collection(db, "movies"), orderBy("date", "desc"));
  onSnapshot(q, (snapshot) => {
    currentMovies = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMovies();
  });
}

function renderMovies() {
  movieListEl.innerHTML = "";
  const filtered = currentFilter === "all"
    ? currentMovies
    : currentMovies.filter(m => (m.type || "movie") === currentFilter);
  filtered.forEach(movie => {
    movieListEl.appendChild(buildMovieCard(movie));
  });
}

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

  const ratings = movie.ratings || {};
  const scores = Object.values(ratings).map(r => r.score).filter(s => typeof s === "number");
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";

  const header = document.createElement("div");
  header.className = "movie-card-header";
  header.innerHTML = `
    <img class="movie-poster" src="${movie.posterUrl || ''}" onerror="this.style.visibility='hidden'">
    <div class="movie-info">
      <h3>${escapeHtml(movie.title)}<span class="type-badge">${TYPE_LABELS[movie.type || "movie"]}</span></h3>
      <div class="date">${movie.date || ""}</div>
      <span class="avg-badge">★ ${avg}</span>
    </div>
  `;
  header.addEventListener("click", () => {
    card.classList.toggle("expanded");
  });

  const body = document.createElement("div");
  body.className = "movie-card-body";

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

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const rateBtn = document.createElement("button");
  rateBtn.className = "btn btn-primary";
  const myRating = ratings[currentUser.uid];
  rateBtn.textContent = myRating ? "Изменить мою оценку" : "Оценить";
  rateBtn.addEventListener("click", () => openRatingModal(movie));
  actions.appendChild(rateBtn);

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary";
  editBtn.textContent = "Ред. фильм";
  editBtn.addEventListener("click", () => openMovieModal(movie));
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-danger";
  delBtn.textContent = "Удалить";
  delBtn.addEventListener("click", () => {
    if (confirm(`Удалить "${movie.title}" целиком (обе оценки)?`)) {
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
  pendingPosterBlob = null;
  pendingType = movie ? (movie.type || "movie") : "movie";

  movieModalTitle.textContent = movie ? "Редактировать" : "Добавить";
  movieTitleInput.value = movie ? movie.title : "";
  movieDateInput.value = movie ? movie.date : new Date().toISOString().slice(0, 10);
  posterPreview.innerHTML = pendingPosterUrl ? `<img src="${pendingPosterUrl}">` : "";
  posterFileInput.value = "";

  movieTypeSelect.querySelectorAll(".type-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === pendingType);
  });

  movieModal.classList.remove("hidden");
}

movieTypeSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".type-opt");
  if (!btn) return;
  pendingType = btn.dataset.type;
  movieTypeSelect.querySelectorAll(".type-opt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
});

// Загрузка + автоматическая обрезка под постерный формат (2:3), центр-кроп
posterFileInput.addEventListener("change", () => {
  const file = posterFileInput.files[0];
  if (!file) return;

  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => {
    img.onload = () => {
      const ctx = posterCanvas.getContext("2d");
      ctx.clearRect(0, 0, POSTER_W, POSTER_H);

      // Считаем область кропа по центру, чтобы получить соотношение 2:3
      const targetRatio = POSTER_W / POSTER_H;
      const srcRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (srcRatio > targetRatio) {
        // картинка шире, чем нужно - обрезаем по бокам
        sh = img.height;
        sw = sh * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        // картинка выше, чем нужно - обрезаем сверху/снизу
        sw = img.width;
        sh = sw / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, POSTER_W, POSTER_H);

      posterCanvas.toBlob((blob) => {
        pendingPosterBlob = blob;
        posterPreview.innerHTML = `<img src="${URL.createObjectURL(blob)}">`;
      }, "image/jpeg", 0.85);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

movieSaveBtn.addEventListener("click", async () => {
  const title = movieTitleInput.value.trim();
  const date = movieDateInput.value;
  if (!title) return alert("Введи название");

  movieSaveBtn.disabled = true;
  movieSaveBtn.textContent = "Сохраняю...";

  try {
    let posterUrl = pendingPosterUrl;

    // Если выбран новый файл - заливаем в Storage и получаем ссылку
    if (pendingPosterBlob) {
      const filename = `posters/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, pendingPosterBlob);
      posterUrl = await getDownloadURL(storageRef);
    }

    if (editingMovieId) {
      await updateDoc(doc(db, "movies", editingMovieId), {
        title, date, posterUrl, type: pendingType
      });
    } else {
      await addDoc(collection(db, "movies"), {
        title, date, posterUrl, type: pendingType,
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
// 8. УТИЛИТЫ
// ==============================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
