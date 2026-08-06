# CAMERA_WATERMARK_UI_SPEC.md

# Professional Camera & Watermark UI Specification

Version 3.0

---

# Objective

Transform the camera into a professional field inspection camera while preserving the optimized performance architecture.

Performance requirements are defined in CAMERA_PERFORMANCE_SPEC.md and must not be violated.

---

# Watermark Style

Professional

Compact

Clean

Readable

Modern

Semi-transparent

Bottom Left

Pixel-identical between preview and saved image.

---

# Watermark Layout

Site ID

Date & Time

Latitude

Longitude

GPS Accuracy

Reverse Geocoded Address

Example

SIK/001

05-Aug-2026 18:02

27.608123N 75.151703E

Accuracy : ±12 m

Police Lines

Sikar

Jaipur Division

Rajasthan

Offline

Hide address only.

Always display coordinates.

---

# Watermark Appearance

Background

Semi-transparent Black

Opacity

45–55%

Rounded Corners

12 px

Shadow

Small

Padding

10 px

Text

Bright Green

Bold

Sans Serif

Shadow

Small

---

# Watermark Size

User selectable

Small

Medium

Large

Small

≈10% Image Width

Medium

≈14%

Large

≈18%

Scale automatically with image resolution.

---

# Watermark Settings

Camera Settings

↓

Watermark

Provide

Watermark Size

Small

Medium

Large

Watermark Position

Bottom Left

Bottom Right

Opacity

20%

↓

80%

Text Color

Green

White

Yellow

Show GPS Accuracy

ON/OFF

Show Reverse Address

ON/OFF

Date Format

05-Aug-2026

05/08/2026

2026-08-05

Time Format

12 Hour

24 Hour

Remember user preferences.

---

# GPS Accuracy

Header

🟢 High

≤15 m

🟡 Medium

16–30 m

🔴 Low

>30 m

Watermark

Accuracy : ±12 m

---

# Reverse Geocoding

Internet Available

Resolve Address

Cache Address

Reuse cache if movement ≤10 m

Internet Unavailable

Hide Address

Show Coordinates

Never block capture

Never display errors

---

# Smart GPS Refresh

Refresh only when

GPS older than 10 seconds

OR

Accuracy >25 m

OR

Movement >10 m

OR

Tap To Focus

Run in background.

Never freeze preview.

---

# Tap To Focus

Tap

↓

Focus

↓

Auto Exposure

↓

GPS Refresh

↓

Update Live Watermark

Show focus animation.

---

# Camera Features

Flash

Auto

On

Off

Front Camera

Rear Camera

Pinch Zoom

Manual Exposure

Aspect Ratio

4:3

16:9

Highest Quality Capture

Preserve EXIF

Offline First

---

# Folder Structure

DCIM

└── ACCC Inspection

└── <District>_<ProjectName>

Automatically

Create

Rename

Prevent duplicates

---

# UI Principles

Large touch targets

Outdoor readable

High contrast

One-handed operation

Minimal controls

Fast response

---

# Accessibility

Readable text

Large buttons

Color + text indicators

Dark mode friendly

---

# Acceptance Criteria

✓ Watermark matches reference style

✓ WYSIWYG preview

✓ Configurable size

✓ Configurable position

✓ Configurable opacity

✓ Configurable colors

✓ GPS accuracy displayed

✓ Reverse geocoding only when online

✓ Coordinates always displayed

✓ Smart GPS refresh

✓ Tap-to-focus refreshes GPS

✓ Offline inspections work

✓ Existing inspection workflow preserved

✓ Performance remains within CAMERA_PERFORMANCE_SPEC.md
