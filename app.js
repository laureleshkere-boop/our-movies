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
  appId: "1:205244333759:web:d33d7e133cf8d2ade1d00a",
  measurementId: "G-5LT07NHMGH"
};

// Ключ OMDb для поиска постеров (бесплатный, получить на https://www.omdbapi.com/apikey.aspx)
const OMDB_API_KEY = "3b3dd1df";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
const fetchPosterBtn = document.getElementById("fetch-poster-btn");
const posterPreview = document.getElementById("poster-preview");
const movieCancelBtn = document.getElementById("movie-cancel-btn");
const movieSaveBtn = document.getElementById("movie-save-btn");

const ratingModal = document.getElementById("rating-modal");
const ratingScoreInput = document.getElementById("rating-score-input");
const ratingCommentInput = document.getElementById("rating-comment-input");
const ratingCancelBtn = document.getElementById("rating-cancel-btn");
const ratingSaveBtn = document.getElementById("rating-save-btn");

let currentUser = null;
let currentMovies = [];
let editingMovieId = null;   // если не null - редактируем существующий фильм (название/дата/постер)
let pendingPosterUrl = "";
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
  currentMovies.forEach(movie => {
    movieListEl.appendChild(buildMovieCard(movie));
  });
}

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
      <h3>${escapeHtml(movie.title)}</h3>
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
  movieModalTitle.textContent = movie ? "Редактировать фильм" : "Новый фильм";
  movieTitleInput.value = movie ? movie.title : "";
  movieDateInput.value = movie ? movie.date : new Date().toISOString().slice(0, 10);
  posterPreview.innerHTML = pendingPosterUrl ? `<img src="${pendingPosterUrl}">` : "";
  movieModal.classList.remove("hidden");
}

fetchPosterBtn.addEventListener("click", async () => {
  const title = movieTitleInput.value.trim();
  if (!title) return;
  posterPreview.innerHTML = "Ищу...";
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.Poster && data.Poster !== "N/A") {
      pendingPosterUrl = data.Poster;
      posterPreview.innerHTML = `<img src="${pendingPosterUrl}">`;
    } else {
      posterPreview.innerHTML = "Постер не найден";
    }
  } catch (e) {
    posterPreview.innerHTML = "Ошибка поиска постера";
  }
});

movieSaveBtn.addEventListener("click", async () => {
  const title = movieTitleInput.value.trim();
  const date = movieDateInput.value;
  if (!title) return alert("Введи название фильма");

  if (editingMovieId) {
    await updateDoc(doc(db, "movies", editingMovieId), {
      title, date, posterUrl: pendingPosterUrl
    });
  } else {
    await addDoc(collection(db, "movies"), {
      title, date, posterUrl: pendingPosterUrl,
      ratings: {},
      createdAt: serverTimestamp()
    });
  }
  movieModal.classList.add("hidden");
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
