// Prefill “Rental” when clicking “Request dates” buttons
document.querySelectorAll('a.btn[href="#contact"][data-rental]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const v = btn.getAttribute('data-rental');
    const select = document.getElementById('rental');
    if(select){ select.value = v; }
  });
});

// Mailto builder for static submit
const form = document.getElementById('bookingForm');
form?.addEventListener('submit', (e)=>{
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
    data.message ? `Notes: ${data.message}` : null
  ].filter(Boolean).join('%0D%0A');

  // TODO: replace with your preferred email
  const to = 'rodipasx@gmail.com';
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${body}`;
});

// Footer year
document.getElementById('year').textContent = String(new Date().getFullYear());
