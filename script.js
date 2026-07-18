const form = document.getElementById("search-form");
const input = document.getElementById("isbn-input");
const resetBtn = document.getElementById("reset-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const coverImg = document.getElementById("cover-img");
const titleEl = document.getElementById("detail-title");
const authorsEl = document.getElementById("detail-authors");
const sourceEl = document.getElementById("detail-source");
const detailList = document.getElementById("detail-list");
const versionEl = document.getElementById("app-version");

const GOOGLE_BOOKS_API_KEY = window.GOOGLE_BOOKS_API_KEY || "";
const APP_VERSION = window.APP_VERSION || "";

if (APP_VERSION) {
  versionEl.textContent = `Version ${APP_VERSION}`;
}

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
  sourceEl.textContent = "";
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

  const [openLibraryResult, googleBooksResult, dnbResult] = await Promise.allSettled([
    fetchOpenLibrary(isbn),
    fetchGoogleBooks(isbn),
    fetchDNB(isbn),
  ]);

  const openLibrary =
    openLibraryResult.status === "fulfilled" ? openLibraryResult.value : null;
  const googleBooks =
    googleBooksResult.status === "fulfilled" ? googleBooksResult.value : null;
  const dnb = dnbResult.status === "fulfilled" ? dnbResult.value : null;

  if (!openLibrary && !googleBooks && !dnb) {
    showStatus(
      "Keine Daten zu dieser ISBN gefunden. Bitte ISBN prüfen.",
      true
    );
    return;
  }

  hide(statusEl);
  renderResult(isbn, openLibrary, googleBooks, dnb);
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
  // country=DE is required: Google Books filters/omits results by the
  // geolocated request IP, which drops region-restricted German titles
  // when the request comes from a server/proxy with unclear geolocation.
  let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&country=DE`;
  // Without an API key, requests share a small, global anonymous quota
  // that can run dry regardless of who's asking (see config.example.js).
  if (GOOGLE_BOOKS_API_KEY) {
    url += `&key=${encodeURIComponent(GOOGLE_BOOKS_API_KEY)}`;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Google Books request failed");
  const data = await response.json();
  if (!data.items || data.items.length === 0) return null;
  return data.items[0].volumeInfo || null;
}

// Deutsche Nationalbibliothek: free, unauthenticated SRU catalog search
// covering nearly every German-language book (legal deposit library),
// used as the primary source for German titles that Google Books/Open
// Library often miss. Returns Dublin Core XML rather than JSON.
async function fetchDNB(isbn) {
  const url = `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=isbn%3D${isbn}&recordSchema=oai_dc&maximumRecords=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("DNB request failed");
  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  const byTag = (root, tag) =>
    Array.from(root.getElementsByTagName("*")).filter((el) => el.localName === tag);

  const numberOfRecords = byTag(doc, "numberOfRecords")[0]?.textContent;
  if (!numberOfRecords || Number(numberOfRecords) === 0) return null;

  const dcRoot = byTag(doc, "dc")[0];
  if (!dcRoot) return null;

  const texts = (tag) =>
    byTag(dcRoot, tag)
      .map((el) => el.textContent.trim())
      .filter(Boolean);

  const link = texts("identifier").find((id) => id.startsWith("http")) || null;

  return {
    title: texts("title")[0] || null,
    creators: texts("creator"),
    publisher: texts("publisher")[0] || null,
    date: texts("date")[0] || null,
    subjects: texts("subject"),
    description: texts("description")[0] || null,
    language: texts("language")[0] || null,
    link,
  };
}

function renderResult(isbn, openLibrary, googleBooks, dnb) {
  const title = dnb?.title || googleBooks?.title || openLibrary?.title || "Unbekannter Titel";

  const authors =
    (dnb?.creators?.length && dnb.creators) ||
    openLibrary?.authors?.map((a) => a.name) ||
    googleBooks?.authors ||
    [];

  const publisher =
    dnb?.publisher ||
    openLibrary?.publishers?.map((p) => p.name).join(", ") ||
    googleBooks?.publisher ||
    null;

  const publishDate =
    dnb?.date || openLibrary?.publish_date || googleBooks?.publishedDate || null;

  const pageCount = openLibrary?.number_of_pages || googleBooks?.pageCount || null;

  const language = dnb?.language || googleBooks?.language || null;

  const subjects =
    (dnb?.subjects?.length && dnb.subjects.slice(0, 8)) ||
    openLibrary?.subjects?.map((s) => s.name).slice(0, 8) ||
    googleBooks?.categories ||
    [];

  const description =
    (typeof dnb?.description === "string" && dnb.description) ||
    (typeof googleBooks?.description === "string" && googleBooks.description) ||
    null;

  const infoLink = dnb?.link || openLibrary?.url || googleBooks?.infoLink || null;

  titleEl.textContent = title;
  authorsEl.textContent = authors.length ? authors.join(", ") : "Autor unbekannt";

  const sources = [];
  if (dnb) sources.push("DNB");
  if (googleBooks) sources.push("Google Books");
  if (openLibrary) sources.push("Open Library");
  sourceEl.textContent = sources.length ? `Quelle: ${sources.join(", ")}` : "";

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

  const useOpenLibraryOrPlaceholder = () => {
    coverImg.onload = null;
    coverImg.onerror = null;
    coverImg.onload = () => {
      coverImg.onload = null;
      coverImg.onerror = null;
      // Open Library returns a tiny 1x1 placeholder (not a 404) when no cover exists.
      if (coverImg.naturalWidth <= 1) {
        coverImg.src = PLACEHOLDER_COVER;
      }
    };
    coverImg.onerror = () => {
      coverImg.onerror = null;
      coverImg.src = PLACEHOLDER_COVER;
    };
    coverImg.src = openLibraryCover;
  };

  if (googleThumbnail) {
    coverImg.onload = null;
    coverImg.onerror = useOpenLibraryOrPlaceholder;
    coverImg.src = googleThumbnail;
  } else {
    useOpenLibraryOrPlaceholder();
  }
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
