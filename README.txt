ARMANI — interactive vehicle collection

INSTALL
1. Replace index.html in the root of shavera149/Armani-vercel.
2. Upload fleet.js beside index.html. Keep these exact filenames (no '(1)').
3. Commit changes and wait for Vercel deployment.
4. For admin editing of the fourth vehicle (Enus), run 05-fleet-enus.sql
   in Supabase > SQL Editor. Existing records and access policies are preserved.
   The four-card UI works without this migration; editing Enus via the admin
   form requires the migration.
5. Refresh the site.

EDIT VEHICLE DATA
Open fleet.js. The ARMANI_FLEET object at the top contains all four vehicles:
  name          Vehicle name
  category      Small category label
  description   Vehicle description
  image         Relative image path or HTTPS URL. Empty = admin-uploaded photo
                if available, otherwise the built-in vector placeholder.
  maxSpeedKmh   Maximum speed shown in both the card and shared speedometer
  drivetrain    Drive type
  seats         Number of seats
  className     Vehicle class
  color         Placeholder body color (#RRGGBB)

gaugeMaxKmh controls the scale of all speed tracks. Speeds are illustrative
until replaced with actual NG values. Fill width is clamped at 100%.

preferAdminContent: true
Uses the existing Supabase admin names, descriptions and screenshots when
available. Set false to manage those fields exclusively in fleet.js instead.
An explicitly configured image always takes priority over an uploaded image.

USE
Click a vehicle card (or focus it with Tab and press Enter/Space).
The shared display switches images, text, specs and speed.
The selection has a gold border and an accessible pressed state.
The dresscode tab continues using the existing gallery.
No new JS dependencies. Reduced-motion preference is respected.

VALIDATION
JavaScript syntax and DOM interaction tests passed: all four selections,
admin content updates, image-load failure fallback, tab changes, rapid
switching and speed-bar bounds. Production deployment and database migration
must be performed in your accounts; they were not executed by this update.
