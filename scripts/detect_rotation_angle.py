#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "AntiCAP",
# ]
# ///
"""Detect the rotation angle needed to correct a photo, using AntiCAP.

Run with: uv run scripts/detect_rotation_angle.py <image_path>
"""

import argparse
import base64


def detect_angle(image_path: str) -> int:
    import AntiCAP

    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")

    handler = AntiCAP.Handler(show_banner=False)
    return handler.Single_Rotate(img_base64=image_base64)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detect the rotation angle needed to correct a photo."
    )
    parser.add_argument("image_path", help="Path to the photo")
    args = parser.parse_args()

    angle = detect_angle(args.image_path)
    print(angle)


if __name__ == "__main__":
    main()
