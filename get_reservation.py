import sys
import re
from playwright.sync_api import sync_playwright

def run():
    res_code = sys.argv[1] if len(sys.argv) > 1 else "HMPN55JCZM"
    url = f"https://www.airbnb.com/hosting/reservations/details/{res_code}"

    with sync_playwright() as p:
        user_data_dir = "./airbnb_session"
        
        context = p.chromium.launch_persistent_context(
            user_data_dir, 
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        
        page = context.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        
        print(f"[*] Fetching {res_code}...")
        
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            full_text = page.evaluate("() => document.body.innerText")
            
            if "Log in" in full_text or "Είσοδος" in full_text:
                print("[!] Session expired. Run with headless=False to log in.")
                return

            print("\n" + "="*40)
            print(f"   RESERVATION: {res_code}")
            print("="*40)

            # Extraction Logic
            guest = re.search(r"(?:Confirmed|Επιβεβαιωμένη)\n([^\n]+)", full_text)
            
            # Matches "Apr 1 – 5 (4 nights)" or "1–5 Απρ (4 διανυκτερεύσεις)"
            dates = re.search(r"(\d+.*(?:nights|διανυκτερεύσεις)\))|([A-Z][a-z]{2}\s\d+.*nights\))", full_text)
            
            # Matches "Phone: +30..." or "Τηλέφωνο: +30..."
            phone = re.search(r"(?:Phone|Τηλέφωνο):\s?([^\n]+)", full_text)
            
            # Matches the date under "Booking date" or "Ημερομηνία κράτησης"
            booked_on = re.search(r"(?:Booking date|Ημερομηνία κράτησης)\n([^\n]+)", full_text)
            
            payouts = re.findall(r"(?:Total \(EUR\)|Σύνολο \(EUR\))\n(€\s?\d+[\.,]\d+)", full_text)

            print(f"Guest:      {guest.group(1) if guest else 'Not found'}")
            print(f"Phone:      {phone.group(1).strip() if phone else 'Not found'}")
            print(f"Stay:       {dates.group(0) if dates else 'Not found'}")
            print(f"Booked on:  {booked_on.group(1) if booked_on else 'Not found'}")
            print(f"Payout:     {payouts[-1] if payouts else 'Not found'}")
            print("="*40)

        except Exception as e:
            print(f"\n[!] Error: {e}")
        finally:
            context.close()

if __name__ == "__main__":
    run()
