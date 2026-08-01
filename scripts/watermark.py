import argparse
import os
import sys
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont


def format_datetime(dt: datetime) -> str:
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    h12 = dt.hour % 12 or 12
    ampm = "PM" if dt.hour >= 12 else "AM"
    return f"{dt.day:02d}-{months[dt.month - 1]}-{dt.year} {h12}:{dt.minute:02d} {ampm}"


def format_latlng(lat: float, lng: float) -> str:
    return f"{lat:.6f}, {lng:.6f}"


def get_exif_gps(image_path: str) -> tuple[float | None, float | None]:
    img = Image.open(image_path)
    exif = img.getexif()
    img.close()

    gps_info = exif.get(0x8825) or exif.get(34853)
    if not gps_info:
        return None, None

    def to_degrees(values) -> float:
        d, m, s = values
        return float(d) + float(m) / 60.0 + float(s) / 3600.0

    lat_ref = gps_info.get(1)
    lat_vals = gps_info.get(2)
    lng_ref = gps_info.get(3)
    lng_vals = gps_info.get(4)

    if not lat_vals or not lng_vals:
        return None, None

    lat = to_degrees(lat_vals)
    lng = to_degrees(lng_vals)

    if lat_ref == "S":
        lat = -lat
    if lng_ref == "W":
        lng = -lng

    return lat, lng


def main() -> None:
    parser = argparse.ArgumentParser(description="Add watermark to inspection photo")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("--output", "-o", help="Output path (default: auto-generated in ACCC Inspection folder)")
    parser.add_argument("--pole-id", required=True, help="Pole ID (Photo ID)")
    parser.add_argument("--block", required=True, help="Block name (Location)")
    parser.add_argument("--district", required=True, help="District name (City)")
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument("--lat", type=float, help="Latitude (default: read from EXIF)")
    parser.add_argument("--lng", type=float, help="Longitude (default: read from EXIF)")
    parser.add_argument("--timestamp", help="Timestamp (ISO format, default: file mtime)")
    parser.add_argument("--font", help="Path to .ttf font file")
    parser.add_argument("--db", help="SQLite project DB path (reads pole_id, block from Inspections table)")
    parser.add_argument("--inspection-id", type=int, help="Inspection ID (used with --db)")
    args = parser.parse_args()

    lat = args.lat
    lng = args.lng
    if lat is None or lng is None:
        exif_lat, exif_lng = get_exif_gps(args.input)
        lat = lat if lat is not None else exif_lat
        lng = lng if lng is not None else exif_lng

    if lat is None or lng is None:
        print("Error: No GPS data available. Provide --lat and --lng or embed GPS in EXIF.")
        sys.exit(1)

    if args.timestamp:
        dt = datetime.fromisoformat(args.timestamp)
    else:
        mtime = os.path.getmtime(args.input)
        dt = datetime.fromtimestamp(mtime)

    pole_id = args.pole_id
    block = args.block
    district = args.district
    project_name = args.project

    img = Image.open(args.input).convert("RGBA")
    w, h = img.size
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype(args.font, 20) if args.font else ImageFont.load_default()
    except (IOError, OSError):
        font = ImageFont.load_default()

    lines = [
        f"{pole_id}",
        f"{district}, {block}",
        format_datetime(dt),
        format_latlng(lat, lng),
    ]

    line_height = 28
    text_x_pad = 14
    text_y_pad = 10
    rect_x_pad = 10

    max_text_width = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        if lw > max_text_width:
            max_text_width = lw

    rect_w = max_text_width + rect_x_pad * 2
    rect_h = len(lines) * line_height + text_y_pad * 2
    padding = 20

    rx = padding
    ry = h - rect_h - padding

    draw.rectangle([rx, ry, rx + rect_w, ry + rect_h], fill=(0, 0, 0, 153))

    text_color = (118, 255, 3, 255)
    for i, line in enumerate(lines):
        ty = ry + text_y_pad + i * line_height
        draw.text((rx + rect_x_pad, ty), line, fill=text_color, font=font)

    result = img.convert("RGB")

    clean_district = "".join(c for c in district if c.isalnum())[:20] or "Unknown"
    clean_block = "".join(c for c in block if c.isalnum())[:20] or "NA"
    clean_pole = "".join(c for c in pole_id if c.isalnum())[:20] or "NA"

    month_codes = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                   "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    fname = f"{clean_district}_{clean_block}_{clean_pole}_{dt.day:02d}{month_codes[dt.month - 1]}{dt.year}_{dt.hour:02d}{dt.minute:02d}{dt.second:02d}.jpg"

    if args.output:
        out_path = args.output
    else:
        clean_project = "".join(c for c in project_name if c.isalnum())
        base_dir = os.path.join(os.path.dirname(args.input) or ".", "ACCC Inspection")
        folder = os.path.join(base_dir, f"{clean_district}_{clean_project}")
        os.makedirs(folder, exist_ok=True)
        out_path = os.path.join(folder, fname)

    result.save(out_path, quality=95)
    img.close()

    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
