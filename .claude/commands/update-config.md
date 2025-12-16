# Update Site Configuration

Update the centralized configuration in `config.js`.

## Available Configuration Options

1. **Contact Information**
   - `phoneE164`: Phone number in E.164 format (e.g., "+30123456789")
   - `whatsappNumber`: WhatsApp number (digits only)
   - `email`: Email address

2. **Map Links** (per property: "blue-dream", "studio-9")
   - `profile`: Google Maps business profile URL
   - `embed`: Google Maps embed iframe URL

3. **Pricing** (values in CENTS)
   - `blue-dream`: Currently 4000 (€40/night)
   - `studio-9`: Currently 3000 (€30/night)

4. **Minimum Nights**
   - `blue-dream`: Currently 2
   - `studio-9`: Currently 3

## Your Task

1. Read the current `config.js` to show existing values
2. Ask which configuration to update
3. Make the requested changes
4. Explain that changes apply immediately via JavaScript (no HTML edits needed)

## Important
- Rates are stored in CENTS (multiply euros by 100)
- Phone must be E.164 format for tel: links to work
- WhatsApp number should be digits only (no + or spaces)
