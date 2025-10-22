(() => {
  const CONTACT = {
    phoneE164: "+306932647201",
    whatsappNumber: "306932647201",
    email: "rodipasx@gmail.com",
  };

  const domReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  };

  const setContactLinks = () => {
    document.querySelectorAll('[data-contact="phone"]').forEach((el) => {
      el.setAttribute("href", `tel:${CONTACT.phoneE164}`);
    });

    document
      .querySelectorAll('[data-contact="whatsapp"]').forEach((el) => {
        el.setAttribute("href", `https://wa.me/${CONTACT.whatsappNumber}`);
      });
  };

  const initRentalPrefill = () => {
    const buttons = document.querySelectorAll("[data-prefill-rental]");
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      const value = btn.dataset.prefillRental;
      const targetSelector = btn.dataset.prefillTarget || "[data-booking-form]";

      btn.addEventListener("click", () => {
        document.querySelectorAll(targetSelector).forEach((targetForm) => {
          const rentalField = targetForm.querySelector('[name="rental"]');
          if (rentalField) rentalField.value = value;
        });
      });
    });
  };

  const buildMailtoLink = (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const subject = `Booking request — ${data.rental ?? ""}`;
    const body = [
      `Rental: ${data.rental ?? ""}`,
      `Check-in: ${data.checkin ?? ""}`,
      `Check-out: ${data.checkout ?? ""}`,
      `Guests: ${data.guests ?? ""}`,
      `Name: ${data.name ?? ""}`,
      `Email: ${data.email ?? ""}`,
      data.message ? `Notes: ${data.message}` : null,
    ]
      .filter(Boolean)
      .join("%0D%0A");

    return `mailto:${CONTACT.email}?subject=${encodeURIComponent(
      subject
    )}&body=${body}`;
  };

  const initBookingForms = () => {
    const forms = document.querySelectorAll("form[data-booking-form]");
    if (!forms.length) return;

    forms.forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        window.location.href = buildMailtoLink(form);
      });
    });
  };

  const updateYear = () => {
    document.querySelectorAll("#year").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });
  };

  const initLeafletMap = () => {
    if (typeof L === "undefined") return;
    const mapContainer = document.querySelector('[data-map="leaflet"]');
    if (!mapContainer) return;

    const center = [41.116112, 25.399783];
    const studio = [41.112899, 25.408472];

    const map = L.map(mapContainer).setView(center, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.marker(center).addTo(map).bindPopup("Blue Dream").openPopup();
    L.marker(studio).addTo(map).bindPopup("Studio 9");
  };

  domReady(() => {
    setContactLinks();
    initRentalPrefill();
    initBookingForms();
    updateYear();
    initLeafletMap();
  });
})();
