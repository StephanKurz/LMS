const form = document.getElementById("search-form");
const input = document.getElementById("isbn-input");
const resetBtn = document.getElementById("reset-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const coverImg = document.getElementById("cover-img");
const titleEl = document.getElementById("detail-title");
const authorsEl = document.getElementById("detail-authors");
const detailList = document.getElementById("detail-list");

const PLACEHOLDER_COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="260">
       <rect width="100%" height="100%" fill="#ddd"/>
       <text x="50%" y="50%" font-size="14" fill="#888" text-anchor="middle" dy=".3em">Kein Cover</text>
     </svg>`
  );

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSearch();
});

resetBtn.addEventListener("click", resetView);

function resetView() {
  input.value = "";
  hide(statusEl);
  hide(resultEl);
  statusEl.classList.remove("error");
  statusEl.textContent = "";
  detailList.innerHTML = "";
  input.focus();
}

function normalizeIsbn(raw) {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

function isValidIsbn(isbn) {
  return isbn.length === 10 || isbn.length === 13;
}

async function handleSearch() {
  const isbn = normalizeIsbn(input.value);

  if (!isValidIsbn(isbn)) {
    showStatus("Bitte eine gültige ISBN-10 oder ISBN-13 eingeben.", true);
    hide(resultEl);
    return;
  }

  showStatus("Suche läuft …", false);
  hide(resultEl);

  const [openLibraryResult, googleBooksResult] = await Promise.allSettled([
    fetchOpenLibrary(isbn),
    fetchGoogleBooks(isbn),
  ]);

  const openLibrary =
    openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null;
  const googleBooks =
    googleBooksResult.status === "fulfilled" ? googleBooksResult.value : null;

  if (!openLibrary && !googleBooks) {
    showStatus(
      "Keine Daten zu dieser ISBN gefunden. Bitte ISBN prüfen.",
      true
    );
    return;
  }

  hide(statusEl);
  renderResult(isbn, openLibrary, googleBooks);
}

async function fetchOpenLibrary(isbn) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Open Library request failed");
  const data = await response.json();
  const entry = data[`ISBN:${isbn}`];
  return entry || null;
}

async function fetchGoogleBooks(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Books request failed");
  const data = await response.json();
  if (!data.items || data.items.length === 0) return null;
  return data.items[0].volumeInfo || null;
}

function renderResult(isbn, openLibrary, googleBooks) {
  const title = openLibrary?.title || googleBooks?.title || "Unbekannter Titel";

  const authors =
    openLibrary?.authors?.map((a) => a.name) ||
    googleBooks?.authors ||
    [];

  const publisher =
    openLibrary?.publishers?.map((p) => p.name).join(", ") ||
    googleBooks?.publisher ||
    null;

  const publishDate = openLibrary?.publish_date || googleBooks?.publishedDate || null;

  const pageCount = openLibrary?.number_of_pages || googleBooks?.pageCount || null;

  const language = googleBooks?.language || null;

  const subjects =
    openLibrary?.subjects?.map((s) => s.name).slice(0, 8) ||
    googleBooks?.categories ||
    [];

  const description =
    typeof googleBooks?.description === "string" ? googleBooks.description : null;

  const infoLink = openLibrary?.url || googleBooks?.infoLink || null;

  titleEl.textContent = title;
  authorsEl.textContent = authors.length ? authors.join(", ") : "Autor unbekannt";

  detailList.innerHTML = "";
  addDetail("Verlag", publisher);
  addDetail("Erscheinungsdatum", publishDate);
  addDetail("Seitenzahl", pageCount ? String(pageCount) : null);
  addDetail("Sprache", language);
  addDetail("Themen", subjects.length ? subjects.join(", ") : null);
  addDetail("ISBN", isbn);
  addDetail("Beschreibung", description);
  if (infoLink) {
    const dt = document.createElement("dt");
    dt.textContent = "Mehr Infos";
    const dd = document.createElement("dd");
    const a = document.createElement("a");
    a.href = infoLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = infoLink;
    dd.appendChild(a);
    detailList.appendChild(dt);
    detailList.appendChild(dd);
  }

  setCoverImage(isbn, googleBooks);

  show(resultEl);
}

function addDetail(label, value) {
  if (!value) return;
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  detailList.appendChild(dt);
  detailList.appendChild(dd);
}

function setCoverImage(isbn, googleBooks) {
  const openLibraryCover = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  const googleThumbnail = googleBooks?.imageLinks?.thumbnail?.replace(
    "http://",
    "https://"
  );

  const useGoogleOrPlaceholder = () => {
    coverImg.onload = null;
    coverImg.onerror = null;
    if (googleThumbnail) {
      coverImg.onerror = () => {
        coverImg.onerror = null;
        coverImg.src = PLACEHOLDER_COVER;
      };
      coverImg.src = googleThumbnail;
    } else {
      coverImg.src = PLACEHOLDER_COVER;
    }
  };

  // Open Library returns a tiny 1x1 placeholder (not a 404) when no cover exists.
  coverImg.onload = () => {
    if (coverImg.naturalWidth <= 1) {
      useGoogleOrPlaceholder();
    } else {
      coverImg.onload = null;
      coverImg.onerror = null;
    }
  };
  coverImg.onerror = useGoogleOrPlaceholder;
  coverImg.src = openLibraryCover;
}

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
  show(statusEl);
}

function hide(el) {
  el.hidden = true;
}

function show(el) {
  el.hidden = false;
}
