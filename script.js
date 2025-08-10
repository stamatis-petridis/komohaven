// Prefill “Rental” when clicking “Request dates” buttons
document
  .querySelectorAll('a.btn[href="#contact"][data-rental]')
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-rental");
      const select = document.getElementById("rental");
      if (select) {
        select.value = v;
      }
    });
  });

// Mailto builder for static submit
const form = document.getElementById("bookingForm");
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const subject = `Booking request — ${data.rental}`;
  const body = [
    `Rental: ${data.rental}`,
    `Check-in: ${data.checkin}`,
    `Check-out: ${data.checkout}`,
    `Guests: ${data.guests}`,
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    data.message ? `Notes: ${data.message}` : null,
  ]
    .filter(Boolean)
    .join("%0D%0A");

  // TODO: replace with your preferred email
  const to = "rodipasx@gmail.com";
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(
    subject
  )}&body=${body}`;
});

// Footer year

document.getElementById("year").textContent = String(new Date().getFullYear());

// Leaflet map initialization
// Assumes there is a <div id="map"></div> in the HTML and Leaflet CSS/JS are loaded
const blueDreamCoords = [41.116112, 25.399783];
const studio9Coords = [41.112899, 25.408472];
const map = L.map("map").setView(blueDreamCoords, 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const blueDreamMarker = L.marker(blueDreamCoords)
  .addTo(map)
  .bindPopup("Blue Dream")
  .openPopup();
L.marker(studio9Coords).addTo(map).bindPopup("Studio 9");
